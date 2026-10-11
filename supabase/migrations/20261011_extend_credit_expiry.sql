begin;
create table if not exists public.credit_expiry_changes (
 id bigint generated always as identity primary key,
 batch_id uuid not null references public.credit_batches(id),
 actor_id uuid not null references auth.users(id),
 old_expires_at timestamptz not null,new_expires_at timestamptz not null,
 created_at timestamptz not null default now(),check(new_expires_at>old_expires_at)
);
alter table public.credit_expiry_changes enable row level security;
revoke all on public.credit_expiry_changes from public,anon,authenticated;
grant all on public.credit_expiry_changes to service_role;
grant usage,select on sequence public.credit_expiry_changes_id_seq to service_role;
create or replace function public.extend_credit_expiry(p_class uuid,p_member uuid,p_batch uuid,p_expires timestamptz,p_expected timestamptz,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c public.classes; m public.class_members; b public.credit_batches;
begin
 select * into c from public.classes where id=p_class for update;
 if not found or c.deleted_at is not null then raise exception '班級不存在或已刪除'; end if;
 select * into m from public.class_members where id=p_member and class_id=p_class for update;
 if not found or m.removed_at is not null then raise exception '學生不存在或已移除'; end if;
 select * into b from public.credit_batches where id=p_batch and member_id=p_member and class_id=p_class for update;
 if not found or b.voided_at is not null then raise exception '儲值批次不存在或已作廢'; end if;
 if p_actor is null or not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception '只有管理者可以延長期限'; end if;
 if b.expires_at<=now() or b.remaining=0 then raise exception '只能延長尚未到期且有剩餘點數的批次'; end if;
 if p_expected is null or b.expires_at<>p_expected then raise exception '點數期限已更新，請重新整理後再操作'; end if;
 if p_expires is null or p_expires<=b.expires_at then raise exception '新到期日必須晚於原期限'; end if;
 if p_expires>c.expires_at then raise exception '新期限超過班級期限，請先延長班級期限'; end if;
 insert into public.credit_expiry_changes(batch_id,actor_id,old_expires_at,new_expires_at) values(b.id,p_actor,b.expires_at,p_expires);
 update public.credit_batches set expires_at=p_expires where id=b.id;
end $$;
revoke all on function public.extend_credit_expiry(uuid,uuid,uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.extend_credit_expiry(uuid,uuid,uuid,timestamptz,timestamptz,uuid) to service_role;
notify pgrst,'reload schema';
commit;
