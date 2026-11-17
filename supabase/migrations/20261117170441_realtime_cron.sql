-- 05: Realtime (RLS-respecting postgres_changes) + the minute tick.

alter publication supabase_realtime add table
  public.attendance, public.occupancy_samples, public.notifications, public.verification_requests;

-- pg_cron runs session_tick() every minute (Vercel cron is NOT used).
select cron.schedule('session-tick', '* * * * *', $$select public.session_tick()$$);
