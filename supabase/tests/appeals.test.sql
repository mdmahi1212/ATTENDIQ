-- Appeals (migration 14) + lock + at-risk tests. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temp table tap (n serial primary key, line text);
grant all on tap to authenticated;
grant usage, select on sequence tap_n_seq to authenticated;
select no_plan();

insert into public.semesters (id, name, starts_on, ends_on) values ('f2000000-0000-4000-8000-0000000000b1', 'AP term', '2026-09-01', '2026-12-20');
insert into public.courses (id, code, title) values ('f3000000-0000-4000-8000-0000000000b1', 'AP101', 'Appeals');
insert into public.rooms (id, code) values ('f1000000-0000-4000-8000-0000000000b1', 'AP1');
insert into public.sections (id, course_id, semester_id, section_no, room_id)
values ('f5000000-0000-4000-8000-0000000000b1', 'f3000000-0000-4000-8000-0000000000b1', 'f2000000-0000-4000-8000-0000000000b1', 'A1', 'f1000000-0000-4000-8000-0000000000b1');
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change) values
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'ap-s1@tst.test', '{"role":"student"}', '{"full_name":"AP One"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'ap-s2@tst.test', '{"role":"student"}', '{"full_name":"AP Two"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'ap-p@tst.test', '{"role":"professor"}', '{"full_name":"AP Prof"}', now(), now(), '', '', '', '');
insert into public.section_staff (section_id, profile_id) values ('f5000000-0000-4000-8000-0000000000b1', 'fb000000-0000-4000-8000-0000000000b1');
insert into public.enrollments (section_id, student_id, starts_on) values
  ('f5000000-0000-4000-8000-0000000000b1', 'f0000000-0000-4000-8000-0000000000b1', '2026-09-01'),
  ('f5000000-0000-4000-8000-0000000000b1', 'f0000000-0000-4000-8000-0000000000b2', '2026-09-01');
-- one finished session (3 h ago) and one still live
insert into public.class_sessions (id, section_id, room_id, session_date, starts_at, ends_at) values
  ('fe000000-0000-4000-8000-0000000000b1', 'f5000000-0000-4000-8000-0000000000b1', 'f1000000-0000-4000-8000-0000000000b1', current_date, now() - interval '3 hours', now() - interval '2 hours'),
  ('fe000000-0000-4000-8000-0000000000b2', 'f5000000-0000-4000-8000-0000000000b1', 'f1000000-0000-4000-8000-0000000000b1', current_date, now() - interval '10 minutes', now() + interval '60 minutes');
select public.start_session('fe000000-0000-4000-8000-0000000000b1', now() - interval '3 hours 10 minutes');
select public.start_session('fe000000-0000-4000-8000-0000000000b2', now() - interval '20 minutes');
insert into public.edge_devices (id, room_id, name, kind) values ('fd000000-0000-4000-8000-0000000000b1', 'f1000000-0000-4000-8000-0000000000b1', 'ap-edge', 'edge');
select public.apply_edge_events('fd000000-0000-4000-8000-0000000000b1', jsonb_build_array(jsonb_build_object(
  'event_id', gen_random_uuid(), 'event_type', 'EDGE_HEARTBEAT', 'source_device_id', 'fd000000-0000-4000-8000-0000000000b1',
  'observed_at', now() - interval '3 hours', 'payload', '{}'::jsonb)));
select public.finalize_session('fe000000-0000-4000-8000-0000000000b1');   -- healthy -> both absent
insert into tap(line) select is((select status::text from public.attendance where session_id = 'fe000000-0000-4000-8000-0000000000b1'
  and student_id = 'f0000000-0000-4000-8000-0000000000b1'), 'absent', 'finalized session: student absent');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
insert into tap(line) select throws_ok(
  $$ select public.file_appeal('fe000000-0000-4000-8000-0000000000b2', 'I was there but my phone died', 'present') $$,
  '55000', 'appeals open after the class has ended', 'no appeal while the class is still running');
insert into tap(line) select throws_ok(
  $$ select public.file_appeal('fe000000-0000-4000-8000-0000000000b1', 'short', 'excused') $$,
  '22023', null, 'a real reason is required');
insert into tap(line) select throws_ok(
  $$ select public.file_appeal('fe000000-0000-4000-8000-0000000000b1', 'I was in hospital, note attached', 'excused', 'f0000000-0000-4000-8000-0000000000b2/x.pdf') $$,
  '42501', 'invalid attachment', 'cannot attach a file from another student''s folder');
