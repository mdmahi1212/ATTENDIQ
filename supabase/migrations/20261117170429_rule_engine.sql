-- 04: attendance rule engine.
-- All timing uses server time: event observed_at (NTP-synced edge), attempt created_at, or p_now.
-- Every function that depends on "now" takes p_now (default now()) so tests can pin the clock.

-- ---------------------------------------------------------------- small helpers
create or replace function public.pol_int(p jsonb, k text, d int) returns int
language sql immutable set search_path = '' as $$
  select coalesce(round((p->>k)::numeric)::int, d)
$$;

create or replace function public.pol_num(p jsonb, k text, d numeric) returns numeric
language sql immutable set search_path = '' as $$
  select coalesce((p->>k)::numeric, d)
$$;

create or replace function public.status_rank(s public.att_status) returns int
language sql immutable set search_path = '' as $$
  select case s when 'present' then 3 when 'late' then 2 when 'absent' then 1 else 0 end
$$;

-- Status that evidence observed at p_at earns in this session (timing rule only).
create or replace function public.status_for_time(p_session uuid, p_at timestamptz)
returns public.att_status
language sql stable set search_path = '' as $$
  select case
    when p_at <= s.starts_at + make_interval(mins => public.pol_int(s.policy, 'present_until_min', 10))
      then 'present'::public.att_status
    when p_at <= s.starts_at + make_interval(mins => public.pol_int(s.policy, 'late_until_min', 30))
      then 'late'::public.att_status
    else 'absent'::public.att_status
  end
  from public.class_sessions s where s.id = p_session
$$;

