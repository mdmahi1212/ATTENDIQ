-- Rule engine + RLS tests (pgTAP). Runs inside ONE transaction that is rolled back:
-- nothing it creates (fixtures, pgtap extension, tests schema) survives.
-- The final statement returns every TAP line as a single text value.
-- Run: scripts/test-db.ps1  (or paste into the Supabase SQL editor).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temp table tap (n serial primary key, line text);
select no_plan();

-- ============================================================ fixtures
create schema tests;
grant usage on schema tests to authenticated, anon;
create table tests.rls_out (k text primary key, v bigint);
grant all on tests.rls_out to authenticated, anon;

-- ids
create function tests.s(n int) returns uuid language sql immutable as
  $$ select ('f0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create function tests.prof() returns uuid language sql immutable as $$ select 'fb000000-0000-4000-8000-000000000001'::uuid $$;
create function tests.sec()  returns uuid language sql immutable as $$ select 'f5000000-0000-4000-8000-000000000001'::uuid $$;
create function tests.sec2() returns uuid language sql immutable as $$ select 'f5000000-0000-4000-8000-000000000002'::uuid $$;
create function tests.room() returns uuid language sql immutable as $$ select 'f1000000-0000-4000-8000-000000000001'::uuid $$;
create function tests.d1()   returns uuid language sql immutable as $$ select 'fd000000-0000-4000-8000-000000000001'::uuid $$;  -- edge, room 1
create function tests.d2()   returns uuid language sql immutable as $$ select 'fd000000-0000-4000-8000-000000000002'::uuid $$;  -- ingest, room 1
create function tests.d3()   returns uuid language sql immutable as $$ select 'fd000000-0000-4000-8000-000000000003'::uuid $$;  -- edge, room 2
-- Base time: Monday 2026-11-02 10:30 Asia/Seoul. Each scenario uses its own day.
create function tests.t(d int, m numeric) returns timestamptz language sql immutable as
  $$ select '2026-11-02 01:30:00+00'::timestamptz + make_interval(days => d) + make_interval(secs => m * 60) $$;

insert into public.semesters (id, name, starts_on, ends_on)
values ('f2000000-0000-4000-8000-000000000001', 'TEST term', '2026-09-01', '2026-12-20');
insert into public.holidays (semester_id, day, name)
values ('f2000000-0000-4000-8000-000000000001', '2026-11-16', 'test holiday');
insert into public.courses (id, code, title) values ('f3000000-0000-4000-8000-000000000001', 'TST101', 'Test course');
insert into public.rooms (id, code, geofence) values
  (tests.room(), 'TST1', st_geogfromtext('SRID=4326;POLYGON((127.07290 37.55020, 127.07330 37.55020, 127.07330 37.55045, 127.07290 37.55045, 127.07290 37.55020))')),
  ('f1000000-0000-4000-8000-000000000002', 'TST2', null);
insert into public.sections (id, course_id, semester_id, section_no, room_id) values
  (tests.sec(),  'f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'T1', tests.room()),
  (tests.sec2(), 'f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'T2', tests.room());
insert into public.edge_devices (id, room_id, name, kind) values
  (tests.d1(), tests.room(), 'tst-edge', 'edge'),
  (tests.d2(), tests.room(), 'tst-ingest', 'ingest'),
  (tests.d3(), 'f1000000-0000-4000-8000-000000000002', 'tst-edge-2', 'edge');

-- users: 8 real (non-simulated) students, 1 professor, 1 self-sign-up claiming admin
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', tests.s(n), 'authenticated', 'authenticated',
       format('s%s@tst.test', n), '{"role":"student"}', jsonb_build_object('full_name', 'Test Student ' || n),
       now(), now(), '', '', '', ''
from generate_series(1, 8) n;
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', tests.prof(), 'authenticated', 'authenticated', 'prof@tst.test',
        '{"role":"professor"}', '{"full_name":"Test Prof"}', now(), now(), '', '', '', ''),
       ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'sneaky@tst.test', '{}', '{"full_name":"Sneaky","role":"admin"}', now(), now(), '', '', '', '');

insert into public.section_staff (section_id, profile_id) values (tests.sec(), tests.prof()), (tests.sec2(), tests.prof());
insert into public.enrollments (section_id, student_id, starts_on)
select tests.sec(), tests.s(n), '2026-09-01' from generate_series(1, 7) n;
insert into public.enrollments (section_id, student_id, starts_on, ends_on)   -- s8 dropped on 2026-10-31
values (tests.sec(), tests.s(8), '2026-09-01', '2026-10-31');
insert into public.enrollments (section_id, student_id, starts_on)
values (tests.sec2(), tests.s(1), '2026-09-01'), (tests.sec2(), tests.s(2), '2026-09-01');

-- helpers
create function tests.session(d int, p_section uuid default tests.sec()) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.class_sessions (section_id, room_id, session_date, starts_at, ends_at)
  values (p_section, tests.room(), (tests.t(d, 0) at time zone 'Asia/Seoul')::date, tests.t(d, 0), tests.t(d, 75))
  returning id into v;
  perform public.start_session(v, tests.t(d, -10));
  return v;
end $$;
create function tests.sid(d int, p_section uuid default tests.sec()) returns uuid language sql stable as
  $$ select id from public.class_sessions where section_id = p_section and starts_at = tests.t(d, 0) $$;
create function tests.ev(p_type text, p_session uuid, p_at timestamptz, p_payload jsonb default '{}',
                         p_id uuid default gen_random_uuid(), p_dev uuid default tests.d1())
returns jsonb language sql volatile as $$
  select jsonb_build_object('event_id', p_id, 'event_type', p_type, 'source_device_id', p_dev,
    'session_id', p_session, 'observed_at', p_at, 'model_version', 'test', 'payload', p_payload, 'simulation', false)
$$;
create function tests.rec(p_session uuid, p_student uuid, p_at timestamptz, p_id uuid default gen_random_uuid())
returns jsonb language sql volatile as $$
  select tests.ev('GATE_ENTRY_RECOGNISED', p_session, p_at,
                  jsonb_build_object('student_id', p_student, 'score', 0.62, 'margin', 0.2, 'track_id', 1), p_id)
$$;
create function tests.apply(p jsonb, p_dev uuid default tests.d1()) returns jsonb language sql volatile as
  $$ select public.apply_edge_events(p_dev, p) $$;
create function tests.st(p_session uuid, p_student uuid) returns text language sql stable as
  $$ select status::text from public.attendance where session_id = p_session and student_id = p_student $$;
create function tests.att(p_session uuid, p_student uuid) returns public.attendance language sql stable as
  $$ select * from public.attendance where session_id = p_session and student_id = p_student $$;
create function tests.attempt(p_req uuid, p_student uuid, p_at timestamptz, p_pass boolean) returns uuid
language sql volatile as $$
  insert into public.verification_attempts (request_id, student_id, face_score, liveness_ok, qr_ok, result, created_at)
  values (p_req, p_student, case when p_pass then 0.8 else 0.2 end, true, true,
          case when p_pass then 'pass' else 'fail' end, p_at)
  returning id
$$;

-- ============================================================ profile trigger
insert into tap(line) select is((select role::text from public.profiles where id = 'fc000000-0000-4000-8000-000000000001'),
  'student', 'self sign-up claiming role=admin in user metadata becomes student');
insert into tap(line) select is((select role::text from public.profiles where id = tests.prof()),
  'professor', 'role from app metadata is honoured');
-- Auth admin createUser inserts first and writes app_metadata.role afterwards: the profile must follow.
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"operator"}' where id = 'fc000000-0000-4000-8000-000000000001';
insert into tap(line) select is((select role::text from public.profiles where id = 'fc000000-0000-4000-8000-000000000001'),
  'operator', 'a later app_metadata.role change (service role only) syncs the profile role');
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"nonsense"}' where id = 'fc000000-0000-4000-8000-000000000001';
insert into tap(line) select is((select role::text from public.profiles where id = 'fc000000-0000-4000-8000-000000000001'),
  'operator', 'an unknown app_metadata role is ignored');
