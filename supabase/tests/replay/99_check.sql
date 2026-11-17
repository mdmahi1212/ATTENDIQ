-- Sanity checks after replaying every migration + seed from zero (still inside the rolled-back transaction).
select jsonb_build_object(
  'zero_state', (select to_jsonb(z) from zero_state z),
  'extensions', (select jsonb_agg(extname order by extname) from pg_extension
                 where extname in ('vector','postgis','pg_cron','pg_net','pgcrypto')),
  'public_tables', (select count(*) from pg_tables where schemaname = 'public'),
  'tables_without_rls', (select coalesce(jsonb_agg(c.relname), '[]') from pg_class c
                         join pg_namespace n on n.oid = c.relnamespace
                         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
                           and c.relname <> 'spatial_ref_sys'),
  'policies', (select count(*) from pg_policies where schemaname = 'public'),
  'functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname <> 'rls_auto_enable'),
  'cron_job', (select schedule || ' ' || command from cron.job where jobname = 'session-tick'),
  'realtime_tables', (select jsonb_agg(tablename order by tablename) from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public'),
  'seed_profiles', (select count(*) from public.profiles),
  'seed_sim_students', (select count(*) from public.profiles where is_simulated),
  'seed_admin_role', (select role from public.profiles where email = 'admin@attendance.test'),
  'seed_enrollments', (select count(*) from public.enrollments),
  'geofence_inside', public.check_geofence('40000000-0000-4000-8000-000000000001', 37.55032, 127.07310, 10),
  'geofence_far',    public.check_geofence('40000000-0000-4000-8000-000000000001', 37.56000, 127.08000, 40),
  'tick', public.session_tick('2026-11-18 01:21:00+00')
) as replay_result;