-- Raise unless the caller is the server (no JWT) or staff/admin of the session.
create or replace function public.assert_session_actor(p_session uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not (public.is_session_staff(p_session) or public.is_admin()) then
    raise exception 'not allowed for this session' using errcode = '42501';
  end if;
end $$;

create or replace function public.notify_session_staff(p_session uuid, p_type text, p_title text,
  p_body text, p_data jsonb default '{}') returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select st.profile_id from public.class_sessions s
           join public.section_staff st on st.section_id = s.section_id
           where s.id = p_session loop
    if public.notify_user(r.profile_id, p_type, p_title, p_body,
         coalesce(p_data, '{}') || jsonb_build_object('session_id', p_session,
                                                     'url', '/professor/live/' || p_session)) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- evidence -> status
-- Applies one piece of trusted evidence. Earliest evidence wins; never downgrades by time;
-- excused / left_early / manual / appeal marks are not touched (evidence is still logged).
create or replace function public.record_evidence(
  p_session uuid, p_student uuid, p_at timestamptz, p_method text,
  p_source text, p_source_id text, p_force_present boolean default false, p_detail jsonb default null
) returns public.att_status
language plpgsql security definer set search_path = '' as $$
declare
  s      public.class_sessions;
  a      public.attendance;
  v_cand public.att_status;
  v_new  public.att_status;
  v_flags text[];
begin
  select * into s from public.class_sessions where id = p_session;
  if not found or s.state in ('scheduled','cancelled','locked') then
    return null;
  end if;
  select * into a from public.attendance
   where session_id = p_session and student_id = p_student for update;
  if not found then
    return null;  -- visitor / dropped student: observation stays in the event tables only
  end if;

  insert into public.attendance_evidence (session_id, student_id, source, source_id, weight, rule_version, detail)
  values (p_session, p_student, p_source, p_source_id, 'strong', 'v1', p_detail);

  if a.status in ('excused','left_early') or a.method in ('manual','appeal') then
    update public.attendance
       set last_verified_at = greatest(coalesce(a.last_verified_at, p_at), p_at), updated_at = now()
     where session_id = p_session and student_id = p_student;
    return a.status;
  end if;

  v_cand := case when p_force_present then 'present'::public.att_status
                 else public.status_for_time(p_session, p_at) end;
  v_new := case when public.status_rank(v_cand) > public.status_rank(a.status) then v_cand else a.status end;

  v_flags := a.flags;
  if v_new = 'absent' then
    if not ('very_late' = any(v_flags)) then v_flags := v_flags || 'very_late'::text; end if;
  else
    v_flags := array_remove(v_flags, 'very_late');
  end if;
  v_flags := array_remove(v_flags, 'needs_review');

  update public.attendance
     set status           = v_new,
         method           = case when v_new is distinct from a.status then p_method
                                 else coalesce(a.method, p_method) end,
         first_seen_at    = least(coalesce(a.first_seen_at, p_at), p_at),
         last_verified_at = greatest(coalesce(a.last_verified_at, p_at), p_at),
         flags            = v_flags,
         note             = case when v_new = 'absent' then coalesce(a.note, 'very late') else a.note end,
         updated_at       = now()
   where session_id = p_session and student_id = p_student;

  if v_new = 'late' and a.status is distinct from 'late' then
    perform public.notify_user(p_student, 'marked_late', 'Marked late',
      'You were marked late for today''s class.',
      jsonb_build_object('url', '/student/attendance', 'session_id', p_session));
  end if;
  return v_new;
end $$;

create or replace function public.add_attendance_flag(p_session uuid, p_student uuid, p_flag text)
returns void
language sql security definer set search_path = '' as $$
  update public.attendance set flags = flags || p_flag, updated_at = now()
   where session_id = p_session and student_id = p_student and not (p_flag = any(flags))
$$;

-- ---------------------------------------------------------------- gate camera downtime
-- Seconds the gate camera was offline inside the on-time window [T0, T0 + present_until].
-- Recomputed from the ledger each time, so out-of-order (replayed) events are handled.
create or replace function public.refresh_gate_offline(p_session uuid, p_now timestamptz default now())
returns int
language plpgsql security definer set search_path = '' as $$
declare
  s       public.class_sessions;
  w_start timestamptz;
  w_end   timestamptz;
  r       record;
  v_off   timestamptz;
  v_total numeric := 0;
begin
  select * into s from public.class_sessions where id = p_session;
  if not found then return 0; end if;
  w_start := s.starts_at;
  w_end   := s.starts_at + make_interval(mins => public.pol_int(s.policy, 'present_until_min', 10));

  for r in select ev.event_type, ev.observed_at from public.edge_events ev
           where ev.session_id = p_session
             and ev.event_type in ('CAMERA_OFFLINE','CAMERA_ONLINE')
             and coalesce(ev.payload->>'camera', 'gate') = 'gate'
           order by ev.observed_at, ev.received_at loop
    if r.event_type = 'CAMERA_OFFLINE' then
      v_off := coalesce(v_off, r.observed_at);
    elsif v_off is not null then
      v_total := v_total + greatest(0, extract(epoch from least(r.observed_at, w_end) - greatest(v_off, w_start)));
      v_off := null;
    end if;
  end loop;
  if v_off is not null then
    v_total := v_total + greatest(0, extract(epoch from least(p_now, w_end) - greatest(v_off, w_start)));
  end if;

  update public.class_sessions set gate_offline_seconds = v_total::int where id = p_session;
  return v_total::int;
end $$;

-- ---------------------------------------------------------------- edge event ingestion
-- p_device = the device whose key authenticated the HTTP call (edge, ingest or simulator).
-- Each envelope's source_device_id must be that device or another active device in the same room.
-- Returns { accepted, duplicates, rejected: [{event_id, reason}] }. Idempotent on event_id.
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
                      'OCCUPANCY_UPDATED','CAMERA_OFFLINE','CAMERA_ONLINE','EDGE_HEARTBEAT') then
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
        select first_seen_at into v_first from public.attendance
         where session_id = v_sess_id and student_id = v_student;
        if v_first is not null and v_at > v_first then
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

