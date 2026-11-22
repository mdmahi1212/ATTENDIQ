-- Room camera confirmation (rules B, C, E; user decision 2026-11-23).
-- ROOM_SEEN: the room camera recognised an enrolled student's face (edge sends it at most once a minute per student).
-- ROOM_UNKNOWN_FACE: a good-quality face in the room matches nobody in the class -> staff alert (no picture stored).
alter table public.edge_events drop constraint edge_events_event_type_check;
alter table public.edge_events add constraint edge_events_event_type_check check (event_type in (
  'GATE_PERSON_IN','GATE_PERSON_OUT','GATE_ENTRY_RECOGNISED','GATE_ENTRY_UNKNOWN',
  'OCCUPANCY_UPDATED','CAMERA_OFFLINE','CAMERA_ONLINE','EDGE_HEARTBEAT','ROOM_SEEN','ROOM_UNKNOWN_FACE'));

create or replace function public.apply_edge_events(p_device uuid, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dev     public.edge_devices;
  v_src     public.edge_devices;
  v_sess    public.class_sessions;
  e         jsonb;
  v_raw     text;
  v_id      uuid;
  v_type    text;
  v_src_id  uuid;
  v_sess_id uuid;
  v_at      timestamptz;
  v_payload jsonb;
  v_sim     boolean;
  v_student uuid;
  v_first   timestamptz;
  v_ins     uuid;
  v_acc     int := 0;
  v_dup     int := 0;
  v_rej     jsonb := '[]';
begin
  select * into v_dev from public.edge_devices where id = p_device and is_active;
  if not found then
    raise exception 'unknown or inactive device' using errcode = '42501';
  end if;
  if jsonb_typeof(p_events) is distinct from 'array' then
    raise exception 'events must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_events) > 500 then
    raise exception 'batch too large (max 500)' using errcode = '22023';
  end if;

  for e in select value from jsonb_array_elements(p_events) loop
    v_raw := e->>'event_id';
    begin
      v_id      := (e->>'event_id')::uuid;
      v_type    := e->>'event_type';
      v_src_id  := (e->>'source_device_id')::uuid;
      v_sess_id := nullif(e->>'session_id', '')::uuid;
      v_at      := (e->>'observed_at')::timestamptz;
      v_payload := coalesce(e->'payload', '{}'::jsonb);
      v_sim     := coalesce((e->>'simulation')::boolean, false);
    exception when others then
      v_rej := v_rej || jsonb_build_object('event_id', v_raw, 'reason', 'invalid_envelope');
      continue;
    end;

    if v_id is null or v_type is null or v_src_id is null or v_at is null
       or jsonb_typeof(v_payload) <> 'object' then
      v_rej := v_rej || jsonb_build_object('event_id', v_raw, 'reason', 'invalid_envelope');
      continue;
    end if;
    if v_type not in ('GATE_PERSON_IN','GATE_PERSON_OUT','GATE_ENTRY_RECOGNISED','GATE_ENTRY_UNKNOWN',
                      'OCCUPANCY_UPDATED','CAMERA_OFFLINE','CAMERA_ONLINE','EDGE_HEARTBEAT',
                      'ROOM_SEEN','ROOM_UNKNOWN_FACE') then
      v_rej := v_rej || jsonb_build_object('event_id', v_raw, 'reason', 'unknown_event_type');
      continue;
    end if;

    select * into v_src from public.edge_devices where id = v_src_id and is_active;
    if not found or v_src.room_id is null
       or (v_src.id <> v_dev.id and v_src.room_id is distinct from v_dev.room_id) then
      v_rej := v_rej || jsonb_build_object('event_id', v_raw, 'reason', 'device_not_allowed');
      continue;
    end if;
    if v_at > now() + interval '2 minutes' then
      v_rej := v_rej || jsonb_build_object('event_id', v_raw, 'reason', 'observed_at_in_future');
      continue;
    end if;
    if v_sess_id is not null then
      select * into v_sess from public.class_sessions where id = v_sess_id;
      if not found or v_sess.room_id is distinct from v_src.room_id then
        v_rej := v_rej || jsonb_build_object('event_id', v_raw, 'reason', 'session_room_mismatch');
        continue;
      end if;
    elsif v_type not in ('CAMERA_OFFLINE','CAMERA_ONLINE','EDGE_HEARTBEAT') then
      v_rej := v_rej || jsonb_build_object('event_id', v_raw, 'reason', 'session_required');
      continue;
    end if;

    begin
      insert into public.edge_events (event_id, event_type, source_device_id, received_via, session_id,
                                      observed_at, model_version, payload, simulation)
      values (v_id, v_type, v_src_id, p_device, v_sess_id, v_at, e->>'model_version', v_payload, v_sim)
      on conflict (event_id) do nothing
      returning event_id into v_ins;

      if v_ins is null then
        v_dup := v_dup + 1;
        continue;
      end if;

      v_student := null;
      if v_payload ? 'student_id' and nullif(v_payload->>'student_id', '') is not null then
        select id into v_student from public.profiles where id = (v_payload->>'student_id')::uuid;
      end if;

      if v_type like 'GATE_%' then
        insert into public.gate_events (event_id, session_id, device_id, event_type, track_id, direction,
                                        student_id, score, margin, snapshot_path, ts, simulation)
        values (v_id, v_sess_id, v_src_id, v_type, (v_payload->>'track_id')::int,
                case when v_type = 'GATE_PERSON_OUT' then 'out' else 'in' end,
                case when v_type = 'GATE_ENTRY_UNKNOWN' then null else v_student end,
                (v_payload->>'score')::real, (v_payload->>'margin')::real,
                v_payload->>'snapshot_path', v_at, v_sim);
      end if;

      if v_type = 'GATE_ENTRY_RECOGNISED' and v_student is not null then
        -- Re-entry = recognised again AFTER the gate saw this student go OUT. A plain second sighting
        -- (edge restart, phone re-detecting someone standing in view) is not a re-entry.
        select first_seen_at into v_first from public.attendance
         where session_id = v_sess_id and student_id = v_student;
        if v_first is not null and v_at > v_first
           and exists (select 1 from public.attendance
                        where session_id = v_sess_id and student_id = v_student and 'gate_out' = any(flags)) then
          perform public.add_attendance_flag(v_sess_id, v_student, 'reentry');
        end if;
        perform public.record_evidence(v_sess_id, v_student, v_at, 'gate', 'gate_event', v_id::text, false,
          jsonb_build_object('score', v_payload->'score', 'margin', v_payload->'margin', 'simulation', v_sim));
      elsif v_type = 'GATE_PERSON_OUT' and v_student is not null then
        perform public.add_attendance_flag(v_sess_id, v_student, 'gate_out');
      elsif v_type = 'OCCUPANCY_UPDATED' then
        insert into public.occupancy_samples (event_id, session_id, device_id, raw, smoothed, stable, ts, simulation)
        values (v_id, v_sess_id, v_src_id, (v_payload->>'raw')::int,
                coalesce((v_payload->>'smoothed')::int, (v_payload->>'raw')::int),
                coalesce((v_payload->>'stable')::boolean, false), v_at, v_sim);
      elsif v_type = 'ROOM_UNKNOWN_FACE' and not v_sim
            and not exists (select 1 from public.notifications n
                             where n.type = 'unknown_in_room' and n.data->>'session_id' = v_sess_id::text
                               and n.created_at > now() - interval '5 minutes') then
        -- Rule C: someone not enrolled in this class sits in the room (a stand-in?). Staff only; no picture stored.
        perform public.notify_session_staff(v_sess_id, 'unknown_in_room', 'Unknown person in the room',
          'The room camera sees a face that is not enrolled in this class. Check the live view.',
          jsonb_build_object('url', '/sessions/' || v_sess_id || '/dashboard', 'session_id', v_sess_id));
      elsif v_type in ('CAMERA_OFFLINE','CAMERA_ONLINE') and v_sess_id is not null then
        perform public.refresh_gate_offline(v_sess_id);
      end if;

      update public.edge_devices
         set last_seen = greatest(coalesce(last_seen, v_at), v_at),
             status    = case when v_type = 'EDGE_HEARTBEAT' then v_payload else status end
       where id = v_src_id;

      v_acc := v_acc + 1;
    exception when others then
      v_rej := v_rej || jsonb_build_object('event_id', v_raw, 'reason', 'error: ' || sqlerrm);
    end;
  end loop;

  return jsonb_build_object('accepted', v_acc, 'duplicates', v_dup, 'rejected', v_rej);
end $$;

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
