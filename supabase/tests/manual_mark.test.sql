-- manual_mark (migration 12) tests. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temp table tap (n serial primary key, line text);
grant all on tap to authenticated;
grant usage, select on sequence tap_n_seq to authenticated;
select no_plan();

insert into public.semesters (id, name, starts_on, ends_on) values ('f2000000-0000-4000-8000-0000000000a1', 'MM term', '2026-09-01', '2026-12-20');
insert into public.courses (id, code, title) values ('f3000000-0000-4000-8000-0000000000a1', 'MM101', 'Manual mark');
insert into public.rooms (id, code) values ('f1000000-0000-4000-8000-0000000000a1', 'MM1');
insert into public.sections (id, course_id, semester_id, section_no, room_id)
values ('f5000000-0000-4000-8000-0000000000a1', 'f3000000-0000-4000-8000-0000000000a1', 'f2000000-0000-4000-8000-0000000000a1', 'M1', 'f1000000-0000-4000-8000-0000000000a1');
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change) values
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'mm-s@tst.test',
   '{"role":"student"}', '{"full_name":"MM Student"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'mm-p@tst.test',
   '{"role":"professor"}', '{"full_name":"MM Prof"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'mm-p2@tst.test',
   '{"role":"professor"}', '{"full_name":"Other Prof"}', now(), now(), '', '', '', '');
insert into public.section_staff (section_id, profile_id) values ('f5000000-0000-4000-8000-0000000000a1', 'fb000000-0000-4000-8000-0000000000a1');
insert into public.enrollments (section_id, student_id, starts_on) values ('f5000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a1', '2026-09-01');
insert into public.class_sessions (id, section_id, room_id, session_date, starts_at, ends_at)
values ('fe000000-0000-4000-8000-0000000000a1', 'f5000000-0000-4000-8000-0000000000a1', 'f1000000-0000-4000-8000-0000000000a1',
        current_date, now() - interval '20 minutes', now() + interval '55 minutes');
select public.start_session('fe000000-0000-4000-8000-0000000000a1', now() - interval '30 minutes');

-- server (no JWT) cannot use it: manual marks need a person
insert into tap(line) select throws_ok(
  $$ select public.manual_mark('fe000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a1', 'present', 'seen in class') $$,
  '42501', null, 'manual_mark refuses calls without a signed-in user');

set local role authenticated;
-- another professor (not staff of this section)
set local request.jwt.claims = '{"sub":"fb000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
insert into tap(line) select throws_ok(
  $$ select public.manual_mark('fe000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a1', 'present', 'seen in class') $$,
  '42501', null, 'a professor of another section cannot mark');
-- the student themself
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
insert into tap(line) select throws_ok(
  $$ select public.manual_mark('fe000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a1', 'present', 'trust me') $$,
  '42501', null, 'a student cannot mark themself');
-- the section's professor
set local request.jwt.claims = '{"sub":"fb000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
insert into tap(line) select throws_ok(
  $$ select public.manual_mark('fe000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a1', 'present', ' ') $$,
  '22023', 'a reason is required', 'reason is mandatory');
insert into tap(line) select throws_ok(
  $$ select public.manual_mark('fe000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a1', 'pending', 'reset') $$,
  '22023', null, 'pending cannot be set manually');
select public.manual_mark('fe000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a1', 'present', 'camera missed, seen in seat 4');
reset role;

insert into tap(line) select is((select status::text || '/' || method from public.attendance
  where session_id = 'fe000000-0000-4000-8000-0000000000a1' and student_id = 'f0000000-0000-4000-8000-0000000000a1'),
  'present/manual', 'professor manual mark -> present, method manual');
insert into tap(line) select ok(exists (select 1 from public.audit_log where entity = 'attendance'
  and entity_id = 'fe000000-0000-4000-8000-0000000000a1:f0000000-0000-4000-8000-0000000000a1'
  and actor = 'fb000000-0000-4000-8000-0000000000a1' and reason = 'manual: camera missed, seen in seat 4'),
  'manual mark audited with the professor as actor and the reason');
insert into tap(line) select ok(exists (select 1 from public.attendance_evidence where session_id = 'fe000000-0000-4000-8000-0000000000a1'
  and source = 'manual' and weight = 'strong'), 'manual evidence row written');
insert into tap(line) select ok(exists (select 1 from public.notifications where user_id = 'f0000000-0000-4000-8000-0000000000a1'
  and type = 'status_changed'), 'student notified of the change');

insert into tap(line) select * from finish();
select string_agg(line, E'\n' order by n) as tap from tap;
rollback;