-- ---------------------------------------------------------------- session lifecycle
create or replace function public.start_session(p_session uuid, p_now timestamptz default now())
returns void
language plpgsql security definer set search_path = '' as $$
declare s public.class_sessions;
begin
  perform public.assert_session_actor(p_session);
  if auth.uid() is not null then p_now := now(); end if;  -- clients cannot move the clock
  select * into s from public.class_sessions where id = p_session for update;
  if not found then raise exception 'session not found' using errcode = 'P0002'; end if;
  if s.state <> 'scheduled' then return; end if;

  update public.class_sessions
     set state = 'live', started_at = p_now,
         policy = coalesce((select value from public.settings where key = 'policy'), '{}'::jsonb)
                  || coalesce(s.policy, '{}'::jsonb)          -- per-session overrides win
   where id = p_session;

  insert into public.attendance (session_id, student_id)
  select p_session, e.student_id
    from public.enrollments e
    join public.profiles p on p.id = e.student_id and p.is_active and p.role = 'student'
   where e.section_id = s.section_id
     and e.starts_on <= s.session_date and (e.ends_on is null or e.ends_on >= s.session_date)
  on conflict do nothing;

  insert into public.session_secrets (session_id, qr_secret)
  values (p_session, encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (session_id) do nothing;
end $$;

-- Opens a verification window and notifies its targets.
-- mismatch/manual -> students still pending; recheck -> students present/late.
create or replace function public.open_verification_request(
  p_session uuid, p_kind text, p_by uuid default null, p_now timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s     public.class_sessions;
  v_id  uuid;
  v_min int;
  v_n   int;
  r     record;
begin
  perform public.assert_session_actor(p_session);
  if auth.uid() is not null then p_now := now(); end if;  -- clients cannot move the clock
  if auth.uid() is not null then p_by := auth.uid(); end if;
  if p_kind not in ('mismatch','recheck','manual') then
    raise exception 'invalid kind %', p_kind using errcode = '22023';
  end if;

  select * into s from public.class_sessions where id = p_session for update;
  if not found or s.state not in ('live','recheck') then
    raise exception 'session is not live' using errcode = '55000';
  end if;

  select id into v_id from public.verification_requests
   where session_id = p_session and kind = p_kind and status = 'open' and closes_at > p_now
   limit 1;
  if v_id is not null then return v_id; end if;

  v_min := case when p_kind = 'recheck' then public.pol_int(s.policy, 'recheck_window_min', 4)
                else public.pol_int(s.policy, 'verify_window_min', 5) end;

  insert into public.verification_requests (session_id, kind, opens_at, closes_at, created_by)
  values (p_session, p_kind, p_now, p_now + make_interval(mins => v_min), p_by)
  returning id into v_id;

  insert into public.verification_targets (request_id, student_id, notified_at)
  select v_id, a.student_id, p_now from public.attendance a
   where a.session_id = p_session
     and case when p_kind = 'recheck' then a.status in ('present','late')
              else a.status = 'pending' end;
  get diagnostics v_n = row_count;
  update public.verification_requests set target_count = v_n where id = v_id;

  for r in select student_id from public.verification_targets where request_id = v_id loop
    perform public.notify_user(r.student_id,
      case when p_kind = 'recheck' then 'recheck_now' else 'verify_now' end,
      case when p_kind = 'recheck' then 'Confirm you are still in class'
           else 'We couldn''t confirm you - verify now' end,
      format('Open the app and verify within %s minutes.', v_min),
      jsonb_build_object('url', '/verify/' || v_id, 'request_id', v_id, 'session_id', p_session),
      p_now + make_interval(mins => v_min));
  end loop;

  if p_kind = 'recheck' and s.state = 'live' then
    update public.class_sessions set state = 'recheck' where id = p_session;
  end if;
  return v_id;
end $$;

-- Closes a window. For a recheck, every target who did not pass and is still present/late
-- becomes left_early (they were actually sent the recheck, so this is an allowed negative outcome).
create or replace function public.close_verification_request(p_request uuid, p_now timestamptz default now())
returns int
language plpgsql security definer set search_path = '' as $$
declare
  q   public.verification_requests;
  r   record;
  v_n int := 0;
begin
  select * into q from public.verification_requests where id = p_request for update;
  if not found or q.status <> 'open' then return 0; end if;
  update public.verification_requests set status = 'closed', closed_at = p_now where id = p_request;

  if q.kind = 'recheck' then
    perform set_config('app.audit_reason', 'recheck not passed', true);
    for r in select a.student_id from public.verification_targets t
             join public.attendance a on a.session_id = q.session_id and a.student_id = t.student_id
             where t.request_id = p_request and t.passed_at is null
               and a.status in ('present','late')
             for update of a loop
      update public.attendance
         set status = 'left_early', method = 'recheck', updated_at = now(),
             flags = case when 'recheck_failed' = any(flags) then flags else flags || 'recheck_failed'::text end
       where session_id = q.session_id and student_id = r.student_id;
      insert into public.attendance_evidence (session_id, student_id, source, source_id, weight, rule_version, detail)
      values (q.session_id, r.student_id, 'engine', p_request::text, 'strong', 'v1',
              jsonb_build_object('rule', 'recheck_not_passed'));
      perform public.notify_user(r.student_id, 'left_early', 'Marked as left early',
        'You did not confirm the end-of-class recheck.',
        jsonb_build_object('url', '/student/attendance', 'session_id', q.session_id));
      v_n := v_n + 1;
    end loop;
    perform set_config('app.audit_reason', '', true);
  end if;
  return v_n;
end $$;

-- Applies a stored verification attempt (written by the Next.js verify route).
create or replace function public.apply_self_verification(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t        public.verification_attempts;
  q        public.verification_requests;
  v_first  uuid;
  v_target boolean;
  v_status public.att_status;
begin
  select * into t from public.verification_attempts where id = p_attempt;
  if not found then raise exception 'attempt not found' using errcode = 'P0002'; end if;
  if t.result <> 'pass' then
    return jsonb_build_object('applied', false, 'reason', 'attempt_failed');
  end if;

  select * into q from public.verification_requests where id = t.request_id for update;
  if q.status <> 'open' or t.created_at < q.opens_at or t.created_at > q.closes_at then
    return jsonb_build_object('applied', false, 'reason', 'window_closed');
  end if;

  v_target := exists (select 1 from public.verification_targets
                      where request_id = q.id and student_id = t.student_id);
  if not v_target then
    if q.kind = 'recheck' or not exists (select 1 from public.attendance
        where session_id = q.session_id and student_id = t.student_id and status = 'pending') then
      return jsonb_build_object('applied', false, 'reason', 'not_a_target');
    end if;
    insert into public.verification_targets (request_id, student_id, notified_at)
    values (q.id, t.student_id, t.created_at);
  end if;

  update public.verification_targets set passed_at = coalesce(passed_at, t.created_at)
   where request_id = q.id and student_id = t.student_id;

  if q.kind = 'recheck' then
    insert into public.attendance_evidence (session_id, student_id, source, source_id, weight, rule_version)
    values (q.session_id, t.student_id, 'verification_attempt', t.id::text, 'strong', 'v1');
    update public.attendance set last_verified_at = greatest(coalesce(last_verified_at, t.created_at), t.created_at),
                                 updated_at = now()
     where session_id = q.session_id and student_id = t.student_id
    returning status into v_status;
    return jsonb_build_object('applied', true, 'status', v_status);
  end if;

  -- Camera-miss rule: passing inside the FIRST mismatch window of the session = present.
  select id into v_first from public.verification_requests
   where session_id = q.session_id and kind = 'mismatch' order by opens_at, id limit 1;

  v_status := public.record_evidence(q.session_id, t.student_id, t.created_at, 'self_verify',
                'verification_attempt', t.id::text, q.kind = 'mismatch' and q.id = v_first,
                jsonb_build_object('face_score', t.face_score, 'qr_ok', t.qr_ok, 'gps_ok', t.gps_ok));
  return jsonb_build_object('applied', v_status is not null, 'status', v_status);
end $$;

-- End of class: pending -> absent only when the session's devices were healthy; otherwise
-- pending stays pending (flag needs_review) for the professor.
create or replace function public.finalize_session(p_session uuid, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s          public.class_sessions;
  r          record;
  v_window   int;
  v_offline  int;
  v_seen     boolean;
  v_healthy  boolean;
  v_absent   int := 0;
  v_review   int := 0;
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
                             'device_seen', v_seen, 'absent', v_absent, 'needs_review', v_review),
          'session finalized');

  return jsonb_build_object('finalized', true, 'healthy', v_healthy, 'absent', v_absent, 'needs_review', v_review);
end $$;

create or replace function public.cancel_session(p_session uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.class_sessions; r record;
begin
  perform public.assert_session_actor(p_session);
  select * into s from public.class_sessions where id = p_session for update;
  if not found or s.state not in ('scheduled','live','recheck') then
    raise exception 'session cannot be cancelled' using errcode = '55000';
  end if;
  update public.verification_requests set status = 'cancelled', closed_at = now()
   where session_id = p_session and status = 'open';
  update public.class_sessions set state = 'cancelled', cancelled_reason = p_reason where id = p_session;
  for r in select e.student_id from public.enrollments e
           where e.section_id = s.section_id
             and e.starts_on <= s.session_date and (e.ends_on is null or e.ends_on >= s.session_date) loop
    perform public.notify_user(r.student_id, 'class_cancelled', 'Class cancelled',
      coalesce(p_reason, 'Today''s class has been cancelled.'),
      jsonb_build_object('url', '/student', 'session_id', p_session));
  end loop;
  insert into public.audit_log (actor, action, entity, entity_id, reason)
  values (auth.uid(), 'cancel', 'class_sessions', p_session::text, p_reason);
end $$;

-- ---------------------------------------------------------------- count checks (inside tick)
create or replace function public.run_count_checks(p_session uuid, p_now timestamptz default now())
returns void
language plpgsql security definer set search_path = '' as $$
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

  -- End-of-class recheck (once, at T_end - N).
  if p_now >= s.ends_at - make_interval(mins => public.pol_int(s.policy, 'recheck_before_end_min', 10)) then
    if s.recheck_checked_at is null then
      update public.class_sessions set recheck_checked_at = p_now where id = p_session;
      if v_c is not null and v_c < v_v - v_tol then
        perform public.open_verification_request(p_session, 'recheck', null, p_now);
        perform public.notify_session_staff(p_session, 'count_alert', 'Recheck started',
          format('Verified %s, counted %s - recheck opened automatically.', v_v, v_c),
          jsonb_build_object('verified', v_v, 'counted', v_c));
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
end $$;

-- ---------------------------------------------------------------- the minute tick (pg_cron)
create or replace function public.session_tick(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today   date := (p_now at time zone 'Asia/Seoul')::date;
  r         record;
  v_created int := 0;
  v_started int := 0;
  v_closed  int := 0;
  v_final   int := 0;
  v_locked  int := 0;
begin
  -- 1. today's sessions from the timetable (skip holidays / exam days)
  insert into public.class_sessions (section_id, room_id, slot_id, session_date, starts_at, ends_at)
  select ts.section_id, coalesce(ts.room_id, sec.room_id), ts.id, v_today,
         (v_today + ts.start_time) at time zone 'Asia/Seoul',
         (v_today + ts.end_time)   at time zone 'Asia/Seoul'
    from public.timetable_slots ts
    join public.sections sec on sec.id = ts.section_id
    join public.semesters sem on sem.id = sec.semester_id
   where ts.is_active
     and ts.weekday = extract(isodow from v_today)::int
     and v_today between sem.starts_on and sem.ends_on
     and not exists (select 1 from public.holidays h
                     where h.day = v_today and (h.semester_id is null or h.semester_id = sem.id))
  on conflict (slot_id, session_date) where slot_id is not null do nothing;
  get diagnostics v_created = row_count;

  -- 2. scheduled -> live at T0 - 10 min
  for r in select id from public.class_sessions
           where state = 'scheduled' and starts_at - interval '10 minutes' <= p_now and ends_at > p_now loop
    begin
      perform public.start_session(r.id, p_now);
      v_started := v_started + 1;
    exception when others then
      raise warning 'session_tick start % failed: %', r.id, sqlerrm;
    end;
  end loop;

  -- 3. mismatch / recheck checks
  for r in select id from public.class_sessions where state in ('live','recheck') and ends_at > p_now loop
    begin
      perform public.run_count_checks(r.id, p_now);
    exception when others then
      raise warning 'session_tick checks % failed: %', r.id, sqlerrm;
    end;
  end loop;

  -- 4. close expired windows
  for r in select id from public.verification_requests where status = 'open' and closes_at <= p_now loop
    begin
      perform public.close_verification_request(r.id, p_now);
      v_closed := v_closed + 1;
    exception when others then
      raise warning 'session_tick close % failed: %', r.id, sqlerrm;
    end;
  end loop;

  -- 5. finalize at T_end (waits up to 10 min for a still-open window, then forces it closed)
  for r in select s.id from public.class_sessions s
           where s.state in ('live','recheck') and s.ends_at <= p_now
             and (s.ends_at + interval '10 minutes' <= p_now
                  or not exists (select 1 from public.verification_requests q
                                 where q.session_id = s.id and q.status = 'open')) loop
    begin
      perform public.finalize_session(r.id, p_now);
      v_final := v_final + 1;
    exception when others then
      raise warning 'session_tick finalize % failed: %', r.id, sqlerrm;
    end;
  end loop;

  -- 6. lock after lock_after_hours
  update public.class_sessions
     set state = 'locked', locked_at = p_now
   where state = 'ended'
     and ends_at + make_interval(hours => public.pol_int(policy, 'lock_after_hours', 48)) <= p_now;
  get diagnostics v_locked = row_count;

  return jsonb_build_object('created', v_created, 'started', v_started, 'closed', v_closed,
                            'finalized', v_final, 'locked', v_locked);
end $$;

-- ---------------------------------------------------------------- reporting
create or replace function public.attendance_summary(p_student uuid, p_section uuid)
returns table (held int, present int, late int, absent int, left_early int, excused int,
               pending int, pct numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pol jsonb := coalesce((select value from public.settings where key = 'policy'), '{}'::jsonb);
  v_lw  numeric := public.pol_num(v_pol, 'late_weight', 1);
  v_le  numeric := case when v_pol->>'left_early_counts_as' = 'partial' then 0.5 else 0 end;
begin
  if auth.uid() is not null and auth.uid() <> p_student
     and not (public.is_section_staff(p_section) or public.is_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with x as (
    select a.status from public.attendance a
    join public.class_sessions s on s.id = a.session_id
    where a.student_id = p_student and s.section_id = p_section and s.state in ('ended','locked'))
  select
    count(*) filter (where status <> 'pending')::int,
    count(*) filter (where status = 'present')::int,
    count(*) filter (where status = 'late')::int,
    count(*) filter (where status = 'absent')::int,
    count(*) filter (where status = 'left_early')::int,
    count(*) filter (where status = 'excused')::int,
    count(*) filter (where status = 'pending')::int,
    round(100 * (count(*) filter (where status = 'present')
                 + v_lw * count(*) filter (where status = 'late')
                 + count(*) filter (where status = 'excused')
                 + v_le * count(*) filter (where status = 'left_early'))
          / nullif(count(*) filter (where status <> 'pending'), 0), 1)
  from x;
end $$;

-- ---------------------------------------------------------------- execute rights
revoke execute on function
  public.record_evidence(uuid, uuid, timestamptz, text, text, text, boolean, jsonb),
  public.add_attendance_flag(uuid, uuid, text),
  public.refresh_gate_offline(uuid, timestamptz),
  public.apply_edge_events(uuid, jsonb),
  public.close_verification_request(uuid, timestamptz),
  public.apply_self_verification(uuid),
  public.run_count_checks(uuid, timestamptz),
  public.session_tick(timestamptz),
  public.notify_session_staff(uuid, text, text, text, jsonb),
  public.start_session(uuid, timestamptz),
  public.open_verification_request(uuid, text, uuid, timestamptz),
  public.finalize_session(uuid, timestamptz),
  public.cancel_session(uuid, text),
  public.attendance_summary(uuid, uuid),
  public.assert_session_actor(uuid)
  from public, anon;
revoke execute on function
  public.record_evidence(uuid, uuid, timestamptz, text, text, text, boolean, jsonb),
  public.add_attendance_flag(uuid, uuid, text),
  public.refresh_gate_offline(uuid, timestamptz),
  public.apply_edge_events(uuid, jsonb),
  public.close_verification_request(uuid, timestamptz),
  public.apply_self_verification(uuid),
  public.run_count_checks(uuid, timestamptz),
  public.session_tick(timestamptz),
  public.notify_session_staff(uuid, text, text, text, jsonb)
  from authenticated;
grant execute on all functions in schema public to service_role;
-- Staff-callable (each checks assert_session_actor / own-row access internally):
grant execute on function
  public.start_session(uuid, timestamptz),
  public.open_verification_request(uuid, text, uuid, timestamptz),
  public.finalize_session(uuid, timestamptz),
  public.cancel_session(uuid, text),
  public.attendance_summary(uuid, uuid),
  public.assert_session_actor(uuid)
  to authenticated;
