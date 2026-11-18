-- 13: store the server-side passive anti-spoof score of each self-verify attempt.
alter table public.verification_attempts add column if not exists live_score real;
comment on column public.verification_attempts.live_score is 'Passive anti-spoof live probability of the uploaded frame (InsightFace liveness addon); liveness_ok = browser challenges AND live';
