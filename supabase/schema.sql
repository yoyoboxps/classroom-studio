-- Run once in Supabase SQL Editor. Media and prompts are deliberately not stored.
create extension if not exists pgcrypto;
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, name text not null default '', role text not null default 'student' check(role in ('student','admin')));
create table public.classes (id uuid primary key default gen_random_uuid(), name text not null, description text not null default '', total integer not null check(total>0), default_quota integer not null check(default_quota>0), image_cost integer not null check(image_cost>0), video_cost integer not null check(video_cost>0), expires_at timestamptz not null, used integer not null default 0 check(used>=0), reserved integer not null default 0 check(reserved>=0), allocated integer not null default 0 check(allocated>=0), active boolean not null default true, created_at timestamptz default now(), check(allocated<=total), check(used+reserved<=total), check(default_quota<=total));
create table public.class_members (id uuid primary key default gen_random_uuid(), class_id uuid not null references public.classes(id), user_id uuid references auth.users(id), email text not null, name text not null default '', quota integer not null check(quota>=0), used integer not null default 0 check(used>=0), reserved integer not null default 0 check(reserved>=0), unique(class_id,email), unique(class_id,user_id), check(used+reserved<=quota), check(email=lower(email)));
create table public.generation_jobs (id uuid primary key, class_id uuid not null references public.classes(id), user_id uuid not null references auth.users(id), member_id uuid not null references public.class_members(id), kind text not null check(kind in ('image','video')), cost integer not null check(cost>0), status text not null default 'processing' check(status in ('processing','succeeded','failed','review')), provider_id text, created_at timestamptz not null default now(), checked_at timestamptz not null default now());
create unique index one_active_job_per_student on public.generation_jobs(user_id) where status in ('processing','review');
create table public.credit_transactions (id bigint generated always as identity primary key, member_id uuid not null references public.class_members(id), job_id uuid references public.generation_jobs(id), kind text not null check(kind in ('reserve','settle','refund','quota')), amount integer not null, created_at timestamptz default now());
create unique index one_transaction_per_job_kind on public.credit_transactions(job_id,kind) where job_id is not null;

create or replace function public.on_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','同學')); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.on_new_user();

-- No browser may change roles, quotas, provider IDs or balances. All writes use server RPCs.
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.credit_transactions enable row level security;
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid());
create policy own_membership on public.class_members for select to authenticated using(user_id=auth.uid());
create policy own_class on public.classes for select to authenticated using(exists(select 1 from public.class_members m where m.class_id=classes.id and m.user_id=auth.uid()));
create policy own_job on public.generation_jobs for select to authenticated using(user_id=auth.uid());
revoke all on public.profiles,public.classes,public.class_members,public.generation_jobs,public.credit_transactions from anon,authenticated;
grant select on public.profiles,public.classes,public.class_members to authenticated;
-- generation_jobs contains provider IDs; browser reads only through authenticated server endpoints.

create or replace function public.reserve_job(p_user uuid,p_class uuid,p_id uuid,p_kind text) returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.classes; m public.class_members; j public.generation_jobs; price integer;
begin
 select * into c from public.classes where id=p_class for update;
 if not found then raise exception '班級不存在'; end if;
 select * into m from public.class_members where class_id=p_class and user_id=p_user for update;
 if not found then raise exception '你不在此班級名單內'; end if;
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
 update public.generation_jobs set status=case when p_success then 'succeeded' else 'failed' end, checked_at=now() where id=p_id;
 insert into public.credit_transactions(member_id,job_id,kind,amount) values(j.member_id,p_id,case when p_success then 'settle' else 'refund' end,j.cost);
end $$;

create or replace function public.invite_students(p_class uuid,p_emails text[]) returns void language plpgsql security definer set search_path=public as $$
declare c public.classes; n integer; e text;
begin
 select * into c from public.classes where id=p_class for update;
 if not found then raise exception '班級不存在'; end if;
 select count(*) into n from (select distinct lower(trim(x)) email from unnest(p_emails) x) s where not exists(select 1 from public.class_members where class_id=p_class and email=s.email);
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
 if not found then raise exception '班級不存在'; end if;
 select * into m from public.class_members where id=p_member and class_id=p_class for update;
 if not found then raise exception '學生不存在'; end if;
 difference:=p_quota-m.quota;
 if p_quota<m.used+m.reserved then raise exception '額度不可低於已使用及預扣點數'; end if;
 if c.allocated+difference>c.total then raise exception '班級未分配點數不足'; end if;
 update public.classes set allocated=allocated+difference where id=p_class;
 update public.class_members set quota=p_quota where id=p_member;
 insert into public.credit_transactions(member_id,kind,amount) values(p_member,'quota',difference);
end $$;

-- Link only authenticated, provider-verified emails, never a browser-supplied address.
create or replace function public.claim_memberships(p_user uuid,p_email text,p_name text) returns void language plpgsql security definer set search_path=public as $$ begin
 update public.class_members set user_id=p_user,name=p_name where email=lower(p_email) and (user_id is null or user_id=p_user);
end $$;
revoke all on function public.reserve_job(uuid,uuid,uuid,text),public.settle_job(uuid,boolean),public.invite_students(uuid,text[]),public.set_quota(uuid,uuid,integer),public.claim_memberships(uuid,text,text),public.on_new_user() from public,anon,authenticated;
grant execute on function public.reserve_job(uuid,uuid,uuid,text),public.settle_job(uuid,boolean),public.invite_students(uuid,text[]),public.set_quota(uuid,uuid,integer),public.claim_memberships(uuid,text,text) to service_role;
