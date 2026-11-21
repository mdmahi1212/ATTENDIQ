-- Exit camera + professor-only count alert (user decision 2026-11-22, see CLAUDE.md "Locked rules").
--
-- 1. End-of-class count check moves to T_end - 5 min and only ALERTS THE PROFESSOR when the room count differs
--    from the students marked present. Students are no longer sent a recheck automatically; the professor
--    can start one from the live page (Start recheck), which keeps the existing recheck -> left_early flow.
-- 2. Finalize: a present/late student whose last door event was GATE_PERSON_OUT (seen by the exit camera)
--    and who shows no later evidence of being back (gate re-entry, self-verify, recheck, manual mark) is
--    marked ABSENT, flag 'left_no_return'.

update public.settings
   set value = jsonb_set(value, '{recheck_before_end_min}', '5'::jsonb)
 where key = 'policy' and (value->>'recheck_before_end_min')::int = 10;

create or replace function public.run_count_checks(p_session uuid, p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s     public.class_sessions;
  v_c   int;
  v_v   int;
  v_enr int;
  v_tol int;
  v_int interval;
begin
  select * into s from public.class_sessions where id = p_session for update;
  if s.state not in ('live','recheck') or p_now >= s.ends_at then return; end if;

  -- C = latest STABLE smoothed count (fresh within 2 min), minus staff.
  select greatest(o.smoothed - s.staff_count, 0) into v_c
    from public.occupancy_samples o
   where o.session_id = p_session and o.stable and o.ts >= p_now - interval '2 minutes' and o.ts <= p_now
   order by o.ts desc limit 1;
  select count(*) filter (where status in ('present','late')), count(*)
    into v_v, v_enr from public.attendance where session_id = p_session;
  v_tol := public.pol_int(s.policy, 'count_tolerance', 1);
  v_int := make_interval(mins => public.pol_int(s.policy, 'mismatch_interval_min', 5));

  -- End-of-class count check (once, from T_end - N): tell the PROFESSOR when the room count differs from the
  -- students marked present. No automatic student notifications: the professor decides whether to start a
  -- recheck. Without a stable count yet, try again on the next tick.
  if p_now >= s.ends_at - make_interval(mins => public.pol_int(s.policy, 'recheck_before_end_min', 5)) then
    if s.recheck_checked_at is null and v_c is not null then
      update public.class_sessions set recheck_checked_at = p_now where id = p_session;
      if v_c <> v_v then
        perform public.notify_session_staff(p_session, 'count_alert', 'Count does not match',
          format('%s in the room, %s marked present. Start a recheck from the live page if needed.', v_c, v_v),
          jsonb_build_object('verified', v_v, 'counted', v_c, 'url', '/sessions/' || p_session));
      end if;
    end if;
    return;
  end if;

  if v_c is null
     or p_now < s.starts_at + make_interval(mins => public.pol_int(s.policy, 'first_mismatch_check_min', 10))
     or (s.last_mismatch_check_at is not null and p_now < s.last_mismatch_check_at + v_int) then
    return;
  end if;
  update public.class_sessions set last_mismatch_check_at = p_now where id = p_session;

  if v_c > v_enr and s.over_enrolled_alerted_at is null then
    update public.class_sessions set over_enrolled_alerted_at = p_now where id = p_session;
    perform public.notify_session_staff(p_session, 'count_alert', 'More people than enrolled',
      format('Counted %s, enrolled %s. Nobody was marked.', v_c, v_enr),
      jsonb_build_object('counted', v_c, 'enrolled', v_enr));
  end if;

  if v_c > v_v and exists (select 1 from public.attendance where session_id = p_session and status = 'pending') then
    perform public.open_verification_request(p_session, 'mismatch', null, p_now);
  end if;

  if v_c < v_v then
    if s.low_count_since is null then
      update public.class_sessions set low_count_since = p_now where id = p_session;
    elsif p_now >= s.low_count_since + v_int and s.low_count_alerted_at is null then
      update public.class_sessions set low_count_alerted_at = p_now where id = p_session;
      perform public.notify_session_staff(p_session, 'count_alert', 'Fewer people than verified',
        format('%s fewer people than verified.', v_v - v_c),
        jsonb_build_object('verified', v_v, 'counted', v_c));
    end if;
  else
    update public.class_sessions set low_count_since = null, low_count_alerted_at = null
     where id = p_session and low_count_since is not null;
  end if;
end $function$;

create or replace function public.finalize_session(p_session uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s          public.class_sessions;
  r          record;
  v_window   int;
  v_offline  int;
  v_seen     boolean;
  v_healthy  boolean;
  v_absent   int := 0;
  v_review   int := 0;
  v_left     int := 0;
begin
  perform public.assert_session_actor(p_session);
  if auth.uid() is not null then p_now := now(); end if;  -- clients cannot move the clock
  select * into s from public.class_sessions where id = p_session for update;
  if not found or s.state not in ('live','recheck') then
    return jsonb_build_object('finalized', false, 'reason', 'not_live');
  end if;

  for r in select id from public.verification_requests where session_id = p_session and status = 'open' loop
    perform public.close_verification_request(r.id, p_now);
  end loop;

  v_window  := public.pol_int(s.policy, 'present_until_min', 10) * 60;
  v_offline := public.refresh_gate_offline(p_session, p_now);
  v_seen    := exists (select 1 from public.edge_events ev
                       join public.edge_devices d on d.id = ev.source_device_id
                       where d.room_id = s.room_id
                         and ev.observed_at between s.starts_at - interval '15 minutes' and s.ends_at);
  v_healthy := v_seen and v_offline <= v_window * 0.5;

  -- Left and never came back: the exit camera recognised the student going OUT after their last evidence of
  -- being in the room (gate entry or re-entry, self-verify, recheck). A professor's later manual mark wins.
  perform set_config('app.audit_reason', 'left without returning', true);
  for r in
    select a.student_id, o.last_out
      from public.attendance a
      join lateral (
        select max(ev.observed_at) as last_out
          from public.edge_events ev
         where ev.session_id = p_session and ev.event_type = 'GATE_PERSON_OUT'
           and ev.payload->>'student_id' = a.student_id::text
      ) o on o.last_out is not null
     where a.session_id = p_session
       and a.status in ('present', 'late')
       and o.last_out > coalesce(a.last_verified_at, a.first_seen_at, '-infinity'::timestamptz)
       and not (a.updated_by is not null and a.updated_at > o.last_out)
       for update of a
  loop
    update public.attendance
       set status = 'absent',
           flags = case when 'left_no_return' = any(flags) then flags else flags || 'left_no_return'::text end,
           note = coalesce(note, format('left at %s and did not come back',
                                        to_char(r.last_out at time zone 'Asia/Seoul', 'HH24:MI'))),
           updated_at = now()
     where session_id = p_session and student_id = r.student_id;
    insert into public.attendance_evidence (session_id, student_id, source, weight, rule_version, detail)
    values (p_session, r.student_id, 'engine', 'context', 'v1',
            jsonb_build_object('rule', 'left_no_return', 'last_out', r.last_out));
    perform public.notify_user(r.student_id, 'marked_absent', 'Marked absent',
      format('You left class at %s and did not come back.', to_char(r.last_out at time zone 'Asia/Seoul', 'HH24:MI')),
      jsonb_build_object('url', '/student/attendance', 'session_id', p_session));
    v_left := v_left + 1;
  end loop;

  perform set_config('app.audit_reason', 'finalize', true);
  for r in select student_id from public.attendance
           where session_id = p_session and status = 'pending' for update loop
    if v_healthy then
      update public.attendance set status = 'absent', updated_at = now()
       where session_id = p_session and student_id = r.student_id;
      insert into public.attendance_evidence (session_id, student_id, source, weight, rule_version, detail)
      values (p_session, r.student_id, 'engine', 'context', 'v1', jsonb_build_object('rule', 'no_evidence'));
      perform public.notify_user(r.student_id, 'marked_absent', 'Marked absent',
        'No attendance evidence was recorded for today''s class.',
        jsonb_build_object('url', '/student/attendance', 'session_id', p_session));
      v_absent := v_absent + 1;
    else
      update public.attendance
         set flags = case when 'needs_review' = any(flags) then flags else flags || 'needs_review'::text end,
             note = coalesce(note, 'devices unhealthy: professor review'), updated_at = now()
       where session_id = p_session and student_id = r.student_id;
      v_review := v_review + 1;
    end if;
  end loop;
  perform set_config('app.audit_reason', '', true);

  update public.class_sessions set state = 'ended', finalized_at = p_now where id = p_session;

  insert into public.audit_log (actor, action, entity, entity_id, after, reason)
  values (auth.uid(), 'finalize', 'class_sessions', p_session::text,
          jsonb_build_object('healthy', v_healthy, 'gate_offline_seconds', v_offline,
                             'device_seen', v_seen, 'absent', v_absent, 'needs_review', v_review,
                             'left_no_return', v_left),
          'session finalized');

  return jsonb_build_object('finalized', true, 'healthy', v_healthy, 'absent', v_absent, 'needs_review', v_review,
                            'left_no_return', v_left);
end $function$;
