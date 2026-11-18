-- 15: rate limiting (Postgres counters, shared by all Vercel instances), privacy retention job, demo reset.

-- ---------------------------------------------------------------- rate limits
create table if not exists public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;  -- no policies: service role only
comment on table public.rate_limits is 'Fixed-window request counters for API rate limiting (service role only)';

-- Counts one hit for `p_key` in the current fixed window; true = allowed, false = over the limit.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_s int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);
  v_hits  int;
begin
  if p_limit < 1 or p_window_s < 1 or length(p_key) > 200 then
    raise exception 'bad rate limit arguments' using errcode = '22023';
  end if;
  insert into public.rate_limits (key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end $$;

-- ---------------------------------------------------------------- privacy retention (daily)
-- Biometric/visual data: verification frames are never stored (only scores); unknown-entrant snapshot
-- references expire after 24 h; review thumbnails are removed by /api/internal/retention (storage API).
create or replace function public.privacy_retention(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_snap int; v_rl int; v_notif int; v_hb int;
  v_url    text := (select value from private.app_config where key = 'app_url');
  v_secret text := (select value from private.app_config where key = 'push_webhook_secret');
begin
  update public.gate_events set snapshot_path = null
   where snapshot_path is not null and ts < p_now - interval '24 hours';
  get diagnostics v_snap = row_count;
  delete from public.rate_limits where window_start < p_now - interval '1 day';
  get diagnostics v_rl = row_count;
  delete from public.notifications where created_at < p_now - interval '90 days';
  get diagnostics v_notif = row_count;
  delete from public.edge_events where event_type = 'EDGE_HEARTBEAT' and observed_at < p_now - interval '30 days';
  get diagnostics v_hb = row_count;
  -- Storage objects can only be deleted through the Storage API: ask the web app to do it.
  if v_url is not null and v_secret is not null then
    perform net.http_post(url := rtrim(v_url, '/') || '/api/internal/retention',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', v_secret),
      body := '{}'::jsonb, timeout_milliseconds := 10000);
  end if;
  return jsonb_build_object('snapshots_expired', v_snap, 'rate_limit_rows', v_rl, 'notifications', v_notif, 'heartbeats', v_hb);
end $$;

select cron.unschedule('privacy-retention') where exists (select 1 from cron.job where jobname = 'privacy-retention');
select cron.schedule('privacy-retention', '0 18 * * *', $$select public.privacy_retention()$$);  -- 03:00 Asia/Seoul

-- ---------------------------------------------------------------- demo reset (before a presentation)
-- Removes simulation and ad-hoc (non-timetable) sessions with everything hanging off them, clears device
-- status. Timetable sessions, people, enrollments, faces and settings stay. Service role only.
create or replace function public.reset_demo() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_sessions int; v_devices int;
begin
  perform set_config('app.audit_reason', 'demo reset', true);
  delete from public.class_sessions where is_simulation or slot_id is null;
  get diagnostics v_sessions = row_count;
  update public.edge_devices set last_seen = null, status = null where last_seen is not null or status is not null;
  get diagnostics v_devices = row_count;
  delete from public.rate_limits;
  insert into public.audit_log (actor, action, entity, reason, after)
  values (null, 'reset', 'demo', 'demo reset', jsonb_build_object('sessions', v_sessions, 'devices', v_devices));
  perform set_config('app.audit_reason', '', true);
  return jsonb_build_object('sessions_deleted', v_sessions, 'devices_reset', v_devices);
end $$;

revoke execute on function public.rate_limit_hit(text, int, int), public.privacy_retention(timestamptz), public.reset_demo()
  from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int), public.privacy_retention(timestamptz), public.reset_demo()
  to service_role;
