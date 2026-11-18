-- 12: professor manual mark (live dashboard) with a mandatory reason, audited with the professor as actor.

create or replace function public.manual_mark(
  p_session uuid, p_student uuid, p_status public.att_status, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.class_sessions;
begin
  perform public.assert_session_actor(p_session);
  if auth.uid() is null then
    raise exception 'manual marks need a signed-in staff member' using errcode = '42501';
  end if;
  if p_status not in ('present', 'late', 'absent', 'excused', 'left_early') then
    raise exception 'status % cannot be set manually', p_status using errcode = '22023';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  select * into s from public.class_sessions where id = p_session;
  if not found then raise exception 'session not found' using errcode = 'P0002'; end if;
  if s.state in ('locked', 'cancelled') then
    raise exception 'session is %', s.state using errcode = '55000';
  end if;

  perform set_config('app.audit_reason', 'manual: ' || trim(p_reason), true);
  update public.attendance
     set status = p_status, method = 'manual', note = trim(p_reason), updated_at = now(),
         first_seen_at = coalesce(first_seen_at, case when p_status in ('present', 'late') then now() end)
   where session_id = p_session and student_id = p_student;
  if not found then
    raise exception 'student is not on this session''s roster' using errcode = 'P0002';
  end if;
  insert into public.attendance_evidence (session_id, student_id, source, source_id, weight, rule_version, detail)
  values (p_session, p_student, 'manual', auth.uid()::text, 'strong', 'v1',
          jsonb_build_object('status', p_status, 'reason', trim(p_reason)));
  perform set_config('app.audit_reason', '', true);

  perform public.notify_user(p_student, 'status_changed', 'Attendance updated',
    format('Your professor set your attendance to %s: %s', p_status, trim(p_reason)),
    jsonb_build_object('url', '/student/attendance', 'session_id', p_session));
end $$;

revoke execute on function public.manual_mark(uuid, uuid, public.att_status, text) from public, anon;
grant execute on function public.manual_mark(uuid, uuid, public.att_status, text) to authenticated, service_role;