insert into tap(line) select is((select status from public.face_profiles where student_id = tests.s(1)),
  'pending', 'new student gets a pending face profile');
insert into tap(line) select ok((select count(*) from public.notifications where user_id = tests.s(1) and type = 'enroll_face') = 1,
  'enrolling a student without an active face creates one enroll_face notification');

-- ============================================================ A: on time / late / very late / visitor / duplicate
select tests.session(0);
create temp table r_a as select tests.apply(jsonb_build_array(
  tests.rec(tests.sid(0), tests.s(1), tests.t(0, 5), 'aa000000-0000-4000-8000-000000000001'),
  tests.rec(tests.sid(0), tests.s(2), tests.t(0, 15)),
  tests.rec(tests.sid(0), tests.s(3), tests.t(0, 40)),
  tests.ev('GATE_ENTRY_UNKNOWN', tests.sid(0), tests.t(0, 6), '{"track_id":9}'),
  tests.rec(tests.sid(0), tests.s(8), tests.t(0, 7)))) as r;

insert into tap(line) select is((select (r->>'accepted')::int from r_a), 5, 'batch: 5 events accepted');
insert into tap(line) select is((select count(*)::int from public.attendance where session_id = tests.sid(0)), 7,
  'attendance rows created for current enrollments only (dropped student excluded)');
insert into tap(line) select is(tests.st(tests.sid(0), tests.s(1)), 'present', 'on time (T0+5) -> present');
insert into tap(line) select is((tests.att(tests.sid(0), tests.s(1))).method, 'gate', 'on time method = gate');
insert into tap(line) select is(tests.st(tests.sid(0), tests.s(2)), 'late', 'late (T0+15) -> late');
insert into tap(line) select ok(exists (select 1 from public.notifications where user_id = tests.s(2) and type = 'marked_late'),
  'late student gets a marked_late notification');
insert into tap(line) select is(tests.st(tests.sid(0), tests.s(3)), 'absent', 'very late (T0+40) -> absent');
insert into tap(line) select ok('very_late' = any((tests.att(tests.sid(0), tests.s(3))).flags), 'very late flagged very_late');
insert into tap(line) select is((select count(*)::int from public.gate_events where session_id = tests.sid(0)
  and event_type = 'GATE_ENTRY_UNKNOWN' and student_id is null), 1, 'visitor stored as unknown gate event');
insert into tap(line) select is((select count(*)::int from public.attendance where student_id = tests.s(8)), 0,
  'recognised non-enrolled (dropped) student gets no attendance row');
