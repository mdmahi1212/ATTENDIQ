-- Security pass: RLS on EVERY public table + forbidden reads/writes per role. One transaction, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temp table tap (n serial primary key, line text);
grant all on tap to authenticated, anon;
grant usage, select on sequence tap_n_seq to authenticated, anon;
create temp table probe (who text, what text, n bigint, err text);
grant all on probe to authenticated, anon;
select no_plan();

-- 1. Structure: RLS enabled on every table; every table has a policy unless it is service-role-only by design.
insert into tap(line) select is(
  (select string_agg(c.relname, ', ' order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), null, 'RLS is enabled on every public table');
insert into tap(line) select is(
  (select string_agg(c.relname, ', ' order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
      and c.relname not in ('session_secrets', 'rate_limits')), null,
  'every table has policies (except service-only session_secrets, rate_limits)');
insert into tap(line) select is(
  (select string_agg(viewname, ', ') from pg_views v join pg_class c on c.relname = v.viewname
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where v.schemaname = 'public' and not coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), false)),
  null, 'every public view uses security_invoker');

-- fixtures
insert into public.rooms (id, code) values ('f1000000-0000-4000-8000-0000000000c1', 'RLS1');
insert into public.courses (id, code, title) values ('f3000000-0000-4000-8000-0000000000c1', 'RLS101', 'RLS');
insert into public.semesters (id, name, starts_on, ends_on) values ('f2000000-0000-4000-8000-0000000000c1', 'RLS term', '2026-09-01', '2026-12-20');
insert into public.sections (id, course_id, semester_id, section_no, room_id)
values ('f5000000-0000-4000-8000-0000000000c1', 'f3000000-0000-4000-8000-0000000000c1', 'f2000000-0000-4000-8000-0000000000c1', 'R1', 'f1000000-0000-4000-8000-0000000000c1');
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change) values
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'rls-s1@tst.test', '{"role":"student"}', '{"full_name":"R S1"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-0000000000c2', 'authenticated', 'authenticated', 'rls-s2@tst.test', '{"role":"student"}', '{"full_name":"R S2"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'rls-p@tst.test', '{"role":"professor"}', '{"full_name":"R P"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-4000-8000-0000000000c2', 'authenticated', 'authenticated', 'rls-p2@tst.test', '{"role":"professor"}', '{"full_name":"R P2"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'rls-o@tst.test', '{"role":"operator"}', '{"full_name":"R O"}', now(), now(), '', '', '', '');
insert into public.section_staff (section_id, profile_id) values ('f5000000-0000-4000-8000-0000000000c1', 'fb000000-0000-4000-8000-0000000000c1');
insert into public.enrollments (section_id, student_id, starts_on) values
  ('f5000000-0000-4000-8000-0000000000c1', 'f0000000-0000-4000-8000-0000000000c1', '2026-09-01'),
  ('f5000000-0000-4000-8000-0000000000c1', 'f0000000-0000-4000-8000-0000000000c2', '2026-09-01');
insert into public.class_sessions (id, section_id, room_id, session_date, starts_at, ends_at)
values ('fe000000-0000-4000-8000-0000000000c1', 'f5000000-0000-4000-8000-0000000000c1', 'f1000000-0000-4000-8000-0000000000c1', current_date, now() - interval '5 minutes', now() + interval '60 minutes');
select public.start_session('fe000000-0000-4000-8000-0000000000c1', now() - interval '10 minutes');
insert into public.face_embeddings (student_id, embedding)
select 'f0000000-0000-4000-8000-0000000000c2', (select array_agg(0.0442)::real[]::vector(512) from generate_series(1, 512));
insert into public.edge_devices (id, room_id, name, kind) values ('fd000000-0000-4000-8000-0000000000c1', 'f1000000-0000-4000-8000-0000000000c1', 'rls-edge', 'edge');

-- probe helper: run a statement as the current role, record rows seen/affected or the error
create function pg_temp.p(p_who text, p_what text, p_sql text) returns void language plpgsql as $$
declare v bigint;
begin
  execute p_sql into v;
  insert into probe values (p_who, p_what, coalesce(v, 0), null);
exception when others then
  insert into probe values (p_who, p_what, null, sqlstate);
end $$;
grant execute on function pg_temp.p(text, text, text) to authenticated, anon;

-- 2. anon: nothing readable anywhere
set local role anon;
do $$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v') loop
    perform pg_temp.p('anon', t, format('select count(*) from public.%I', t));
  end loop;
end $$;
reset role;
insert into tap(line) select is((select string_agg(what, ', ') from probe where who = 'anon' and n > 0), null, 'anon reads 0 rows from every table and view');

-- 3. student s1: only own rows; no direct writes to attendance/faces/sessions/devices
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
select pg_temp.p('s1', 'other attendance', $q$select count(*) from public.attendance where student_id <> 'f0000000-0000-4000-8000-0000000000c1'$q$);
select pg_temp.p('s1', 'face_embeddings', 'select count(*) from public.face_embeddings');
select pg_temp.p('s1', 'session_secrets', 'select count(*) from public.session_secrets');
select pg_temp.p('s1', 'audit_log', 'select count(*) from public.audit_log');
select pg_temp.p('s1', 'edge_devices', 'select count(*) from public.edge_devices');
select pg_temp.p('s1', 'edge_events', 'select count(*) from public.edge_events');
select pg_temp.p('s1', 'gate_events', 'select count(*) from public.gate_events');
select pg_temp.p('s1', 'rate_limits', 'select count(*) from public.rate_limits');
select pg_temp.p('s1', 'other notifications', $q$select count(*) from public.notifications where user_id <> 'f0000000-0000-4000-8000-0000000000c1'$q$);
select pg_temp.p('s1', 'other push_subscriptions', $q$select count(*) from public.push_subscriptions where user_id <> 'f0000000-0000-4000-8000-0000000000c1'$q$);
select pg_temp.p('s1', 'other face_profiles', $q$select count(*) from public.face_profiles where student_id <> 'f0000000-0000-4000-8000-0000000000c1'$q$);
select pg_temp.p('s1', 'w: mark self present', $q$with u as (update public.attendance set status = 'present' where student_id = 'f0000000-0000-4000-8000-0000000000c1' returning 1) select count(*) from u$q$);
select pg_temp.p('s1', 'w: activate own face', $q$with u as (update public.face_profiles set status = 'active' where student_id = 'f0000000-0000-4000-8000-0000000000c1' returning 1) select count(*) from u$q$);
select pg_temp.p('s1', 'w: enroll self in a section', $q$with u as (insert into public.enrollments (section_id, student_id, starts_on) values ('f5000000-0000-4000-8000-0000000000c1', 'f0000000-0000-4000-8000-0000000000c1', '2026-01-01') returning 1) select count(*) from u$q$);
select pg_temp.p('s1', 'w: change session times', $q$with u as (update public.class_sessions set starts_at = starts_at + interval '1 hour' returning 1) select count(*) from u$q$);
select pg_temp.p('s1', 'w: insert gate event', $q$with u as (insert into public.gate_events (event_id, session_id, device_id, event_type, direction, ts) values (gen_random_uuid(), 'fe000000-0000-4000-8000-0000000000c1', 'fd000000-0000-4000-8000-0000000000c1', 'GATE_ENTRY_RECOGNISED', 'in', now()) returning 1) select count(*) from u$q$);
select pg_temp.p('s1', 'w: notify someone', $q$with u as (insert into public.notifications (user_id, type, title) values ('f0000000-0000-4000-8000-0000000000c2', 'x', 'spam') returning 1) select count(*) from u$q$);
select pg_temp.p('s1', 'w: rate_limit_hit', $q$select count(*) from (select public.rate_limit_hit('x', 1, 60)) x$q$);
select pg_temp.p('s1', 'w: reset_demo', $q$select count(*) from (select public.reset_demo()) x$q$);
-- 4. professor of ANOTHER section sees nothing of this one; own professor cannot write attendance directly
set local request.jwt.claims = '{"sub":"fb000000-0000-4000-8000-0000000000c2","role":"authenticated"}';
select pg_temp.p('p2', 'attendance of foreign section', $q$select count(*) from public.attendance where session_id = 'fe000000-0000-4000-8000-0000000000c1'$q$);
select pg_temp.p('p2', 'gate_events of foreign section', $q$select count(*) from public.gate_events where session_id = 'fe000000-0000-4000-8000-0000000000c1'$q$);
set local request.jwt.claims = '{"sub":"fb000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
select pg_temp.p('p1', 'own roster', $q$select count(*) from public.attendance where session_id = 'fe000000-0000-4000-8000-0000000000c1'$q$);
select pg_temp.p('p1', 'w: direct attendance update', $q$with u as (update public.attendance set status = 'present' where session_id = 'fe000000-0000-4000-8000-0000000000c1' returning 1) select count(*) from u$q$);
select pg_temp.p('p1', 'face_embeddings', 'select count(*) from public.face_embeddings');
select pg_temp.p('p1', 'session_secrets', 'select count(*) from public.session_secrets');
-- 5. operator: devices yes, attendance/faces no
set local request.jwt.claims = '{"sub":"fa000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
select pg_temp.p('op', 'edge_devices', 'select count(*) from public.edge_devices');
select pg_temp.p('op', 'attendance', 'select count(*) from public.attendance');
select pg_temp.p('op', 'face_embeddings', 'select count(*) from public.face_embeddings');
select pg_temp.p('op', 'w: attendance update', $q$with u as (update public.attendance set status = 'present' returning 1) select count(*) from u$q$);
reset role;

insert into tap(line) select is((select string_agg(what || '=' || n, ', ') from probe where who = 's1' and what not like 'w:%' and n > 0), null,
  'student: 0 rows of other students / biometrics / secrets / audit / devices / events');
insert into tap(line) select is((select string_agg(what || '=' || n, ', ') from probe where who = 's1' and what like 'w:%' and n > 0), null,
  'student: every forbidden write is refused or affects 0 rows');
insert into tap(line) select ok((select bool_and(err = '42501') from probe where who = 's1' and what in ('w: rate_limit_hit', 'w: reset_demo')), 'student cannot call service-only RPCs');
insert into tap(line) select is((select string_agg(what || '=' || n, ', ') from probe where who = 'p2' and n > 0), null, 'professor sees nothing of another section');
insert into tap(line) select is((select n from probe where who = 'p1' and what = 'own roster'), 2::bigint, 'professor sees own section roster');
insert into tap(line) select is((select coalesce(n, 0) from probe where who = 'p1' and what = 'w: direct attendance update'), 0::bigint, 'professor cannot write attendance directly (RPCs only, audited)');
insert into tap(line) select is((select string_agg(what || '=' || n, ', ') from probe where who = 'p1' and what in ('face_embeddings', 'session_secrets') and n > 0), null, 'professor reads no biometrics or QR secrets');
insert into tap(line) select ok((select n from probe where who = 'op' and what = 'edge_devices') >= 1, 'operator reads devices');
insert into tap(line) select is((select string_agg(what || '=' || n, ', ') from probe where who = 'op' and what <> 'edge_devices' and n > 0), null, 'operator reads no attendance/biometrics and cannot write attendance');

insert into tap(line) select * from finish();
select string_agg(line, E'\n' order by n) as tap from tap;
rollback;
