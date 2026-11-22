-- Room camera recognition counts as attendance (user decision 2026-11-23: no QR / professor step for students the
-- room camera recognises). New attendance method 'room'.
alter table public.attendance drop constraint attendance_method_check;
alter table public.attendance add constraint attendance_method_check
  check (method in ('gate', 'self_verify', 'recheck', 'manual', 'appeal', 'room'));

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
  v_arr     timestamptz;
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
      elsif v_type = 'ROOM_SEEN' and v_student is not null
            and exists (select 1 from public.attendance a  -- only when it changes something: not yet marked, or back after an OUT
                         where a.session_id = v_sess_id and a.student_id = v_student
                           and (a.status = 'pending' or 'gate_out' = any(a.flags))) then
        -- The room camera recognised this student: that is attendance evidence too (method 'room'), so students
        -- whose face the door missed are confirmed without any phone step. Arrival time = the last unrecognised
        -- entry at the door before this sighting (they walked in then, face hidden), else the sighting itself.
        select max(g.ts) into v_arr from public.gate_events g
         where g.session_id = v_sess_id and g.ts <= v_at and g.student_id is null
           and g.event_type in ('GATE_ENTRY_UNKNOWN', 'GATE_PERSON_IN');
        perform public.record_evidence(v_sess_id, v_student, coalesce(v_arr, v_at), 'room', 'room_event', v_id::text,
          false, jsonb_build_object('seen_at', v_at, 'arrival', coalesce(v_arr, v_at), 'simulation', v_sim));
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
