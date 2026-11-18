-- 14: appeals (file / decide), at-risk warnings, private bucket for appeal attachments.

-- Student files an appeal for one of their finished sessions (ended or locked), within appeal_days of the end.
create or replace function public.file_appeal(
  p_session uuid, p_reason text, p_requested public.att_status default 'excused', p_attachment text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  s     public.class_sessions;
  a     public.attendance;
  v_id  uuid;
  v_days int;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into a from public.attendance where session_id = p_session and student_id = v_uid;
  if not found then raise exception 'you were not on this class roster' using errcode = '42501'; end if;
  select * into s from public.class_sessions where id = p_session;
  if s.state not in ('ended', 'locked') then
    raise exception 'appeals open after the class has ended' using errcode = '55000';
  end if;
  v_days := public.pol_int(s.policy, 'appeal_days', 7);
  if now() > s.ends_at + make_interval(days => v_days) then
    raise exception 'the appeal period (% days) is over', v_days using errcode = '55000';
  end if;
  if p_requested not in ('present', 'late', 'excused') then
    raise exception 'you can ask for present, late or excused' using errcode = '22023';
  end if;
  if a.status = p_requested then
    raise exception 'your status is already %', p_requested using errcode = '22023';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'explain the reason (at least 10 characters)' using errcode = '22023';
  end if;
  if p_attachment is not null and p_attachment not like v_uid::text || '/%' then
    raise exception 'invalid attachment' using errcode = '42501';
  end if;
  if exists (select 1 from public.appeals where session_id = p_session and student_id = v_uid and status = 'open') then
    raise exception 'you already have an open appeal for this class' using errcode = '23505';
  end if;

  insert into public.appeals (session_id, student_id, reason, requested_status, attachment_path)
  values (p_session, v_uid, trim(p_reason), p_requested, p_attachment)
  returning id into v_id;

  perform public.notify_session_staff(p_session, 'appeal_submitted', 'New attendance appeal',
    format('A student asks to change %s to %s.', a.status, p_requested),
    jsonb_build_object('url', '/professor/appeals', 'appeal_id', v_id, 'session_id', p_session));
  return v_id;
end $$;

-- Staff of the session (or admin) decide. Approval changes the status even after lock (that is what appeals are for).
create or replace function public.decide_appeal(p_appeal uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  q public.appeals;
begin
  select * into q from public.appeals where id = p_appeal for update;
  if not found then raise exception 'appeal not found' using errcode = 'P0002'; end if;
  perform public.assert_session_actor(q.session_id);
  if auth.uid() is null then raise exception 'decisions need a signed-in staff member' using errcode = '42501'; end if;
  if q.status <> 'open' then raise exception 'appeal is already %', q.status using errcode = '55000'; end if;
  if p_note is null or length(trim(p_note)) < 3 then
    raise exception 'a decision note is required' using errcode = '22023';
  end if;

  update public.appeals
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note)
   where id = p_appeal;

  if p_approve then
    perform set_config('app.audit_reason', 'appeal approved: ' || trim(p_note), true);
    update public.attendance
       set status = q.requested_status, method = 'appeal', note = trim(p_note), updated_at = now()
     where session_id = q.session_id and student_id = q.student_id;
    insert into public.attendance_evidence (session_id, student_id, source, source_id, weight, rule_version, detail)
    values (q.session_id, q.student_id, 'appeal', p_appeal::text, 'strong', 'v1',
            jsonb_build_object('status', q.requested_status, 'note', trim(p_note)));
    perform set_config('app.audit_reason', '', true);
  end if;

  perform public.notify_user(q.student_id, 'appeal_update',
    case when p_approve then 'Appeal approved' else 'Appeal rejected' end,
    case when p_approve then format('Your attendance was changed to %s.', q.requested_status)
         else 'Your appeal was not approved: ' || trim(p_note) end,
    jsonb_build_object('url', '/student/attendance', 'appeal_id', p_appeal, 'session_id', q.session_id));
end $$;

-- Warn students below the lowest warning threshold (policy warn_attendance_pct, e.g. [85, 75]).
-- Once per student and section per 6 days. Returns how many were warned.
create or replace function public.notify_at_risk(p_section uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r       record;
  v_pol   jsonb := coalesce((select value from public.settings where key = 'policy'), '{}'::jsonb);
  v_warn  numeric := coalesce((select max(x::numeric) from jsonb_array_elements_text(v_pol->'warn_attendance_pct') x), 85);
  v_code  text;
  v_n     int := 0;
begin
  if auth.uid() is not null and not (public.is_section_staff(p_section) or public.is_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select c.code || '-' || sec.section_no into v_code
    from public.sections sec join public.courses c on c.id = sec.course_id where sec.id = p_section;
  for r in
    select e.student_id, sm.pct, sm.held
      from public.enrollments e
      join public.profiles p on p.id = e.student_id and p.is_active and not p.is_simulated
      cross join lateral public.attendance_summary(e.student_id, p_section) sm
     where e.section_id = p_section and (e.ends_on is null or e.ends_on >= current_date)
       and sm.held > 0 and sm.pct < v_warn
  loop
    if not exists (select 1 from public.notifications n where n.user_id = r.student_id and n.type = 'low_attendance'
                   and n.data->>'section_id' = p_section::text and n.created_at > now() - interval '6 days') then
      perform public.notify_user(r.student_id, 'low_attendance', 'Attendance warning',
        format('Your attendance in %s is %s%% (%s classes held).', v_code, r.pct, r.held),
        jsonb_build_object('url', '/student/attendance', 'section_id', p_section, 'pct', r.pct));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

revoke execute on function public.file_appeal(uuid, text, public.att_status, text),
  public.decide_appeal(uuid, boolean, text), public.notify_at_risk(uuid) from public, anon;
grant execute on function public.file_appeal(uuid, text, public.att_status, text),
  public.decide_appeal(uuid, boolean, text), public.notify_at_risk(uuid) to authenticated, service_role;

-- Appeal attachments: private bucket, one folder per student (<student_id>/<file>).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('appeal-files', 'appeal-files', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

create policy "appeal-files: student uploads own" on storage.objects for insert to authenticated
  with check (bucket_id = 'appeal-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "appeal-files: read own, staff, admin" on storage.objects for select to authenticated
  using (bucket_id = 'appeal-files' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
    or exists (select 1 from public.appeals ap where ap.attachment_path = name and public.is_session_staff(ap.session_id))));
