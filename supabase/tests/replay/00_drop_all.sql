-- Used ONLY inside a transaction that is rolled back (scripts/test-db.ps1 -Replay):
-- removes every object our migrations create so they can be replayed from zero.
select cron.unschedule('session-tick') where exists (select 1 from cron.job where jobname = 'session-tick');
drop trigger if exists on_auth_user_created on auth.users;
delete from auth.users where email like '%attendance.test';
drop schema if exists private cascade;
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
  for r in select p.oid::regprocedure as f from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname <> 'rls_auto_enable'
             and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute 'drop function if exists ' || r.f || ' cascade';
  end loop;
end $$;
drop type if exists public.user_role, public.session_state, public.att_status cascade;
drop extension if exists pg_cron cascade;
drop extension if exists pg_net cascade;
drop extension if exists postgis cascade;
drop extension if exists vector cascade;
create temp table zero_state as select
  (select count(*) from pg_tables where schemaname = 'public') as tables_left,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname <> 'rls_auto_enable') as functions_left,
  (select count(*) from pg_extension where extname in ('vector','postgis','pg_cron','pg_net')) as extensions_left;
