-- Coming back after an exit must be confirmed IN the room (user report 2026-11-24: a student showed his face at the
-- door camera again but did not come in, and was counted present). When the room camera recognised faces in this
-- class, a door recognition after the last OUT no longer cancels "left without returning"; a room sighting, a phone
-- verify, or a staff / appeal decision does.

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
  v_unconf   int := 0;
  v_room_active boolean;
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

  v_room_active := exists (select 1 from public.edge_events where session_id = p_session and event_type = 'ROOM_SEEN');

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
       and not (a.updated_by is not null and a.updated_at > o.last_out)
       -- Back in the room after the last OUT? Proof that counts: the room camera saw them, they verified on their
       -- phone (self-verify / recheck), or staff / an appeal decided. A face at the DOOR camera alone counts only
       -- when this class had no room-camera recognition (someone can look in at the door and walk away again).
       and not exists (select 1 from public.edge_events ev
                        where ev.session_id = p_session and ev.event_type = 'ROOM_SEEN'
                          and ev.payload->>'student_id' = a.student_id::text and ev.observed_at > o.last_out)
       and not exists (select 1 from public.attendance_evidence x
                        where x.session_id = p_session and x.student_id = a.student_id
                          and x.source in ('verification_attempt', 'manual', 'appeal') and x.created_at > o.last_out)
       and not (not v_room_active and exists (
                  select 1 from public.edge_events ev
                   where ev.session_id = p_session and ev.event_type = 'GATE_ENTRY_RECOGNISED'
                     and ev.payload->>'student_id' = a.student_id::text and ev.observed_at > o.last_out))
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

  -- Rules E + B (only when the room camera recognised faces this class, so it was able to see students):
  -- E: marked at the door but never seen in the room afterwards; B: self-verified but not seen in the room within
  -- 10 minutes. Status is kept; the row is flagged 'unconfirmed' for the professor to decide.
  if exists (select 1 from public.edge_events where session_id = p_session and event_type = 'ROOM_SEEN') then
    perform set_config('app.audit_reason', 'not seen in the room', true);
    for r in
      select a.student_id, a.method from public.attendance a
       where a.session_id = p_session and a.status in ('present', 'late') and a.method in ('gate', 'self_verify')
         and a.updated_by is null
         and not exists (
           select 1 from public.edge_events ev
            where ev.session_id = p_session and ev.event_type = 'ROOM_SEEN'
              and ev.payload->>'student_id' = a.student_id::text
              and ev.observed_at >= case when a.method = 'gate' then a.first_seen_at
                                         else coalesce(a.last_verified_at, a.first_seen_at) - interval '2 minutes' end
              and (a.method = 'gate'
                   or ev.observed_at <= coalesce(a.last_verified_at, a.first_seen_at) + interval '10 minutes'))
         for update of a
    loop
      update public.attendance
         set flags = case when 'unconfirmed' = any(flags) then flags else flags || 'unconfirmed'::text end,
             note = coalesce(note, case when r.method = 'gate' then 'marked at the door but not seen in the room'
                                        else 'self-verified but not seen in the room' end),
             updated_at = now()
       where session_id = p_session and student_id = r.student_id;
      v_unconf := v_unconf + 1;
    end loop;
    if v_unconf > 0 then
      perform public.notify_session_staff(p_session, 'unconfirmed', 'Check attendance',
        format('%s student(s) were marked but never seen in the room. Please review them.', v_unconf),
        jsonb_build_object('url', '/sessions/' || p_session, 'session_id', p_session));
    end if;
  end if;

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
                             'left_no_return', v_left, 'unconfirmed', v_unconf),
          'session finalized');

  return jsonb_build_object('finalized', true, 'healthy', v_healthy, 'absent', v_absent, 'needs_review', v_review,
                            'left_no_return', v_left, 'unconfirmed', v_unconf);
end $function$;
