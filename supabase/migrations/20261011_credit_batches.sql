begin;
-- Purchased and bonus points share a single, immutable 180-day batch.
create table if not exists public.credit_batches (
 id uuid primary key, member_id uuid not null references public.class_members(id), class_id uuid not null references public.classes(id),
 purchased_points integer not null check(purchased_points>0), bonus_points integer not null check(bonus_points>=0),
 remaining integer not null, reserved integer not null default 0,
 created_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '4320 hours'), voided_at timestamptz,
 check(remaining>=reserved and reserved>=0 and remaining<=purchased_points+bonus_points)
);
create index if not exists credit_batches_member_expiry on public.credit_batches(member_id,expires_at);
create table if not exists public.job_credit_batches(job_id uuid references public.generation_jobs(id),batch_id uuid references public.credit_batches(id),amount integer not null check(amount>0),primary key(job_id,batch_id));
alter table public.credit_batches enable row level security;
alter table public.job_credit_batches enable row level security;
revoke all on public.credit_batches,public.job_credit_batches from public,anon,authenticated;
grant all on public.credit_batches,public.job_credit_batches to service_role;

create or replace function public.expire_member_credits(p_member uuid) returns void language plpgsql security definer set search_path=public as $$
declare m public.class_members; b public.credit_batches; lost integer;
begin
 select * into m from public.class_members where id=p_member;
 if not found then return; end if;
 perform 1 from public.classes where id=m.class_id for update;
 perform 1 from public.class_members where id=p_member for update;
 for b in select * from public.credit_batches where member_id=p_member and voided_at is null and expires_at<=now() and remaining>reserved order by expires_at,id for update loop
  lost:=b.remaining-b.reserved;
  update public.credit_batches set remaining=reserved where id=b.id;
  update public.class_members set quota=quota-lost where id=p_member;
  update public.classes set allocated=allocated-lost where id=m.class_id;
  insert into public.credit_transactions(member_id,kind,amount) values(p_member,'quota',-lost);
 end loop;