create temp table ap_id as select public.file_appeal('fe000000-0000-4000-8000-0000000000b1', 'I was in hospital, note attached', 'excused',
  'f0000000-0000-4000-8000-0000000000b1/note.pdf') as id;
insert into tap(line) select throws_ok(
  $$ select public.file_appeal('fe000000-0000-4000-8000-0000000000b1', 'second appeal for the same class', 'present') $$,
  '23505', null, 'only one open appeal per class');
insert into tap(line) select throws_ok(
  $$ select public.decide_appeal((select id from ap_id), true, 'approving my own appeal') $$,
  '42501', null, 'a student cannot decide an appeal');
-- the other student cannot see this appeal (RLS)
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-0000000000b2","role":"authenticated"}';
insert into tap(line) select is((select count(*)::int from public.appeals), 0, 'RLS: other students do not see the appeal');
-- the professor decides
set local request.jwt.claims = '{"sub":"fb000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
insert into tap(line) select is((select count(*)::int from public.appeals), 1, 'RLS: the section professor sees the appeal');
insert into tap(line) select throws_ok(
  $$ select public.decide_appeal((select id from ap_id), true, '') $$, '22023', null, 'decision note required');
select public.decide_appeal((select id from ap_id), true, 'hospital note checked');
insert into tap(line) select throws_ok(
  $$ select public.decide_appeal((select id from ap_id), false, 'changed my mind') $$, '55000', null, 'an appeal is decided once');
reset role;

insert into tap(line) select is((select status::text || '/' || method from public.attendance where session_id = 'fe000000-0000-4000-8000-0000000000b1'
  and student_id = 'f0000000-0000-4000-8000-0000000000b1'), 'excused/appeal', 'approved appeal -> excused, method appeal');
insert into tap(line) select ok(exists (select 1 from public.audit_log where entity = 'attendance'
  and entity_id = 'fe000000-0000-4000-8000-0000000000b1:f0000000-0000-4000-8000-0000000000b1'
  and actor = 'fb000000-0000-4000-8000-0000000000b1' and reason = 'appeal approved: hospital note checked'), 'appeal decision audited (actor + reason)');
insert into tap(line) select ok(exists (select 1 from public.notifications where user_id = 'f0000000-0000-4000-8000-0000000000b1' and type = 'appeal_update'),
  'student notified of the decision');
insert into tap(line) select ok(exists (select 1 from public.notifications where user_id = 'fb000000-0000-4000-8000-0000000000b1' and type = 'appeal_submitted'),
  'professor notified of the new appeal');

-- lock: after lock_after_hours the professor can no longer edit, but an appeal decision still applies
update public.class_sessions set state = 'locked', locked_at = now() where id = 'fe000000-0000-4000-8000-0000000000b1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"fb000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
insert into tap(line) select throws_ok(
  $$ select public.manual_mark('fe000000-0000-4000-8000-0000000000b1', 'f0000000-0000-4000-8000-0000000000b2', 'present', 'late edit') $$,
  '55000', null, 'locked session: professor manual edit refused');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-0000000000b2","role":"authenticated"}';
create temp table ap2 as select public.file_appeal('fe000000-0000-4000-8000-0000000000b1', 'Gate camera missed me, I sat in row 2', 'present') as id;
set local request.jwt.claims = '{"sub":"fb000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select public.decide_appeal((select id from ap2), false, 'no evidence');
reset role;
insert into tap(line) select is((select status::text from public.attendance where session_id = 'fe000000-0000-4000-8000-0000000000b1'
  and student_id = 'f0000000-0000-4000-8000-0000000000b2'), 'absent', 'rejected appeal leaves the status unchanged (locked session)');

-- at-risk: student 2 has 0 % -> warned once, not twice
set local role authenticated;
set local request.jwt.claims = '{"sub":"fb000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
insert into tap(line) select is(public.notify_at_risk('f5000000-0000-4000-8000-0000000000b1'), 1, 'one at-risk student warned (the excused one is at 100 %)');
insert into tap(line) select is(public.notify_at_risk('f5000000-0000-4000-8000-0000000000b1'), 0, 'not warned again within 6 days');
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
insert into tap(line) select throws_ok($$ select public.notify_at_risk('f5000000-0000-4000-8000-0000000000b1') $$, '42501', null, 'students cannot send warnings');
reset role;

insert into tap(line) select * from finish();
select string_agg(line, E'\n' order by n) as tap from tap;
rollback;
