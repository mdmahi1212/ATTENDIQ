-- 07: keep profiles.role in sync with auth.users.raw_app_meta_data.role.
-- GoTrue's admin createUser inserts the user first and writes custom app_metadata afterwards,
-- so the insert trigger alone saw no role and created a 'student' profile. app_metadata can only
-- be written with the service role / Auth admin API, so following it is safe.
create or replace function public.handle_user_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_role public.user_role;
begin
  if (new.raw_app_meta_data->>'role') is distinct from (old.raw_app_meta_data->>'role')
     and nullif(new.raw_app_meta_data->>'role', '') is not null then
    begin
      v_role := (new.raw_app_meta_data->>'role')::public.user_role;
    exception when invalid_text_representation then
      return new;  -- unknown role string: ignore
    end;
    perform set_config('app.audit_reason', 'role synced from auth app_metadata', true);
    update public.profiles
       set role = v_role,
           student_no = case when v_role = 'student' then student_no else null end
     where id = new.id and role is distinct from v_role;
    perform set_config('app.audit_reason', '', true);
    if v_role = 'student' then
      insert into public.face_profiles (student_id) values (new.id) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

create trigger on_auth_user_role_changed
  after update of raw_app_meta_data on auth.users
  for each row execute function public.handle_user_role_change();

revoke execute on function public.handle_user_role_change() from public, anon, authenticated;
