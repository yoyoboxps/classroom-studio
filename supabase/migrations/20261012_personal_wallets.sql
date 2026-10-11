begin;
-- A wallet belongs to a verified Google account; classes only fund gifts.
create table if not exists public.wallet_accounts (
 id uuid primary key references auth.users(id), email text not null unique, name text not null,
 used integer not null default 0 check(used>=0), created_at timestamptz not null default now()
);
create table if not exists public.wallet_lots (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.wallet_accounts(id),
 source text not null check(source in ('class_gift','topup')), class_id uuid references public.classes(id), member_id uuid references public.class_members(id),
 purchased_points integer not null default 0 check(purchased_points>=0), bonus_points integer not null default 0 check(bonus_points>=0),
 total integer not null check(total>0), remaining integer not null, reserved integer not null default 0,
 created_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '4320 hours'), voided_at timestamptz,
 check(remaining>=reserved and reserved>=0 and remaining<=total),
 check((source='topup' and class_id is null and member_id is null and purchased_points>0 and total=purchased_points+bonus_points) or (source='class_gift' and class_id is not null and member_id is not null and purchased_points=0))
);
create index if not exists wallet_lots_user_expiry on public.wallet_lots(user_id,expires_at,id);
create table if not exists public.wallet_job_lots(job_id uuid references public.generation_jobs(id),lot_id uuid references public.wallet_lots(id),amount integer not null check(amount>0),primary key(job_id,lot_id));
create table if not exists public.wallet_expiry_changes(id bigint generated always as identity primary key,lot_id uuid references public.wallet_lots(id),actor_id uuid references auth.users(id),old_expires_at timestamptz not null,new_expires_at timestamptz not null,created_at timestamptz not null default now(),check(new_expires_at>old_expires_at));
create table if not exists public.wallet_migrations(id text primary key,created_at timestamptz default now());
drop index if exists public.one_transaction_per_job_kind;
create unique index if not exists one_transaction_per_member_job_kind on public.credit_transactions(member_id,job_id,kind) where job_id is not null;
alter table public.generation_jobs alter column class_id drop not null;
alter table public.generation_jobs alter column member_id drop not null;
alter table public.class_members add column if not exists issued_at timestamptz not null default now();
alter table public.wallet_accounts enable row level security;
alter table public.wallet_lots enable row level security;
alter table public.wallet_job_lots enable row level security;
alter table public.wallet_expiry_changes enable row level security;
alter table public.wallet_migrations enable row level security;
revoke all on public.wallet_accounts,public.wallet_lots,public.wallet_job_lots,public.wallet_expiry_changes,public.wallet_migrations from public,anon,authenticated;
grant all on public.wallet_accounts,public.wallet_lots,public.wallet_job_lots,public.wallet_expiry_changes,public.wallet_migrations to service_role;
grant usage,select on sequence public.wallet_expiry_changes_id_seq to service_role;
-- Migration is atomic and refuses to move reservations while a provider job is running.
do $$ begin
 if not exists(select 1 from public.wallet_migrations where id='personal-wallets-v1') then
  if exists(select 1 from public.generation_jobs where status in ('processing','review')) then raise exception '請先結算所有生成中與待確認任務，再更新個人點數帳戶'; end if;
  update public.class_members m set issued_at=coalesce((select min(t.created_at) from public.credit_transactions t where t.member_id=m.id and t.kind='quota' and t.amount>0),(select c.created_at from public.classes c where c.id=m.class_id),now());
  insert into public.wallet_accounts(id,email,name,used)
   select u.id,lower(u.email),coalesce(nullif(p.name,''),split_part(u.email,'@',1)),coalesce((select sum(m.used) from public.class_members m where m.user_id=u.id),0)
   from auth.users u join public.profiles p on p.id=u.id where u.email is not null on conflict(id) do nothing;
  insert into public.wallet_lots(id,user_id,source,purchased_points,bonus_points,total,remaining,created_at,expires_at,voided_at)
   select b.id,m.user_id,'topup',b.purchased_points,b.bonus_points,b.purchased_points+b.bonus_points,b.remaining,b.created_at,b.expires_at,b.voided_at
   from public.credit_batches b join public.class_members m on m.id=b.member_id where m.user_id is not null on conflict(id) do nothing;
  -- Move unused purchased points out of class allocation. Historic spending stays intact.
  update public.class_members m set quota=m.quota-coalesce((select sum(b.remaining) from public.credit_batches b where b.member_id=m.id and b.voided_at is null),0) where m.user_id is not null;
  update public.classes c set allocated=c.allocated-coalesce((select sum(b.remaining) from public.credit_batches b join public.class_members m on m.id=b.member_id where b.class_id=c.id and b.voided_at is null and m.user_id is not null),0);
  insert into public.wallet_lots(id,user_id,source,class_id,member_id,total,remaining,created_at,expires_at)
   select m.id,m.user_id,'class_gift',m.class_id,m.id,m.quota-m.used,m.quota-m.used,m.issued_at,m.issued_at+interval '4320 hours'
   from public.class_members m where m.user_id is not null and m.removed_at is null and m.quota>m.used on conflict(id) do nothing;
  insert into public.wallet_migrations(id) values('personal-wallets-v1');
 end if;