insert into tap(line) select is(tests.st(tests.sid(0), tests.s(4)), 'pending', 'no evidence yet -> pending');

create temp table r_dup as select tests.apply(jsonb_build_array(
  tests.rec(tests.sid(0), tests.s(1), tests.t(0, 5), 'aa000000-0000-4000-8000-000000000001'))) as r;
insert into tap(line) select is((select (r->>'duplicates')::int from r_dup), 1, 'duplicate event_id reported as duplicate');
insert into tap(line) select is((select (r->>'accepted')::int from r_dup), 0, 'duplicate not accepted twice');
insert into tap(line) select is((select count(*)::int from public.edge_events where event_id = 'aa000000-0000-4000-8000-000000000001'),
  1, 'duplicate stored once');

select tests.apply(jsonb_build_array(tests.rec(tests.sid(0), tests.s(1), tests.t(0, 50))));
insert into tap(line) select is(tests.st(tests.sid(0), tests.s(1)), 'present', 'later evidence never downgrades present');
insert into tap(line) select is((tests.att(tests.sid(0), tests.s(1))).first_seen_at, tests.t(0, 5), 'first_seen_at keeps earliest evidence');

-- ============================================================ rejections
create temp table r_bad as select tests.apply(jsonb_build_array(
  tests.rec(tests.sid(0), tests.s(4), now() + interval '10 minutes'),
  tests.ev('GATE_ENTRY_UNKNOWN', tests.sid(0), tests.t(0, 8), '{}', gen_random_uuid(), tests.d3()),
  tests.ev('GATE_ENTRY_UNKNOWN', null, tests.t(0, 8)),
  '{"event_id":"not-a-uuid"}'::jsonb)) as r;
insert into tap(line) select is((select r->'rejected'->0->>'reason' from r_bad), 'observed_at_in_future', 'future observed_at rejected');
insert into tap(line) select is((select r->'rejected'->1->>'reason' from r_bad), 'device_not_allowed', 'device from another room rejected');
insert into tap(line) select is((select r->'rejected'->2->>'reason' from r_bad), 'session_required', 'gate event without session rejected');
insert into tap(line) select is((select r->'rejected'->3->>'reason' from r_bad), 'invalid_envelope', 'malformed envelope rejected');
insert into tap(line) select throws_ok(
  $$ select public.apply_edge_events(tests.d1(), (select jsonb_agg(tests.ev('EDGE_HEARTBEAT', null, now())) from generate_series(1, 501))) $$,
  '22023', 'batch too large (max 500)', 'batch over 500 events raises');
insert into tap(line) select is((tests.apply(jsonb_build_array(
  tests.ev('EDGE_HEARTBEAT', null, tests.t(0, 9), '{"cpu":12}')), tests.d2())->>'accepted')::int, 1,
  'ingest device may relay events from an edge in the same room');

-- ============================================================ B: re-entry (OUT then IN)
select tests.session(1);
select tests.apply(jsonb_build_array(
  tests.rec(tests.sid(1), tests.s(1), tests.t(1, 2)),
  tests.ev('GATE_PERSON_OUT', tests.sid(1), tests.t(1, 30), jsonb_build_object('student_id', tests.s(1))),
  tests.rec(tests.sid(1), tests.s(1), tests.t(1, 35))));
insert into tap(line) select is(tests.st(tests.sid(1), tests.s(1)), 'present', 're-entry: status unchanged (present)');
insert into tap(line) select ok((tests.att(tests.sid(1), tests.s(1))).flags @> array['gate_out','reentry'], 're-entry: gate_out + reentry flags');
insert into tap(line) select is((tests.att(tests.sid(1), tests.s(1))).first_seen_at, tests.t(1, 2), 're-entry: first_seen_at unchanged');
-- Seen twice WITHOUT an OUT in between (edge restart / standing in view): not a re-entry (migration 11).
select tests.apply(jsonb_build_array(
  tests.rec(tests.sid(1), tests.s(2), tests.t(1, 3)),
  tests.rec(tests.sid(1), tests.s(2), tests.t(1, 6))));
insert into tap(line) select is(tests.st(tests.sid(1), tests.s(2)), 'present', 'second sighting: still present');
insert into tap(line) select ok(not ((tests.att(tests.sid(1), tests.s(2))).flags && array['reentry']), 'second sighting without OUT: no reentry flag');

-- ============================================================ C: offline replay with old observed_at
select tests.session(2);
select tests.apply(jsonb_build_array(tests.rec(tests.sid(2), tests.s(1), tests.t(2, 20)),
                                     tests.ev('EDGE_HEARTBEAT', null, tests.t(2, 0))));
insert into tap(line) select is(tests.st(tests.sid(2), tests.s(1)), 'late', 'replay: newer event first -> late');
select tests.apply(jsonb_build_array(tests.rec(tests.sid(2), tests.s(1), tests.t(2, 3), 'cc000000-0000-4000-8000-000000000001')));
insert into tap(line) select is(tests.st(tests.sid(2), tests.s(1)), 'present', 'replay: older queued event upgrades to present');
insert into tap(line) select is((tests.att(tests.sid(2), tests.s(1))).first_seen_at, tests.t(2, 3), 'replay: first_seen_at = original observed_at');
insert into tap(line) select ok((select received_at - observed_at > interval '1 day' from public.edge_events
  where event_id = 'cc000000-0000-4000-8000-000000000001'), 'replay: received_at kept separate from observed_at');