end $$;
create or replace function public.refresh_credit_expiry(p_user uuid,p_all boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare m record;
begin
 for m in select id from public.class_members where (p_all or user_id=p_user) and removed_at is null order by class_id,id loop
  perform public.expire_member_credits(m.id);
 end loop;
end $$;
create or replace function public.top_up_credits(p_class uuid,p_member uuid,p_id uuid,p_paid integer,p_bonus integer) returns uuid language plpgsql security definer set search_path=public as $$
declare c public.classes; m public.class_members; b public.credit_batches; points integer; deadline timestamptz:=now()+interval '4320 hours';
begin
 select * into c from public.classes where id=p_class for update;
 if not found or c.deleted_at is not null then raise exception '班級不存在或已刪除'; end if;
 select * into m from public.class_members where id=p_member and class_id=p_class for update;
 if not found or m.removed_at is not null then raise exception '學生不存在或已移除'; end if;
 if p_id is null or p_paid is null or p_bonus is null or p_paid<1 or p_bonus<0 or p_paid>100000 or p_bonus>100000 then raise exception '儲值點數不正確'; end if;
 select * into b from public.credit_batches where id=p_id;
 if found then
  if b.member_id<>p_member or b.class_id<>p_class or b.purchased_points<>p_paid or b.bonus_points<>p_bonus then raise exception '儲值請求識別碼衝突'; end if;
  return b.id;
 end if;
 perform public.expire_member_credits(p_member);
 select * into c from public.classes where id=p_class;
 if c.expires_at<deadline then raise exception '班級到期早於180天，請先延長班級期限'; end if;
 points:=p_paid+p_bonus;
 if c.allocated+points>c.total then raise exception '班級未分配點數不足，請先增加班級總點數'; end if;
 insert into public.credit_batches(id,member_id,class_id,purchased_points,bonus_points,remaining,expires_at) values(p_id,p_member,p_class,p_paid,p_bonus,points,deadline);
 update public.class_members set quota=quota+points where id=p_member;
 update public.classes set allocated=allocated+points where id=p_class;
 insert into public.credit_transactions(member_id,kind,amount) values(p_member,'quota',points);
 return p_id;
end $$;
create or replace function public.void_removed_credits() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.removed_at is null and new.removed_at is not null then
  update public.credit_batches set remaining=0,voided_at=now() where member_id=new.id and voided_at is null;
 end if;
 return new;
end $$;
drop trigger if exists void_removed_credits on public.class_members;
create trigger void_removed_credits after update of removed_at on public.class_members for each row execute function public.void_removed_credits();
create or replace function public.reserve_job(p_user uuid,p_class uuid,p_id uuid,p_kind text,p_cost integer) returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.classes; m public.class_members; j public.generation_jobs; price integer; needed integer; take integer; lot record; paid_available integer;
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
 perform public.expire_member_credits(m.id);
 select * into m from public.class_members where id=m.id;
 select * into c from public.classes where id=c.id;
 if not c.active or c.expires_at<now() then raise exception '班級已暫停或到期'; end if;
 if p_kind not in ('image','video') then raise exception '生成類型不正確'; end if;
 if exists(select 1 from public.generation_jobs where user_id=p_user and status in ('processing','review')) then raise exception '尚有未完成任務，請先等待或聯絡老師'; end if;
 if p_cost is null or (p_kind='image' and p_cost<>5) or (p_kind='video' and p_cost not in (25,40,60,70,100)) then raise exception '扣點設定不正確'; end if;
 price:=p_cost;
 if m.used+m.reserved+price>m.quota or c.used+c.reserved+price>c.total then raise exception '剩餘點數不足'; end if;
 update public.class_members set reserved=reserved+price where id=m.id;
 update public.classes set reserved=reserved+price where id=c.id;
 insert into public.generation_jobs(id,class_id,user_id,member_id,kind,cost) values(p_id,p_class,p_user,m.id,p_kind,price) returning * into j;
 needed:=price;
 select coalesce(sum(remaining-reserved),0) into paid_available from public.credit_batches where member_id=m.id and voided_at is null;
 for lot in
 select id,expires_at,created_at,remaining-reserved available from public.credit_batches where member_id=m.id and voided_at is null and expires_at>now() and remaining>reserved
 union all select null::uuid,c.expires_at,c.created_at,m.quota-m.used-m.reserved-paid_available
 order by expires_at,created_at,id nulls last
 loop
  take:=least(needed,greatest(lot.available,0));
  if take>0 and lot.id is not null then
   update public.credit_batches set reserved=reserved+take where id=lot.id;
   insert into public.job_credit_batches(job_id,batch_id,amount) values(p_id,lot.id,take);
  end if;
  needed:=needed-take; exit when needed=0;
 end loop;
 if needed<>0 then raise exception '剩餘點數不足'; end if;
 insert into public.credit_transactions(member_id,job_id,kind,amount) values(m.id,p_id,'reserve',price);
 return to_jsonb(j)||jsonb_build_object('existing',false);
end $$;

create or replace function public.reserve_job(p_user uuid,p_class uuid,p_id uuid,p_kind text) returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.classes; m public.class_members; j public.generation_jobs; price integer; needed integer; take integer; lot record; paid_available integer;
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
 perform public.expire_member_credits(m.id);
 select * into m from public.class_members where id=m.id;
 select * into c from public.classes where id=c.id;
 if not c.active or c.expires_at<now() then raise exception '班級已暫停或到期'; end if;
 if p_kind not in ('image','video') then raise exception '生成類型不正確'; end if;
 if exists(select 1 from public.generation_jobs where user_id=p_user and status in ('processing','review')) then raise exception '尚有未完成任務，請先等待或聯絡老師'; end if;
 price:=case when p_kind='image' then c.image_cost else c.video_cost end;
 if m.used+m.reserved+price>m.quota or c.used+c.reserved+price>c.total then raise exception '剩餘點數不足'; end if;
 update public.class_members set reserved=reserved+price where id=m.id;
 update public.classes set reserved=reserved+price where id=c.id;
 insert into public.generation_jobs(id,class_id,user_id,member_id,kind,cost) values(p_id,p_class,p_user,m.id,p_kind,price) returning * into j;
 needed:=price;
 select coalesce(sum(remaining-reserved),0) into paid_available from public.credit_batches where member_id=m.id and voided_at is null;
 for lot in
 select id,expires_at,created_at,remaining-reserved available from public.credit_batches where member_id=m.id and voided_at is null and expires_at>now() and remaining>reserved
 union all select null::uuid,c.expires_at,c.created_at,m.quota-m.used-m.reserved-paid_available
 order by expires_at,created_at,id nulls last
 loop
  take:=least(needed,greatest(lot.available,0));
  if take>0 and lot.id is not null then
   update public.credit_batches set reserved=reserved+take where id=lot.id;
   insert into public.job_credit_batches(job_id,batch_id,amount) values(p_id,lot.id,take);
  end if;
  needed:=needed-take; exit when needed=0;
 end loop;
 if needed<>0 then raise exception '剩餘點數不足'; end if;
 insert into public.credit_transactions(member_id,job_id,kind,amount) values(m.id,p_id,'reserve',price);
 return to_jsonb(j)||jsonb_build_object('existing',false);
end $$;

create or replace function public.settle_job(p_id uuid,p_success boolean) returns void language plpgsql security definer set search_path=public as $$
declare j public.generation_jobs;
begin
 select * into j from public.generation_jobs where id=p_id;
 if not found then raise exception '任務不存在'; end if;
 -- Consistent class -> member -> job lock ordering avoids quota/settlement deadlocks.
 perform 1 from public.classes where id=j.class_id for update;
 perform 1 from public.class_members where id=j.member_id for update;
 select * into j from public.generation_jobs where id=p_id for update;
 if j.status not in ('processing','review') then return; end if;
 update public.class_members set reserved=reserved-j.cost,used=used+case when p_success then j.cost else 0 end where id=j.member_id;
 update public.classes set reserved=reserved-j.cost,used=used+case when p_success then j.cost else 0 end where id=j.class_id;
 update public.credit_batches b set reserved=b.reserved-a.amount,remaining=b.remaining-case when p_success then a.amount else 0 end
 from public.job_credit_batches a where a.job_id=p_id and a.batch_id=b.id;
 perform public.expire_member_credits(j.member_id);
 update public.generation_jobs set status=case when p_success then 'succeeded' else 'failed' end, checked_at=now() where id=p_id;
 insert into public.credit_transactions(member_id,job_id,kind,amount) values(j.member_id,p_id,case when p_success then 'settle' else 'refund' end,j.cost);
end $$;

create or replace function public.set_quota(p_class uuid,p_member uuid,p_quota integer) returns void language plpgsql security definer set search_path=public as $$
declare c public.classes; m public.class_members; difference integer;
begin
 select * into c from public.classes where id=p_class for update;
 if not found or c.deleted_at is not null then raise exception '班級不存在或已刪除'; end if;
 select * into m from public.class_members where id=p_member and class_id=p_class for update;
 if not found or m.removed_at is not null then raise exception '學生不存在或已移除'; end if;
 perform public.expire_member_credits(m.id);
 select * into m from public.class_members where id=p_member;
 select * into c from public.classes where id=p_class;
 if p_quota<m.used+m.reserved+(select coalesce(sum(remaining-reserved),0) from public.credit_batches where member_id=p_member and voided_at is null) then raise exception '額度不可低於已使用、預扣及有效儲值點數'; end if;
 difference:=p_quota-m.quota;
 if p_quota<m.used+m.reserved then raise exception '額度不可低於已使用及預扣點數'; end if;
 if c.allocated+difference>c.total then raise exception '班級未分配點數不足'; end if;
 update public.classes set allocated=allocated+difference where id=p_class;
 update public.class_members set quota=p_quota where id=p_member;
 insert into public.credit_transactions(member_id,kind,amount) values(p_member,'quota',difference);
end $$;

revoke all on function public.expire_member_credits(uuid),public.refresh_credit_expiry(uuid,boolean),public.top_up_credits(uuid,uuid,uuid,integer,integer),public.void_removed_credits() from public,anon,authenticated;
grant execute on function public.expire_member_credits(uuid),public.refresh_credit_expiry(uuid,boolean),public.top_up_credits(uuid,uuid,uuid,integer,integer) to service_role;
create or replace function public.edit_class(p_class uuid,p_name text,p_description text,p_total integer,p_quota integer,p_capacity integer,p_image integer,p_video integer,p_expires timestamptz,p_code text,p_enrollment boolean) returns void
language plpgsql security definer set search_path=public as $$
declare c public.classes;
begin
 select * into c from public.classes where id=p_class for update;
 if not found or c.deleted_at is not null then raise exception '班級不存在或已刪除'; end if;
 if length(trim(p_name)) not between 1 and 80 or length(p_description)>160 or p_total<1 or p_quota<1 or p_image<1 or p_video<1 or p_capacity not between 1 and 200 or p_expires<=now() or upper(trim(p_code)) !~ '^[A-Z0-9]{6,8}$' then raise exception '請確認班級設定格式'; end if;
 if exists(select 1 from public.credit_batches where class_id=p_class and voided_at is null and remaining>0 and expires_at>p_expires) then raise exception '班級期限不可早於有效儲值點數的到期日'; end if;
 if p_total<c.allocated or p_total<c.used+c.reserved then raise exception '總點數不可低於已分配、已使用及預扣點數'; end if;
 if p_quota>p_total then raise exception '每人額度不可超過班級總點數'; end if;
 if p_capacity<(select count(*) from public.class_members where class_id=p_class and removed_at is null) then raise exception '人數上限不可低於現有學生人數'; end if;
 update public.classes set name=trim(p_name),description=p_description,total=p_total,default_quota=p_quota,max_students=p_capacity,image_cost=p_image,video_cost=p_video,expires_at=p_expires,course_code=upper(trim(p_code)),self_enrollment=p_enrollment where id=p_class;
end $$;

notify pgrst, 'reload schema';
commit;