end $$;
create or replace function public.ensure_wallet(p_user uuid,p_email text,p_name text) returns void language plpgsql security definer set search_path=public as $$ begin
 perform pg_advisory_xact_lock(20261012);
 if not exists(select 1 from auth.users where id=p_user and lower(email)=lower(p_email)) then raise exception '帳號資料不符'; end if;
 insert into public.wallet_accounts(id,email,name) values(p_user,lower(p_email),p_name) on conflict(id) do update set email=excluded.email,name=excluded.name;
end $$;
-- Trigger keeps existing course enrollment/invitation/quota tools as gift allocation tools.
create or replace function public.sync_member_wallet() returns trigger language plpgsql security definer set search_path=public as $$
declare available integer; target integer; delta integer; b record; take integer; initial boolean; moved integer:=0;
begin
 perform pg_advisory_xact_lock(20261012);
 if new.user_id is null then return new; end if;
 insert into public.wallet_accounts(id,email,name) values(new.user_id,new.email,new.name) on conflict(id) do nothing;
 for b in select x.* from public.credit_batches x where x.member_id=new.id and x.voided_at is null and not exists(select 1 from public.wallet_lots l where l.id=x.id) loop
  insert into public.wallet_lots(id,user_id,source,purchased_points,bonus_points,total,remaining,created_at,expires_at) values(b.id,new.user_id,'topup',b.purchased_points,b.bonus_points,b.purchased_points+b.bonus_points,b.remaining,b.created_at,b.expires_at);
  moved:=moved+b.remaining;
 end loop;
 if moved>0 then
  update public.classes set allocated=allocated-moved where id=new.class_id;
  update public.class_members set quota=quota-moved where id=new.id;
  return new;
 end if;
 if new.removed_at is not null then
  update public.wallet_lots set remaining=0,voided_at=now() where member_id=new.id and source='class_gift' and reserved=0 and voided_at is null;
  return new;
 end if;
 select coalesce(sum(remaining-reserved),0) into available from public.wallet_lots where member_id=new.id and source='class_gift' and voided_at is null;
 target:=new.quota-new.used-new.reserved; delta:=target-available;
 if delta>0 then
  initial:=not exists(select 1 from public.wallet_lots where member_id=new.id);
  insert into public.wallet_lots(user_id,source,class_id,member_id,total,remaining,created_at,expires_at)
   values(new.user_id,'class_gift',new.class_id,new.id,delta,delta,case when initial then new.issued_at else now() end,case when initial then new.issued_at else now() end+interval '4320 hours');
 elsif delta<0 then
  for b in select * from public.wallet_lots where member_id=new.id and source='class_gift' and voided_at is null and remaining>reserved order by expires_at desc,id for update loop
   take:=least(-delta,b.remaining-b.reserved);
   update public.wallet_lots set remaining=remaining-take where id=b.id;
   delta:=delta+take; exit when delta=0;
  end loop;
 end if;
 return new;