select public.finalize_session(tests.sid(2), tests.t(2, 75));
insert into tap(line) select is(tests.st(tests.sid(2), tests.s(2)), 'absent', 'healthy session: no evidence -> absent at finalize');
select tests.apply(jsonb_build_array(tests.rec(tests.sid(2), tests.s(2), tests.t(2, 4))));
insert into tap(line) select is(tests.st(tests.sid(2), tests.s(2)), 'present', 'replay after finalize upgrades absent -> present');

-- ============================================================ D: camera miss + self-verify in first mismatch window
select tests.session(3);
select tests.apply(jsonb_build_array(
  tests.rec(tests.sid(3), tests.s(1), tests.t(3, 2)),
  tests.ev('OCCUPANCY_UPDATED', tests.sid(3), tests.t(3, 9.5), '{"raw":5,"smoothed":5,"stable":true}')));
select public.run_count_checks(tests.sid(3), tests.t(3, 10));
create temp table req_d1 as select id from public.verification_requests where session_id = tests.sid(3) and kind = 'mismatch';
insert into tap(line) select is((select count(*)::int from req_d1), 1, 'C > V at T0+10 opens one mismatch request');
insert into tap(line) select is((select target_count from public.verification_requests where id = (select id from req_d1)), 6,
  'mismatch targets = the 6 pending students');
insert into tap(line) select is((select count(*)::int from public.notifications where type = 'verify_now'
  and data->>'request_id' = (select id::text from req_d1)), 6, 'verify_now sent only to pending students');
insert into tap(line) select ok(not exists (select 1 from public.notifications where type = 'verify_now' and user_id = tests.s(1)),
  'already-present student gets no verify_now');
create temp table at_d as select tests.attempt((select id from req_d1), tests.s(2), tests.t(3, 12), true) as a2,
                                 tests.attempt((select id from req_d1), tests.s(3), tests.t(3, 12.5), false) as a3;
select public.apply_self_verification((select a2 from at_d));
select public.apply_self_verification((select a3 from at_d));
insert into tap(line) select is(tests.st(tests.sid(3), tests.s(2)), 'present', 'self-verify at T0+12 in FIRST mismatch window -> present');
insert into tap(line) select is((tests.att(tests.sid(3), tests.s(2))).method, 'self_verify', 'method = self_verify');
insert into tap(line) select is(tests.st(tests.sid(3), tests.s(3)), 'pending', 'failed attempt leaves student pending');
select public.close_verification_request((select id from req_d1), tests.t(3, 15));
select tests.apply(jsonb_build_array(
  tests.ev('OCCUPANCY_UPDATED', tests.sid(3), tests.t(3, 19.5), '{"raw":5,"smoothed":5,"stable":true}')));
select public.run_count_checks(tests.sid(3), tests.t(3, 20));
create temp table req_d2 as select id from public.verification_requests
  where session_id = tests.sid(3) and kind = 'mismatch' and id <> (select id from req_d1);
select public.apply_self_verification(tests.attempt((select id from req_d2), tests.s(4), tests.t(3, 21), true));
insert into tap(line) select is(tests.st(tests.sid(3), tests.s(4)), 'late', 'self-verify in a LATER mismatch window -> timing rule (late)');
select tests.apply(jsonb_build_array(
  tests.ev('OCCUPANCY_UPDATED', tests.sid(3), tests.t(3, 24.5), '{"raw":9,"smoothed":9,"stable":false}')));
select public.run_count_checks(tests.sid(3), tests.t(3, 30));
insert into tap(line) select is((select count(*)::int from public.verification_requests where session_id = tests.sid(3)), 2,
  'unstable count never opens a mismatch request');

-- ============================================================ E: end-of-class count alert (professor only) + manual recheck
-- Rule change 2026-11-22: at T_end-5 the count check only ALERTS THE PROFESSOR; nobody is sent a recheck
-- automatically. The professor starts one from the live page; non-verifiers then become left_early.
select tests.session(4);
select tests.apply(jsonb_build_array(
  tests.rec(tests.sid(4), tests.s(1), tests.t(4, 1)),
  tests.rec(tests.sid(4), tests.s(2), tests.t(4, 2)),
  tests.rec(tests.sid(4), tests.s(3), tests.t(4, 3)),
  tests.ev('OCCUPANCY_UPDATED', tests.sid(4), tests.t(4, 64.5), '{"raw":2,"smoothed":2,"stable":true}')));
select public.run_count_checks(tests.sid(4), tests.t(4, 65));
insert into tap(line) select is((select recheck_checked_at from public.class_sessions where id = tests.sid(4)), null,
  'T_end-10 is before the end-of-class check window (T_end-5)');
select tests.apply(jsonb_build_array(
  tests.ev('OCCUPANCY_UPDATED', tests.sid(4), tests.t(4, 69.5), '{"raw":3,"smoothed":3,"stable":true}')));  -- 2 students + the professor (staff_count 1)
select public.run_count_checks(tests.sid(4), tests.t(4, 70));
insert into tap(line) select is((select count(*)::int from public.verification_requests where session_id = tests.sid(4)), 0,
  'count < present at T_end-5 opens NO automatic recheck');
