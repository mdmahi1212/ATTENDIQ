-- 02: role helpers, profile creation trigger, profile column guard, RLS policies.
-- Roles: student = own rows; professor = sections in section_staff; admin = all;
-- operator = devices/cameras/heartbeats only; anon = nothing.

-- ---------------------------------------------------------------- helpers (security definer avoids RLS recursion)
create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.is_operator() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('operator','admin'), false)
$$;

create or replace function public.is_section_staff(p_section uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.section_staff st
    join public.profiles p on p.id = st.profile_id and p.is_active
    where st.section_id = p_section and st.profile_id = auth.uid())
$$;

create or replace function public.is_session_staff(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_sessions s
    join public.section_staff st on st.section_id = s.section_id
    join public.profiles p on p.id = st.profile_id and p.is_active
    where s.id = p_session and st.profile_id = auth.uid())
$$;

create or replace function public.is_enrolled_in_section(p_section uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.enrollments e
                 where e.section_id = p_section and e.student_id = auth.uid())
$$;

-- Staff may see students enrolled in any section they teach.
create or replace function public.teaches_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrollments e
    join public.section_staff st on st.section_id = e.section_id
    join public.profiles p on p.id = st.profile_id and p.is_active
    where e.student_id = p_student and st.profile_id = auth.uid())
$$;

-- ---------------------------------------------------------------- new auth user -> profile
-- Role comes ONLY from raw_app_meta_data (settable by the service role / admin invite),
-- never from raw_user_meta_data (which any self sign-up controls). Default: student.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := 'student';
  v_no   text := nullif(trim(new.raw_user_meta_data->>'student_no'), '');
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
                          split_part(coalesce(new.email, ''), '@', 1));
  v_sim  boolean := coalesce((new.raw_app_meta_data->>'is_simulated')::boolean, false);
begin
  begin
    v_role := coalesce(nullif(new.raw_app_meta_data->>'role', '')::public.user_role, 'student');
  exception when invalid_text_representation then
    v_role := 'student';
  end;

  if v_role <> 'student' then
    v_no := null;
  elsif v_no is not null and exists (select 1 from public.profiles where student_no = v_no) then
    v_no := null;  -- never block sign-up on a duplicate number; admin fixes it
  end if;

  insert into public.profiles (id, role, full_name, email, student_no, is_simulated)
  values (new.id, v_role, v_name, lower(new.email), v_no, v_sim);

  if v_role = 'student' then
    insert into public.face_profiles (student_id) values (new.id) on conflict do nothing;

    insert into public.enrollments (section_id, student_id)
    select pe.section_id, new.id from public.pending_enrollments pe
    where pe.email = lower(new.email)
    on conflict do nothing;

    delete from public.pending_enrollments where email = lower(new.email);
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Non-admin clients may only change their own full_name.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.is_simulated is distinct from old.is_simulated
       or new.student_no is distinct from old.student_no
       or new.email is distinct from old.email
       or new.department_id is distinct from old.department_id
       or new.id is distinct from old.id then
      raise exception 'only an admin can change role, status or identifiers'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------- RLS on every table
do $$
declare t text;
begin
  foreach t in array array[
    'departments','profiles','semesters','holidays','courses','rooms','sections','section_staff',
    'enrollments','pending_enrollments','timetable_slots','biometric_consents','face_profiles',
    'face_embeddings','edge_devices','cameras','class_sessions','session_secrets','attendance',
    'attendance_evidence','edge_events','gate_events','occupancy_samples','verification_requests',
    'verification_targets','verification_attempts','appeals','notifications','push_subscriptions',
    'audit_log','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
alter table private.app_config enable row level security;

-- Reference data: readable by any signed-in user, writable by admin.
do $$
declare t text;
begin
  foreach t in array array['departments','semesters','holidays','courses','rooms','sections','timetable_slots','settings']
  loop
    execute format('create policy "%s: read" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "%s: admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- profiles
create policy "profiles: read" on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin() or role = 'professor' or public.teaches_student(id));
create policy "profiles: update own or admin" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "profiles: admin insert" on public.profiles for insert to authenticated with check (public.is_admin());
create policy "profiles: admin delete" on public.profiles for delete to authenticated using (public.is_admin());

-- section_staff
create policy "section_staff: read" on public.section_staff for select to authenticated using (
  profile_id = auth.uid() or public.is_admin()
  or public.is_section_staff(section_id) or public.is_enrolled_in_section(section_id));
create policy "section_staff: admin write" on public.section_staff for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- enrollments
create policy "enrollments: read" on public.enrollments for select to authenticated using (
  student_id = auth.uid() or public.is_admin() or public.is_section_staff(section_id));
create policy "enrollments: admin write" on public.enrollments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- pending_enrollments
create policy "pending_enrollments: read" on public.pending_enrollments for select to authenticated using (
  public.is_admin() or public.is_section_staff(section_id));
create policy "pending_enrollments: admin write" on public.pending_enrollments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- biometric_consents
create policy "consents: read own or admin" on public.biometric_consents for select to authenticated using (
  student_id = auth.uid() or public.is_admin());
create policy "consents: insert own" on public.biometric_consents for insert to authenticated with check (
  student_id = auth.uid());
create policy "consents: withdraw own" on public.biometric_consents for update to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());

