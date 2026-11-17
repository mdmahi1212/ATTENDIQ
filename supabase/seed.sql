-- Demo university. Safe to re-run (every insert is idempotent).
-- Fixed UUIDs so the simulator and tests can address rows directly.
--   department  10000000-0000-4000-8000-000000000001
--   semester    20000000-0000-4000-8000-000000000001
--   courses     30000000-0000-4000-8000-00000000000{1,2}   IOT401, AIE302
--   room B204   40000000-0000-4000-8000-000000000001
--   sections    50000000-0000-4000-8000-00000000000{1,2}   IOT401-01 (demo), AIE302-01
--   admin       a0000000-0000-4000-8000-000000000001       admin@attendance.test
--   professor   b0000000-0000-4000-8000-000000000001       professor@attendance.test
--   sim student 5a000000-0000-4000-8000-0000000000NN       NN = 01..30, SIM-0NN
--   devices     e0000000-0000-4000-8000-00000000000{1,2,3} edge-B204, ingest-B204, simulator-B204
--
-- No passwords are seeded. Admin/professor passwords are set later with the admin API
-- (Phase 2 script) or "Send password recovery" in the Supabase dashboard.
-- Device keys: run scripts/new-device-key.ps1 (prints the plaintext key once, stores only its hash).
-- Real students: they sign up themselves; add their emails to pending_enrollments (see bottom).

begin;

insert into public.departments (id, name) values
  ('10000000-0000-4000-8000-000000000001', 'Computer Science & Engineering')
on conflict do nothing;

insert into public.semesters (id, name, starts_on, ends_on) values
  ('20000000-0000-4000-8000-000000000001', '2026 Fall', '2026-09-01', '2026-12-20')
on conflict do nothing;

insert into public.holidays (semester_id, day, kind, name) values
  ('20000000-0000-4000-8000-000000000001', '2026-10-03', 'holiday', 'National Foundation Day'),
  ('20000000-0000-4000-8000-000000000001', '2026-10-09', 'holiday', 'Hangul Day'),
  ('20000000-0000-4000-8000-000000000001', '2026-12-25', 'holiday', 'Christmas')
on conflict do nothing;

insert into public.courses (id, code, title, department_id, credits) values
  ('30000000-0000-4000-8000-000000000001', 'IOT401', 'Internet of Things',      '10000000-0000-4000-8000-000000000001', 3),
  ('30000000-0000-4000-8000-000000000002', 'AIE302', 'Applied Machine Learning', '10000000-0000-4000-8000-000000000001', 3)
on conflict do nothing;

-- Placeholder geofence near Sejong University (redraw it in the admin UI).
insert into public.rooms (id, code, name, building, floor, geofence, max_gps_accuracy_m, require_qr) values
  ('40000000-0000-4000-8000-000000000001', 'B204', 'Lecture Room B204', 'Daeyang AI Center', 2,
   extensions.st_geogfromtext('SRID=4326;POLYGON((127.07290 37.55020, 127.07330 37.55020, 127.07330 37.55045, 127.07290 37.55045, 127.07290 37.55020))'),
   40, true)
on conflict do nothing;

insert into public.sections (id, course_id, semester_id, section_no, room_id) values
  ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '01', '40000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '01', '40000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- Asia/Seoul local times. IOT401: Mon + Wed 10:30-11:45. AIE302: Tue + Thu 13:30-14:45.
insert into public.timetable_slots (id, section_id, weekday, start_time, end_time) values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 1, '10:30', '11:45'),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 3, '10:30', '11:45'),
  ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000002', 2, '13:30', '14:45'),
  ('60000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000002', 4, '13:30', '14:45')
on conflict do nothing;

-- ---------------------------------------------------------------- people (auth.users -> profiles via trigger)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), u.app, u.meta, now(), now(), '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'admin@attendance.test',
   '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb, '{"full_name":"Demo Admin"}'::jsonb),
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'professor@attendance.test',
   '{"provider":"email","providers":["email"],"role":"professor"}'::jsonb, '{"full_name":"Prof. Demo Kim"}'::jsonb)
) as u(id, email, app, meta)
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now()
from auth.users u
where u.id in ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- 30 simulated students (no identities, cannot sign in; is_simulated = true).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000',
       ('5a000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'authenticated', 'authenticated',
       format('sim%s@sim.attendance.test', lpad(n::text, 2, '0')), '', now(),
       '{"provider":"email","providers":["email"],"role":"student","is_simulated":true}'::jsonb,
       jsonb_build_object('full_name', format('Sim Student %s', lpad(n::text, 2, '0')),
                          'student_no', format('SIM-%s', lpad(n::text, 3, '0'))),
       now(), now(), '', '', '', ''
from generate_series(1, 30) n
on conflict (id) do nothing;

update public.profiles set department_id = '10000000-0000-4000-8000-000000000001'
where department_id is null
  and id in (select id from auth.users where email like '%attendance.test');

insert into public.section_staff (section_id, profile_id, staff_role) values
  ('50000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'primary'),
  ('50000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'primary')
on conflict do nothing;

-- All 30 simulated students in the demo section; the first 10 also in AIE302.
insert into public.enrollments (section_id, student_id, starts_on)
select '50000000-0000-4000-8000-000000000001',
       ('5a000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '2026-09-01'
from generate_series(1, 30) n
on conflict do nothing;

insert into public.enrollments (section_id, student_id, starts_on)
select '50000000-0000-4000-8000-000000000002',
       ('5a000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '2026-09-01'
from generate_series(1, 10) n
on conflict do nothing;

-- ---------------------------------------------------------------- devices (keys set by scripts/new-device-key.ps1)
insert into public.edge_devices (id, room_id, name, kind) values
  ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'edge-B204',      'edge'),
  ('e0000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'ingest-B204',    'ingest'),
  ('e0000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'simulator-B204', 'simulator')
on conflict do nothing;

insert into public.cameras (device_id, kind, stream_url) values
  ('e0000000-0000-4000-8000-000000000001', 'gate',   'http://<phone-1-ip>:8080/video'),
  ('e0000000-0000-4000-8000-000000000001', 'inside', '0')
on conflict do nothing;

-- ---------------------------------------------------------------- the 3 real students
-- They sign up in the app themselves. Before (or after) that, run with their real emails:
--   insert into public.pending_enrollments (email, section_id)
--   values (lower('student@example.com'), '50000000-0000-4000-8000-000000000001');
-- If they already signed up, insert into public.enrollments instead (admin UI does this in Phase 2).

commit;
