-- Stable, short course codes; lookup exposes only an open course's ID and name.
alter table public.classes add column if not exists course_code text not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
create unique index if not exists classes_course_code_unique on public.classes(course_code);
alter table public.classes add constraint classes_course_code_format check (course_code ~ '^[A-Z0-9]{6,8}$');
create or replace function public.resolve_course(p_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.classes;
begin
 select * into c from public.classes where course_code=upper(trim(p_code)) and self_enrollment and active and expires_at>now();
 if not found then raise exception '課程代號不正確，或課程尚未開放'; end if;
 return jsonb_build_object('id',c.id,'name',c.name);
end $$;
revoke all on function public.resolve_course(text) from public,anon,authenticated;
grant execute on function public.resolve_course(text) to service_role;
