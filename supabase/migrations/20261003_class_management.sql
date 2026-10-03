-- Reversible classroom/student deletion preserves billing history.
alter table public.classes add column if not exists deleted_at timestamptz;
alter table public.class_members add column if not exists removed_at timestamptz;
create or replace function public.reserve_job(p_user uuid,p_class uuid,p_id uuid,p_kind text) returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.classes; m public.class_members; j public.generation_jobs; price integer;
begin
 select * into c from public.classes where id=p_class for update;
 if not found or c.deleted_at is not null then raise exception '班級不存在或已刪除'; end if;
 select * into m from public.class_members where class_id=p_class and user_id=p_user for update;
 if not found or m.removed_at is not null then raise exception '你不在此班級名單內'; end if;
 select * into j from public.generation_jobs where id=p_id;
 if found then
   if j.user_id<>p_user or j.class_id<>p_class or j.kind<>p_kind then raise exception '請求識別碼衝突'; end if;
   return to_jsonb(j)||jsonb_build_object('existing',true);
 end if;
 if not c.active or c.expires_at<now() then raise exception '班級已暫停或到期'; end if;
 if p_kind not in ('image','video') then raise exception '生成類型不正確'; end if;
 if exists(select 1 from public.generation_jobs where user_id=p_user and status in ('processing','review')) then raise exception '尚有未完成任務，請先等待或聯絡老師'; end if;
 price:=case when p_kind='image' then c.image_cost else c.video_cost end;
 if m.used+m.reserved+price>m.quota or c.used+c.reserved+price>c.total then raise exception '剩餘點數不足'; end if;
 update public.class_members set reserved=reserved+price where id=m.id;
 update public.classes set reserved=reserved+price where id=c.id;
 insert into public.generation_jobs(id,class_id,user_id,member_id,kind,cost) values(p_id,p_class,p_user,m.id,p_kind,price) returning * into j;
 insert into public.credit_transactions(member_id,job_id,kind,amount) values(m.id,p_id,'reserve',price);
 return to_jsonb(j)||jsonb_build_object('existing',false);
end $$;

create or replace function public.invite_students(p_class uuid,p_emails text[]) returns void language plpgsql security definer set search_path=public as $$
declare c public.classes; n integer; e text;
begin
 select * into c from public.classes where id=p_class for update;
 if not found or c.deleted_at is not null then raise exception '班級不存在或已刪除'; end if;
 select count(*) into n from (select distinct lower(trim(x)) email from unnest(p_emails) x) s where not exists(select 1 from public.class_members where class_id=p_class and email=s.email);
 if exists(select 1 from public.class_members where class_id=p_class and removed_at is not null and email in (select lower(trim(x)) from unnest(p_emails) x)) then raise exception '名單包含已移除學生，請使用恢復學生'; end if;
 if c.self_enrollment and (select count(*) from public.class_members where class_id=p_class and removed_at is null)+n>c.max_students then raise exception '班級名額已滿，請聯絡老師'; end if;
 if c.allocated+n*c.default_quota>c.total then raise exception '班級未分配點數不足'; end if;
 for e in select distinct lower(trim(x)) from unnest(p_emails) x loop
 insert into public.class_members(class_id,email,name,quota) values(p_class,e,split_part(e,'@',1),c.default_quota) on conflict(class_id,email) do nothing;
 end loop;
 update public.classes set allocated=allocated+n*c.default_quota where id=p_class;
end $$;