insert into tap(line) select ok(exists (select 1 from public.notifications where user_id = tests.prof() and type = 'count_alert'
  and data->>'session_id' = tests.sid(4)::text and (data->>'counted')::int = 2 and (data->>'verified')::int = 3),
  'professor alerted: 2 in the room, 3 marked present');
insert into tap(line) select is((select count(*)::int from public.notifications where type = 'recheck_now'
  and data->>'session_id' = tests.sid(4)::text), 0, 'students are not notified by the count check');
-- The professor presses "Start recheck" on the live page.
select public.open_verification_request(tests.sid(4), 'recheck', tests.prof(), tests.t(4, 70.5));
create temp table req_e as select id from public.verification_requests where session_id = tests.sid(4) and kind = 'recheck';
insert into tap(line) select is((select count(*)::int from req_e), 1, 'professor-started recheck opened');
insert into tap(line) select is((select state::text from public.class_sessions where id = tests.sid(4)), 'recheck', 'session state -> recheck');
insert into tap(line) select is((select count(*)::int from public.notifications where type = 'recheck_now'
  and data->>'request_id' = (select id::text from req_e)), 3, 'recheck_now sent to the 3 present students');
select public.apply_self_verification(tests.attempt((select id from req_e), tests.s(1), tests.t(4, 71), true));
insert into tap(line) select is(public.close_verification_request((select id from req_e), tests.t(4, 74.5)), 2,
  'closing the recheck marks 2 non-verifiers');
insert into tap(line) select is(tests.st(tests.sid(4), tests.s(1)), 'present', 'recheck passer stays present');
insert into tap(line) select is(tests.st(tests.sid(4), tests.s(2)), 'left_early', 'recheck non-verifier -> left_early');
insert into tap(line) select ok('recheck_failed' = any((tests.att(tests.sid(4), tests.s(3))).flags), 'left_early flagged recheck_failed');
insert into tap(line) select is(tests.st(tests.sid(4), tests.s(4)), 'pending', 'student never sent the recheck is untouched');
insert into tap(line) select ok(exists (select 1 from public.audit_log where entity = 'attendance'
  and entity_id = tests.sid(4) || ':' || tests.s(2) and reason = 'recheck not passed'), 'left_early change audited with reason');

-- ============================================================ K: exit camera - left and never came back -> absent
select tests.session(12);
select tests.apply(jsonb_build_array(
  tests.rec(tests.sid(12), tests.s(1), tests.t(12, 1)),
  tests.rec(tests.sid(12), tests.s(2), tests.t(12, 2)),
  tests.rec(tests.sid(12), tests.s(3), tests.t(12, 3)),
  tests.ev('GATE_PERSON_OUT', tests.sid(12), tests.t(12, 20), jsonb_build_object('track_id', 7, 'student_id', tests.s(1))),
  tests.ev('GATE_PERSON_OUT', tests.sid(12), tests.t(12, 30), jsonb_build_object('track_id', 8, 'student_id', tests.s(2))),
  tests.rec(tests.sid(12), tests.s(2), tests.t(12, 35)),
  tests.ev('OCCUPANCY_UPDATED', tests.sid(12), tests.t(12, 69.5), '{"raw":4,"smoothed":4,"stable":true}')));  -- 3 students + the professor
select public.run_count_checks(tests.sid(12), tests.t(12, 70));
insert into tap(line) select is((select count(*)::int from public.notifications where user_id = tests.prof() and type = 'count_alert'
  and data->>'session_id' = tests.sid(12)::text), 0, 'count equals present at T_end-5 -> no professor alert');
create temp table fin_k as select public.finalize_session(tests.sid(12), tests.t(12, 75)) as r;
insert into tap(line) select is(tests.st(tests.sid(12), tests.s(1)), 'absent', 'went OUT at T0+20 and never came back -> absent');
insert into tap(line) select ok('left_no_return' = any((tests.att(tests.sid(12), tests.s(1))).flags), 'flagged left_no_return');
insert into tap(line) select is(tests.st(tests.sid(12), tests.s(2)), 'present', 'went OUT and came back through the door -> stays present');
insert into tap(line) select ok('reentry' = any((tests.att(tests.sid(12), tests.s(2))).flags), 'come-back flagged reentry');
insert into tap(line) select is(tests.st(tests.sid(12), tests.s(3)), 'present', 'never left -> present');
insert into tap(line) select is(((select r from fin_k)->>'left_no_return')::int, 1, 'finalize reports 1 left_no_return');
insert into tap(line) select ok(exists (select 1 from public.audit_log where entity = 'attendance'
  and entity_id = tests.sid(12) || ':' || tests.s(1) and reason = 'left without returning'), 'absent change audited with reason');
insert into tap(line) select ok(exists (select 1 from public.notifications where user_id = tests.s(1) and type = 'marked_absent'
  and data->>'session_id' = tests.sid(12)::text), 'student told they were marked absent');