-- face_profiles (template is biometric; staff do not read this table directly)
create policy "face_profiles: read own or admin" on public.face_profiles for select to authenticated using (
  student_id = auth.uid() or public.is_admin());
create policy "face_profiles: admin write" on public.face_profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- face_embeddings: server (service role) + admin only
create policy "face_embeddings: admin" on public.face_embeddings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- devices / cameras: operator (and admin)
create policy "edge_devices: operator" on public.edge_devices for all to authenticated
  using (public.is_operator()) with check (public.is_operator());
create policy "cameras: operator" on public.cameras for all to authenticated
  using (public.is_operator()) with check (public.is_operator());

-- class_sessions
create policy "class_sessions: read" on public.class_sessions for select to authenticated using (
  public.is_admin() or public.is_operator()
  or public.is_section_staff(section_id) or public.is_enrolled_in_section(section_id));
create policy "class_sessions: admin write" on public.class_sessions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- session_secrets: no policies at all (service role only).

-- attendance (writes go through RPCs / service role; admin may write directly, audited by trigger)
create policy "attendance: read" on public.attendance for select to authenticated using (
  student_id = auth.uid() or public.is_admin() or public.is_session_staff(session_id));
create policy "attendance: admin write" on public.attendance for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "attendance_evidence: read" on public.attendance_evidence for select to authenticated using (
  student_id = auth.uid() or public.is_admin() or public.is_session_staff(session_id));

-- edge data
create policy "edge_events: operator read" on public.edge_events for select to authenticated using (
  public.is_operator());
create policy "gate_events: staff read" on public.gate_events for select to authenticated using (
  public.is_admin() or public.is_session_staff(session_id));
create policy "occupancy: read" on public.occupancy_samples for select to authenticated using (
  public.is_operator() or public.is_session_staff(session_id));

-- verification
-- Definer helpers break the requests <-> targets policy cycle.
create or replace function public.is_request_staff(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.verification_requests r
                 where r.id = p_request and public.is_session_staff(r.session_id))
$$;
create or replace function public.is_request_target(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.verification_targets vt
                 where vt.request_id = p_request and vt.student_id = auth.uid())
$$;

create policy "verification_requests: read" on public.verification_requests for select to authenticated using (
  public.is_admin() or public.is_session_staff(session_id) or public.is_request_target(id));
create policy "verification_targets: read" on public.verification_targets for select to authenticated using (
  student_id = auth.uid() or public.is_admin() or public.is_request_staff(request_id));
create policy "verification_attempts: read" on public.verification_attempts for select to authenticated using (
  student_id = auth.uid() or public.is_admin() or public.is_request_staff(request_id));

-- appeals
create policy "appeals: read" on public.appeals for select to authenticated using (
  student_id = auth.uid() or public.is_admin() or public.is_session_staff(session_id));
create policy "appeals: student files own" on public.appeals for insert to authenticated with check (
  student_id = auth.uid() and status = 'open' and decided_by is null and decided_at is null);
create policy "appeals: admin write" on public.appeals for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- notifications: own inbox (mark read). Inserts come from SQL functions / service role.
create policy "notifications: read own" on public.notifications for select to authenticated using (
  user_id = auth.uid());
create policy "notifications: mark own read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- push subscriptions: own
create policy "push_subscriptions: own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit log: admin read only (writes by triggers)
create policy "audit_log: admin read" on public.audit_log for select to authenticated using (public.is_admin());

-- Helper execute rights: only signed-in users need them (used inside policies).
revoke execute on function public.my_role(), public.is_admin(), public.is_operator(),
  public.is_section_staff(uuid), public.is_session_staff(uuid), public.is_enrolled_in_section(uuid),
  public.teaches_student(uuid), public.is_request_staff(uuid), public.is_request_target(uuid) from public, anon;
grant execute on function public.my_role(), public.is_admin(), public.is_operator(),
  public.is_section_staff(uuid), public.is_session_staff(uuid), public.is_enrolled_in_section(uuid),
  public.teaches_student(uuid), public.is_request_staff(uuid), public.is_request_target(uuid)
  to authenticated, service_role;
revoke execute on function public.handle_new_user(), public.guard_profile_update() from public, anon, authenticated;
