-- Enable link enrollment without changing existing memberships or balances.
alter table public.classes add column if not exists self_enrollment boolean not null default false;
alter table public.classes add column if not exists max_students integer not null default 15 check (max_students > 0);

create or replace function public.join_class(p_class uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare c public.classes; m public.class_members; email_address text; student_name text; member_count integer;
begin
 select lower(email), coalesce(raw_user_meta_data->>'full_name','同學') into email_address, student_name
 from auth.users where id=p_user and email_confirmed_at is not null
 and (raw_app_meta_data->>'provider'='google' or raw_app_meta_data->'providers' ? 'google');
 if email_address is null then raise exception '請使用已驗證的 Google 帳號登入'; end if;
 select * into c from public.classes where id=p_class for update;
 if not found then raise exception '班級不存在'; end if;
 if not c.active or c.expires_at <= now() then raise exception '班級已暫停或到期'; end if;
 select * into m from public.class_members where class_id=p_class and (user_id=p_user or email=email_address) for update;
 if found then
   if m.user_id is not null and m.user_id<>p_user then raise exception '此班級帳號已綁定其他使用者'; end if;
   update public.class_members set user_id=p_user,name=student_name where id=m.id;
   return m.id;
 end if;
 if not c.self_enrollment then raise exception '此班級未開放網址加入，請聯絡老師'; end if;
 select count(*) into member_count from public.class_members where class_id=p_class;
 if member_count>=c.max_students then raise exception '班級名額已滿，請聯絡老師'; end if;
 if c.allocated+c.default_quota>c.total then raise exception '班級可分配點數不足，請聯絡老師'; end if;
 insert into public.class_members(class_id,user_id,email,name,quota)
 values(p_class,p_user,email_address,student_name,c.default_quota) returning * into m;
 update public.classes set allocated=allocated+c.default_quota where id=p_class;
 return m.id;
end $$;
revoke all on function public.join_class(uuid,uuid) from public,anon,authenticated;
grant execute on function public.join_class(uuid,uuid) to service_role;

create or replace function public.invite_students(p_class uuid,p_emails text[]) returns void language plpgsql security definer set search_path=public as $$
declare c public.classes; n integer; e text;
begin
 select * into c from public.classes where id=p_class for update;
 if not found then raise exception '班級不存在'; end if;
 select count(*) into n from (select distinct lower(trim(x)) email from unnest(p_emails) x) s where not exists(select 1 from public.class_members where class_id=p_class and email=s.email);
 if c.self_enrollment and (select count(*) from public.class_members where class_id=p_class)+n>c.max_students then raise exception '班級名額已滿，請聯絡老師'; end if;
 if c.allocated+n*c.default_quota>c.total then raise exception '班級未分配點數不足'; end if;
 for e in select distinct lower(trim(x)) from unnest(p_emails) x loop
 insert into public.class_members(class_id,email,name,quota) values(p_class,e,split_part(e,'@',1),c.default_quota) on conflict(class_id,email) do nothing;
 end loop;
 update public.classes set allocated=allocated+n*c.default_quota where id=p_class;
end $$;