-- ============================================================ G: left without the door naming them (room camera + end count)
-- s1 seen in the room only early, s2 seen until the end, s3 seen until the end but head down at the very end is fine;
-- s4 last seen at 30 min. Room count at the end = 3 people (professor + 2 students): 2 of 4 marked students are gone.
select tests.session(19);
select tests.apply(jsonb_build_array(
  tests.rec(tests.sid(19), tests.s(1), tests.t(19, 1)),
  tests.rec(tests.sid(19), tests.s(2), tests.t(19, 2)),
  tests.rec(tests.sid(19), tests.s(3), tests.t(19, 3)),
  tests.rec(tests.sid(19), tests.s(4), tests.t(19, 4)),
  tests.ev('ROOM_SEEN', tests.sid(19), tests.t(19, 6), jsonb_build_object('student_id', tests.s(1))),
  tests.ev('ROOM_SEEN', tests.sid(19), tests.t(19, 30), jsonb_build_object('student_id', tests.s(4))),
  tests.ev('ROOM_SEEN', tests.sid(19), tests.t(19, 68), jsonb_build_object('student_id', tests.s(3))),
  tests.ev('ROOM_SEEN', tests.sid(19), tests.t(19, 70), jsonb_build_object('student_id', tests.s(2))),
  tests.ev('OCCUPANCY_UPDATED', tests.sid(19), tests.t(19, 74), '{"raw":3,"smoothed":3,"stable":true}')));
create temp table fin_g as select public.finalize_session(tests.sid(19), tests.t(19, 75)) as r;
insert into tap(line) select is(tests.st(tests.sid(19), tests.s(1)), 'absent', 'not seen in the room since minute 6, count short -> absent');
insert into tap(line) select is(tests.st(tests.sid(19), tests.s(4)), 'absent', 'not seen since minute 30, count short -> absent');
insert into tap(line) select ok('left_no_return' = any((tests.att(tests.sid(19), tests.s(4))).flags), 'flagged left_no_return');
insert into tap(line) select is(tests.st(tests.sid(19), tests.s(2)), 'present', 'seen in the room at the end -> present');
insert into tap(line) select is(tests.st(tests.sid(19), tests.s(3)), 'present', 'seen 2 min before the last sighting -> present');
insert into tap(line) select is(((select r from fin_g)->>'not_in_room_at_end')::int, 2, 'finalize reports 2 not_in_room_at_end');
insert into tap(line) select ok(exists (select 1 from public.notifications where user_id = tests.prof() and type = 'left_no_return'
  and data->>'session_id' = tests.sid(19)::text), 'professor told');

-- same picture, but the room count at the end matches -> nobody changed
select tests.session(20);
select tests.apply(jsonb_build_array(
  tests.rec(tests.sid(20), tests.s(1), tests.t(20, 1)),
  tests.rec(tests.sid(20), tests.s(2), tests.t(20, 2)),
  tests.ev('ROOM_SEEN', tests.sid(20), tests.t(20, 6), jsonb_build_object('student_id', tests.s(1))),
  tests.ev('ROOM_SEEN', tests.sid(20), tests.t(20, 70), jsonb_build_object('student_id', tests.s(2))),
  tests.ev('OCCUPANCY_UPDATED', tests.sid(20), tests.t(20, 74), '{"raw":3,"smoothed":3,"stable":true}')));
select public.finalize_session(tests.sid(20), tests.t(20, 75));
insert into tap(line) select is(tests.st(tests.sid(20), tests.s(1)), 'present', 'head down but the count says everyone is there -> present');

-- ============================================================ H: the door marks attendance only in the first 17% (75 min -> 12.75)
select tests.session(18);
select tests.apply(jsonb_build_array(
  tests.rec(tests.sid(18), tests.s(1), tests.t(18, 12)),
  tests.rec(tests.sid(18), tests.s(2), tests.t(18, 20)),
  tests.rec(tests.sid(18), tests.s(3), tests.t(18, 5)),
  tests.ev('GATE_PERSON_OUT', tests.sid(18), tests.t(18, 30), jsonb_build_object('track_id', 4, 'student_id', tests.s(3))),
  tests.rec(tests.sid(18), tests.s(3), tests.t(18, 40)),
  tests.ev('ROOM_SEEN', tests.sid(18), tests.t(18, 22), jsonb_build_object('student_id', tests.s(4)))));
insert into tap(line) select is(tests.st(tests.sid(18), tests.s(1)), 'late', 'door at 12 min (before 12.75) -> marked late');
insert into tap(line) select is(tests.st(tests.sid(18), tests.s(2)), 'pending', 'door at 20 min (after 12.75) -> not marked by the door');
insert into tap(line) select ok(exists (select 1 from public.gate_events where session_id = tests.sid(18) and student_id = tests.s(2)),
  'the 20-min door sighting is still stored');
insert into tap(line) select ok('reentry' = any((tests.att(tests.sid(18), tests.s(3))).flags), 'marked student back at 40 min -> reentry still works');
insert into tap(line) select is(tests.st(tests.sid(18), tests.s(3)), 'present', 're-entered student stays present');
insert into tap(line) select is(tests.st(tests.sid(18), tests.s(4)), 'late', 'room camera at 22 min still marks (late)');

-- ============================================================ F: gate camera offline -> pending, not absent
select tests.session(5);
select tests.apply(jsonb_build_array(
  tests.ev('CAMERA_OFFLINE', tests.sid(5), tests.t(5, -1), '{"camera":"gate"}'),
  tests.ev('CAMERA_ONLINE',  tests.sid(5), tests.t(5, 8),  '{"camera":"gate"}'),
  tests.rec(tests.sid(5), tests.s(1), tests.t(5, 9))));