create or replace function public.set_quota(p_class uuid,p_member uuid,p_quota integer) returns void language plpgsql security definer set search_path=public as $$
declare c public.classes; m public.class_members; difference integer;
begin
 select * into c from public.classes where id=p_class for update;
 if not found or c.deleted_at is not null then raise exception '班級不存在或已刪除'; end if;
 select * into m from public.class_members where id=p_member and class_id=p_class for update;
 if not found or m.removed_at is not null then raise exception '學生不存在或已移除'; end if;
 difference:=p_quota-m.quota;
 if p_quota<m.used+m.reserved then raise exception '額度不可低於已使用及預扣點數'; end if;
 if c.allocated+difference>c.total then raise exception '班級未分配點數不足'; end if;
 update public.classes set allocated=allocated+difference where id=p_class;
 update public.class_members set quota=p_quota where id=p_member;
 insert into public.credit_transactions(member_id,kind,amount) values(p_member,'quota',difference);
end $$;

create or replace function public.claim_memberships(p_user uuid,p_email text,p_name text) returns void language plpgsql security definer set search_path=public as $$ begin
 update public.class_members set user_id=p_user,name=p_name where removed_at is null and email=lower(p_email) and (user_id is null or user_id=p_user);
end $$;

create or replace function public.join_class(p_class uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare c public.classes; m public.class_members; email_address text; student_name text; member_count integer;
begin
 select lower(email), coalesce(raw_user_meta_data->>'full_name','同學') into email_address, student_name
 from auth.users where id=p_user and email_confirmed_at is not null
 and (raw_app_meta_data->>'provider'='google' or raw_app_meta_data->'providers' ? 'google');
 if email_address is null then raise exception '請使用已驗證的 Google 帳號登入'; end if;
 select * into c from public.classes where id=p_class for update;
 if not found or c.deleted_at is not null then raise exception '班級不存在或已刪除'; end if;
 if not c.active or c.expires_at <= now() then raise exception '班級已暫停或到期'; end if;
 select * into m from public.class_members where class_id=p_class and (user_id=p_user or email=email_address) for update;
 if found then
   if m.removed_at is not null then raise exception '你已被移除此班級，請聯絡老師'; end if;
   if m.user_id is not null and m.user_id<>p_user then raise exception '此班級帳號已綁定其他使用者'; end if;
   update public.class_members set user_id=p_user,name=student_name where id=m.id;
   return m.id;
 end if;
 if not c.self_enrollment then raise exception '此班級未開放網址加入，請聯絡老師'; end if;
 select count(*) into member_count from public.class_members where class_id=p_class and removed_at is null;
 if member_count>=c.max_students then raise exception '班級名額已滿，請聯絡老師'; end if;
 if c.allocated+c.default_quota>c.total then raise exception '班級可分配點數不足，請聯絡老師'; end if;
 insert into public.class_members(class_id,user_id,email,name,quota)
 values(p_class,p_user,email_address,student_name,c.default_quota) returning * into m;
 update public.classes set allocated=allocated+c.default_quota where id=p_class;
 return m.id;
end $$;

create or replace function public.resolve_course(p_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.classes;
begin
 select * into c from public.classes where course_code=upper(trim(p_code)) and deleted_at is null and self_enrollment and active and expires_at>now();
 if not found then raise exception '課程代號不正確，或課程尚未開放'; end if;
 return jsonb_build_object('id',c.id,'name',c.name);
end $$;

create or replace function public.remove_student(p_class uuid,p_member uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare c public.classes; m public.class_members; returned integer;
begin
 select * into c from public.classes where id=p_class for update;
 if not found or c.deleted_at is not null then raise exception '班級不存在或已刪除'; end if;
 select * into m from public.class_members where id=p_member and class_id=p_class for update;
 if not found then raise exception '學生不存在'; end if;
 if m.removed_at is not null then return 0; end if;
 if m.reserved>0 or exists(select 1 from public.generation_jobs where member_id=p_member and status in ('processing','review')) then raise exception '學生有進行中或待確認任務，請先完成結算'; end if;
 returned:=m.quota-m.used;
 update public.class_members set quota=used,removed_at=now() where id=p_member;
 update public.classes set allocated=allocated-returned where id=p_class;
 insert into public.credit_transactions(member_id,kind,amount) values(p_member,'quota',-returned);
 return returned;
end $$;

create or replace function public.restore_student(p_class uuid,p_member uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c public.classes; m public.class_members; target integer; difference integer;
begin
 select * into c from public.classes where id=p_class for update;
 if not found or c.deleted_at is not null then raise exception '班級不存在或已刪除'; end if;
 select * into m from public.class_members where id=p_member and class_id=p_class for update;
 if not found then raise exception '學生不存在'; end if;
 if m.removed_at is null then return; end if;
 if (select count(*) from public.class_members where class_id=p_class and removed_at is null)>=c.max_students then raise exception '班級名額已滿'; end if;
 target:=greatest(c.default_quota,m.used);difference:=target-m.quota;
 if c.allocated+difference>c.total then raise exception '班級未分配點數不足'; end if;
 update public.class_members set quota=target,removed_at=null where id=p_member;
 update public.classes set allocated=allocated+difference where id=p_class;
 insert into public.credit_transactions(member_id,kind,amount) values(p_member,'quota',difference);
end $$;

create or replace function public.delete_class(p_class uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c public.classes;
begin
 select * into c from public.classes where id=p_class for update;
 if not found then raise exception '班級不存在'; end if;
 if c.deleted_at is not null then return; end if;
 if c.reserved>0 or exists(select 1 from public.generation_jobs where class_id=p_class and status in ('processing','review')) then raise exception '班級有進行中或待確認任務，請先完成結算'; end if;
 update public.classes set deleted_at=now(),active=false where id=p_class;
end $$;

create or replace function public.edit_class(p_class uuid,p_name text,p_description text,p_total integer,p_quota integer,p_capacity integer,p_image integer,p_video integer,p_expires timestamptz,p_code text,p_enrollment boolean) returns void
language plpgsql security definer set search_path=public as $$
declare c public.classes;
begin
 select * into c from public.classes where id=p_class for update;
 if not found or c.deleted_at is not null then raise exception '班級不存在或已刪除'; end if;
 if length(trim(p_name)) not between 1 and 80 or length(p_description)>160 or p_total<1 or p_quota<1 or p_image<1 or p_video<1 or p_capacity not between 1 and 200 or p_expires<=now() or upper(trim(p_code)) !~ '^[A-Z0-9]{6,8}$' then raise exception '請確認班級設定格式'; end if;
 if p_total<c.allocated or p_total<c.used+c.reserved then raise exception '總點數不可低於已分配、已使用及預扣點數'; end if;
 if p_quota>p_total then raise exception '每人額度不可超過班級總點數'; end if;
 if p_capacity<(select count(*) from public.class_members where class_id=p_class and removed_at is null) then raise exception '人數上限不可低於現有學生人數'; end if;
 update public.classes set name=trim(p_name),description=p_description,total=p_total,default_quota=p_quota,max_students=p_capacity,image_cost=p_image,video_cost=p_video,expires_at=p_expires,course_code=upper(trim(p_code)),self_enrollment=p_enrollment where id=p_class;
end $$;

-- Removed students lose access even if they retain a signed-in browser session.
drop policy own_membership on public.class_members;
create policy own_membership on public.class_members for select to authenticated using(user_id=auth.uid() and removed_at is null);
drop policy own_class on public.classes;
create policy own_class on public.classes for select to authenticated using(deleted_at is null and exists(select 1 from public.class_members m where m.class_id=classes.id and m.user_id=auth.uid() and m.removed_at is null));
revoke all on function public.remove_student(uuid,uuid),public.restore_student(uuid,uuid),public.delete_class(uuid),public.edit_class(uuid,text,text,integer,integer,integer,integer,integer,timestamptz,text,boolean) from public,anon,authenticated;
grant execute on function public.remove_student(uuid,uuid),public.restore_student(uuid,uuid),public.delete_class(uuid),public.edit_class(uuid,text,text,integer,integer,integer,integer,integer,timestamptz,text,boolean) to service_role;
