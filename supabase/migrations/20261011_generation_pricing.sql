begin;
create or replace function public.reserve_job(p_user uuid,p_class uuid,p_id uuid,p_kind text,p_cost integer) returns jsonb language plpgsql security definer set search_path=public as $$
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
 if p_cost is null or (p_kind='image' and p_cost<>5) or (p_kind='video' and p_cost not in (25,40,60,70,100)) then raise exception '扣點設定不正確'; end if;
 price:=p_cost;
 if m.used+m.reserved+price>m.quota or c.used+c.reserved+price>c.total then raise exception '剩餘點數不足'; end if;
 update public.class_members set reserved=reserved+price where id=m.id;
 update public.classes set reserved=reserved+price where id=c.id;
 insert into public.generation_jobs(id,class_id,user_id,member_id,kind,cost) values(p_id,p_class,p_user,m.id,p_kind,price) returning * into j;
 insert into public.credit_transactions(member_id,job_id,kind,amount) values(m.id,p_id,'reserve',price);
 return to_jsonb(j)||jsonb_build_object('existing',false);
end $$;

revoke all on function public.reserve_job(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_job(uuid,uuid,uuid,text,integer) to service_role;

notify pgrst, 'reload schema';
commit;