create temp table fin_f as select public.finalize_session(tests.sid(5), tests.t(5, 75)) as r;
insert into tap(line) select is((select gate_offline_seconds from public.class_sessions where id = tests.sid(5)), 480,
  'gate offline 8 of 10 on-time minutes = 480 s');
insert into tap(line) select is((select (r->>'healthy')::boolean from fin_f), false, 'finalize: devices unhealthy');
insert into tap(line) select is(tests.st(tests.sid(5), tests.s(2)), 'pending', 'gate camera offline -> pending, NOT absent');
insert into tap(line) select ok('needs_review' = any((tests.att(tests.sid(5), tests.s(2))).flags), 'pending student flagged needs_review');
insert into tap(line) select is((select state::text from public.class_sessions where id = tests.sid(5)), 'ended', 'session ended');

select tests.session(6);
select tests.apply(jsonb_build_array(tests.ev('EDGE_HEARTBEAT', null, tests.t(6, 0))));
select public.finalize_session(tests.sid(6), tests.t(6, 75));
insert into tap(line) select is(tests.st(tests.sid(6), tests.s(2)), 'absent', 'healthy devices + no evidence -> absent');
insert into tap(line) select ok(exists (select 1 from public.notifications where user_id = tests.s(2) and type = 'marked_absent'),
  'absent student notified');

select tests.session(7);
select public.finalize_session(tests.sid(7), tests.t(7, 75));
insert into tap(line) select is(tests.st(tests.sid(7), tests.s(2)), 'pending', 'edge never ran (no events) -> pending, NOT absent');

-- ============================================================ G: gallery + face matching
insert into public.face_embeddings (student_id, embedding)
select n_student, (select array_agg(case when i = n_idx then 1.0 else 0.0 end)::real[]::vector(512)
                   from generate_series(1, 512) i)
from (values (tests.s(1), 1), (tests.s(1), 2), (tests.s(8), 3), (tests.s(5), 4)) v(n_student, n_idx);
update public.face_profiles set status = 'active' where student_id in (tests.s(1), tests.s(8));
create temp table gal as select public.session_gallery(tests.sid(0)) as g;
insert into tap(line) select is((select jsonb_array_length(g->'students') from gal), 1,
  'gallery: only active + currently enrolled students (dropped s8 and inactive s5 excluded)');
insert into tap(line) select is((select g->'students'->0->>'id' from gal), tests.s(1)::text, 'gallery contains the enrolled active student');
insert into tap(line) select is((select jsonb_array_length(g->'students'->0->'embeddings'->0) from gal), 512, 'gallery embeddings are 512-d');
insert into tap(line) select is(round(public.match_face(tests.s(1),
  (select embedding from public.face_embeddings where student_id = tests.s(1) order by id limit 1))::numeric, 3), 1.000,
  'match_face: own embedding scores 1.0');
insert into tap(line) select ok(not exists (select 1 from public.match_face_any(
  (select embedding from public.face_embeddings where student_id = tests.s(1) order by id limit 1), tests.s(1))
  where student_id = tests.s(1)), 'match_face_any excludes the given student');

-- ============================================================ H: cancelled session excluded from %
select tests.session(8, tests.sec2());
select tests.apply(jsonb_build_array(tests.rec(tests.sid(8, tests.sec2()), tests.s(1), tests.t(8, 1)),
                                     tests.ev('EDGE_HEARTBEAT', null, tests.t(8, 0))));
select public.finalize_session(tests.sid(8, tests.sec2()), tests.t(8, 75));
select tests.session(9, tests.sec2());
select public.cancel_session(tests.sid(9, tests.sec2()), 'professor sick');
create temp table sum_h as select * from public.attendance_summary(tests.s(1), tests.sec2());
insert into tap(line) select is((select held from sum_h), 1, 'cancelled session not counted as held');
insert into tap(line) select is((select pct from sum_h), 100.0, 'attendance % = 100 with one present, one cancelled');
insert into tap(line) select is((select pct from public.attendance_summary(tests.s(2), tests.sec2())), 0.0, 'absent student % = 0');
insert into tap(line) select ok(exists (select 1 from public.notifications where user_id = tests.s(2) and type = 'class_cancelled'),
  'students notified of cancellation');

-- ============================================================ I: session_tick (timetable, Asia/Seoul, holidays, lock)
insert into public.timetable_slots (id, section_id, weekday, start_time, end_time)
values ('f6000000-0000-4000-8000-000000000001', tests.sec(), 1, '10:30', '11:45');
select public.session_tick('2026-11-09 01:00:00+00');   -- Mon 10:00 KST
insert into tap(line) select is((select starts_at from public.class_sessions where slot_id = 'f6000000-0000-4000-8000-000000000001'
  and session_date = '2026-11-09'), '2026-11-09 01:30:00+00'::timestamptz, 'tick creates the session at 10:30 Asia/Seoul');
insert into tap(line) select is((select state::text from public.class_sessions where slot_id = 'f6000000-0000-4000-8000-000000000001'
  and session_date = '2026-11-09'), 'scheduled', 'still scheduled 30 min before start');