end $$;
drop trigger if exists sync_member_wallet on public.class_members;
create trigger sync_member_wallet after insert or update of quota,user_id,removed_at on public.class_members for each row execute function public.sync_member_wallet();
create or replace function public.expire_wallet(p_user uuid) returns void language plpgsql security definer set search_path=public as $$
declare b public.wallet_lots; lost integer;
begin
 perform pg_advisory_xact_lock(20261012);
 for b in select * from public.wallet_lots where user_id=p_user and voided_at is null and expires_at<=now() and remaining>reserved order by expires_at,id for update loop
  lost:=b.remaining-b.reserved;
  update public.wallet_lots set remaining=reserved where id=b.id;
  if b.source='class_gift' then
   update public.class_members set quota=quota-lost where id=b.member_id;
   update public.classes set allocated=allocated-lost where id=b.class_id;
  end if;
 end loop;
end $$;
create or replace function public.refresh_wallets(p_user uuid,p_all boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare a record; begin
 perform pg_advisory_xact_lock(20261012);
 for a in select id from public.wallet_accounts where p_all or id=p_user order by id loop perform public.expire_wallet(a.id); end loop;
end $$;
create or replace function public.wallet_topup(p_user uuid,p_id uuid,p_paid integer,p_bonus integer,p_actor uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare b public.wallet_lots; begin
 perform pg_advisory_xact_lock(20261012);
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception '只有管理者可以登記儲值'; end if;
 if not exists(select 1 from public.wallet_accounts where id=p_user) then raise exception '學生尚未登入建立帳號'; end if;
 if p_id is null or p_paid is null or p_bonus is null or p_paid not between 1 and 100000 or p_bonus not between 0 and 100000 then raise exception '儲值點數不正確'; end if;
 select * into b from public.wallet_lots where id=p_id;
 if found then
  if b.user_id<>p_user or b.source<>'topup' or b.purchased_points<>p_paid or b.bonus_points<>p_bonus then raise exception '儲值請求識別碼衝突'; end if;
  return b.id;
 end if;
 insert into public.wallet_lots(id,user_id,source,purchased_points,bonus_points,total,remaining) values(p_id,p_user,'topup',p_paid,p_bonus,p_paid+p_bonus,p_paid+p_bonus);
 return p_id;
end $$;
create or replace function public.wallet_extend(p_user uuid,p_batch uuid,p_expires timestamptz,p_expected timestamptz,p_actor uuid) returns void language plpgsql security definer set search_path=public as $$
declare b public.wallet_lots; begin
 perform pg_advisory_xact_lock(20261012);
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception '只有管理者可以延長期限'; end if;
 select * into b from public.wallet_lots where id=p_batch and user_id=p_user for update;
 if not found then raise exception '點數批次不存在'; end if;
 if b.voided_at is not null or b.remaining<=0 or b.expires_at<=now() then raise exception '僅能延長尚未到期且有剩餘點數的批次'; end if;
 if p_expected is null or b.expires_at<>p_expected then raise exception '期限已更新，請重新載入'; end if;
 if p_expires is null or p_expires<=b.expires_at then raise exception '新期限須晚於原期限'; end if;
 update public.wallet_lots set expires_at=p_expires where id=p_batch;
 insert into public.wallet_expiry_changes(lot_id,actor_id,old_expires_at,new_expires_at) values(p_batch,p_actor,b.expires_at,p_expires);
end $$;
create or replace function public.wallet_reserve(p_user uuid,p_id uuid,p_kind text,p_cost integer) returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.generation_jobs; b public.wallet_lots; needed integer; take integer;
begin
 perform pg_advisory_xact_lock(20261012);
 if not exists(select 1 from public.wallet_accounts where id=p_user) then raise exception '請先登入建立點數帳戶'; end if;
 select * into j from public.generation_jobs where id=p_id;
 if found then
  if j.user_id<>p_user or j.kind<>p_kind or j.cost<>p_cost then raise exception '請求識別碼衝突'; end if;
  return to_jsonb(j)||jsonb_build_object('existing',true);
 end if;
 if p_kind is null or p_kind not in ('image','video') or p_cost is null or (p_kind='image' and p_cost<>5) or (p_kind='video' and p_cost not in (25,40,60,70,100)) then raise exception '扣點設定不正確'; end if;
 if exists(select 1 from public.generation_jobs where user_id=p_user and status in ('processing','review')) then raise exception '尚有未完成任務，請先等待或聯絡老師'; end if;
 perform public.expire_wallet(p_user);
 if (select coalesce(sum(remaining-reserved),0) from public.wallet_lots where user_id=p_user and voided_at is null and expires_at>now())<p_cost then raise exception '剩餘點數不足'; end if;
 insert into public.generation_jobs(id,user_id,kind,cost) values(p_id,p_user,p_kind,p_cost) returning * into j;
 needed:=p_cost;
 for b in select * from public.wallet_lots where user_id=p_user and voided_at is null and expires_at>now() and remaining>reserved order by expires_at,created_at,id for update loop
  take:=least(needed,b.remaining-b.reserved);
  update public.wallet_lots set reserved=reserved+take where id=b.id;
  insert into public.wallet_job_lots(job_id,lot_id,amount) values(p_id,b.id,take);
  if b.source='class_gift' then
   update public.class_members set reserved=reserved+take where id=b.member_id;
   update public.classes set reserved=reserved+take where id=b.class_id;
  end if;
  needed:=needed-take;exit when needed=0;
 end loop;
 return to_jsonb(j)||jsonb_build_object('existing',false);
end $$;
-- Save the previous settlement for historic jobs, without changing historic records.
do $$ begin
 if to_regprocedure('public.settle_legacy_job(uuid,boolean)') is null then alter function public.settle_job(uuid,boolean) rename to settle_legacy_job; end if;
end $$;
create or replace function public.settle_job(p_id uuid,p_success boolean) returns void language plpgsql security definer set search_path=public as $$
declare j public.generation_jobs; b record;
begin
 perform pg_advisory_xact_lock(20261012);
 select * into j from public.generation_jobs where id=p_id for update;
 if not found then raise exception '任務不存在'; end if;
 if j.status not in ('processing','review') then return; end if;
 if not exists(select 1 from public.wallet_job_lots where job_id=p_id) then perform public.settle_legacy_job(p_id,p_success); return; end if;
 for b in select l.*,a.amount from public.wallet_job_lots a join public.wallet_lots l on l.id=a.lot_id where a.job_id=p_id order by l.expires_at,l.id loop
  update public.wallet_lots set reserved=reserved-b.amount,remaining=remaining-case when p_success then b.amount else 0 end where id=b.id;
  if b.source='class_gift' then
   update public.class_members set reserved=reserved-b.amount,used=used+case when p_success then b.amount else 0 end where id=b.member_id;
   update public.classes set reserved=reserved-b.amount,used=used+case when p_success then b.amount else 0 end where id=b.class_id;
  end if;
 end loop;
 insert into public.credit_transactions(member_id,job_id,kind,amount) select l.member_id,p_id,case when p_success then 'settle' else 'refund' end,sum(a.amount) from public.wallet_job_lots a join public.wallet_lots l on l.id=a.lot_id where a.job_id=p_id and l.source='class_gift' group by l.member_id;
 if p_success then update public.wallet_accounts set used=used+j.cost where id=j.user_id; end if;
 update public.generation_jobs set status=case when p_success then 'succeeded' else 'failed' end,checked_at=now() where id=p_id;
 perform public.expire_wallet(j.user_id);
end $$;
-- Class quota now means class gifts only, unrelated to personal topups.
create or replace function public.set_quota(p_class uuid,p_member uuid,p_quota integer) returns void language plpgsql security definer set search_path=public as $$
declare c public.classes; m public.class_members; difference integer; begin
 perform pg_advisory_xact_lock(20261012);
 select * into c from public.classes where id=p_class for update;
 if not found or c.deleted_at is not null then raise exception '班級不存在或已刪除'; end if;
 select * into m from public.class_members where id=p_member and class_id=p_class for update;
 if not found or m.removed_at is not null then raise exception '學生不存在或已移除'; end if;
 if m.user_id is not null then perform public.expire_wallet(m.user_id); end if;
 select * into m from public.class_members where id=p_member;
 select * into c from public.classes where id=p_class;
 if p_quota is null or p_quota<m.used+m.reserved then raise exception '贈點額度不可低於已使用及預扣點數'; end if;
 difference:=p_quota-m.quota;
 if c.allocated+difference>c.total then raise exception '班級未分配點數不足'; end if;
 update public.classes set allocated=allocated+difference where id=p_class;
 update public.class_members set quota=p_quota where id=p_member;
 insert into public.credit_transactions(member_id,kind,amount) values(p_member,'quota',difference);
end $$;
-- Course dates govern joining, not wallet validity; remove the old paid-lot guard.
do $$ declare def text; begin
 select pg_get_functiondef('public.edit_class(uuid,text,text,integer,integer,integer,integer,integer,timestamptz,text,boolean)'::regprocedure) into def;
 def:=replace(def,'if exists(select 1 from public.credit_batches where class_id=p_class and voided_at is null and remaining>0 and expires_at>p_expires) then raise exception ''班級期限不可早於有效儲值點數的到期日''; end if;','');
 execute def;
end $$;
-- Freeze old paid-batch mutations; there is a single authoritative wallet balance.
revoke all on function public.top_up_credits(uuid,uuid,uuid,integer,integer),public.extend_credit_expiry(uuid,uuid,uuid,timestamptz,timestamptz,uuid),public.reserve_job(uuid,uuid,uuid,text),public.reserve_job(uuid,uuid,uuid,text,integer),public.refresh_credit_expiry(uuid,boolean),public.expire_member_credits(uuid) from service_role;
-- Every mutating entry point takes the same short transaction lock before class locks.
do $$ declare f record; def text; begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in ('join_class','invite_students','claim_memberships','restore_student','remove_student','edit_class','delete_class') loop
  def:=pg_get_functiondef(f.oid);
  if position('pg_advisory_xact_lock(20261012)' in def)=0 then execute regexp_replace(def,'\mbegin\M','begin perform pg_advisory_xact_lock(20261012);','i'); end if;
 end loop;
end $$;
revoke all on function public.ensure_wallet(uuid,text,text),public.sync_member_wallet(),public.expire_wallet(uuid),public.refresh_wallets(uuid,boolean),public.wallet_topup(uuid,uuid,integer,integer,uuid),public.wallet_extend(uuid,uuid,timestamptz,timestamptz,uuid),public.wallet_reserve(uuid,uuid,text,integer),public.settle_job(uuid,boolean),public.settle_legacy_job(uuid,boolean) from public,anon,authenticated;
grant execute on function public.ensure_wallet(uuid,text,text),public.expire_wallet(uuid),public.refresh_wallets(uuid,boolean),public.wallet_topup(uuid,uuid,integer,integer,uuid),public.wallet_extend(uuid,uuid,timestamptz,timestamptz,uuid),public.wallet_reserve(uuid,uuid,text,integer),public.settle_job(uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