select public.session_tick('2026-11-09 01:21:00+00');   -- 10:21 KST
insert into tap(line) select is((select state::text from public.class_sessions where slot_id = 'f6000000-0000-4000-8000-000000000001'
  and session_date = '2026-11-09'), 'live', 'goes live at T0-10');
insert into tap(line) select is((select count(*)::int from public.attendance a join public.class_sessions s on s.id = a.session_id
  where s.slot_id = 'f6000000-0000-4000-8000-000000000001' and s.session_date = '2026-11-09'), 7, 'live session has 7 pending rows');
insert into tap(line) select ok(exists (select 1 from public.session_secrets ss join public.class_sessions s on s.id = ss.session_id
  where s.slot_id = 'f6000000-0000-4000-8000-000000000001' and s.session_date = '2026-11-09'), 'QR secret generated at start');
select public.session_tick('2026-11-09 03:00:00+00');   -- 12:00 KST, after T_end
insert into tap(line) select is((select state::text from public.class_sessions where id = tests.sid(5)), 'locked',
  'ended session locks after 48 h');
insert into tap(line) select is((select state::text from public.class_sessions where slot_id = 'f6000000-0000-4000-8000-000000000001'
  and session_date = '2026-11-09'), 'ended', 'tick finalizes the session after T_end');
select public.session_tick('2026-11-16 01:00:00+00');   -- holiday Monday, one week later
insert into tap(line) select is((select count(*)::int from public.class_sessions where slot_id = 'f6000000-0000-4000-8000-000000000001'
  and session_date = '2026-11-16'), 0, 'no session on a holiday');
insert into tap(line) select is((select state::text from public.class_sessions where slot_id = 'f6000000-0000-4000-8000-000000000001'
  and session_date = '2026-11-09'), 'locked', 'a week later the session is locked');

-- ============================================================ J: RLS
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into tests.rls_out select 'own', count(*) from public.attendance where student_id = 'f0000000-0000-4000-8000-000000000001';
insert into tests.rls_out select 'others', count(*) from public.attendance where student_id <> 'f0000000-0000-4000-8000-000000000001';
insert into tests.rls_out select 'audit', count(*) from public.audit_log;
insert into tests.rls_out select 'secrets', count(*) from public.session_secrets;
insert into tests.rls_out select 'embeddings', count(*) from public.face_embeddings;
insert into tests.rls_out select 'other_profiles', count(*) from public.profiles
  where role = 'student' and id <> 'f0000000-0000-4000-8000-000000000001';
do $$ begin
  update public.profiles set role = 'admin' where id = 'f0000000-0000-4000-8000-000000000001';
  insert into tests.rls_out values ('role_change', 1);
exception when others then
  insert into tests.rls_out values ('role_change_blocked', 1);
end $$;
do $$ begin
  perform public.apply_edge_events('fd000000-0000-4000-8000-000000000001', '[]'::jsonb);
  insert into tests.rls_out values ('edge_rpc', 1);
exception when insufficient_privilege then
  insert into tests.rls_out values ('edge_rpc_blocked', 1);
end $$;
set local request.jwt.claims = '{"sub":"fb000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into tests.rls_out select 'prof_rows', count(*) from public.attendance where session_id = tests.sid(0);
insert into tests.rls_out select 'prof_profiles', count(*) from public.profiles where id = 'f0000000-0000-4000-8000-000000000003';
reset role;
set local role anon;
do $$ begin
  perform count(*) from public.attendance;
  insert into tests.rls_out values ('anon_read', 1);
exception when insufficient_privilege then
  insert into tests.rls_out values ('anon_denied', 1);
end $$;
reset role;

insert into tap(line) select ok((select v from tests.rls_out where k = 'own') > 0, 'RLS: student reads own attendance');
insert into tap(line) select is((select v from tests.rls_out where k = 'others'), 0::bigint, 'RLS: student cannot read another student''s attendance');
insert into tap(line) select is((select v from tests.rls_out where k = 'audit'), 0::bigint, 'RLS: student cannot read audit log');
insert into tap(line) select is((select v from tests.rls_out where k = 'secrets'), 0::bigint, 'RLS: student cannot read QR secrets');
insert into tap(line) select is((select v from tests.rls_out where k = 'embeddings'), 0::bigint, 'RLS: student cannot read face embeddings');
insert into tap(line) select is((select v from tests.rls_out where k = 'other_profiles'), 0::bigint, 'RLS: student cannot read other students'' profiles');
insert into tap(line) select ok(exists (select 1 from tests.rls_out where k = 'role_change_blocked'), 'student cannot change own role');
insert into tap(line) select ok(exists (select 1 from tests.rls_out where k = 'edge_rpc_blocked'), 'signed-in users cannot call apply_edge_events');
insert into tap(line) select is((select v from tests.rls_out where k = 'prof_rows'), 7::bigint, 'RLS: professor reads own section roster');
insert into tap(line) select is((select v from tests.rls_out where k = 'prof_profiles'), 1::bigint, 'RLS: professor reads own students'' profiles');
insert into tap(line) select ok(exists (select 1 from tests.rls_out where k = 'anon_denied'), 'anon cannot read attendance');

-- ============================================================ output
insert into tap(line) select * from finish();
select string_agg(line, E'\n' order by n) as tap from tap;
rollback;
