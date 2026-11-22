-- #5 (user decision 2026-11-23): a short written summary of an ended class for its professor, made on request
-- (Claude when ANTHROPIC_API_KEY is set on the server, else a plain template). Written by the server only.
alter table public.class_sessions
  add column summary    text check (char_length(summary) <= 4000),
  add column summary_at timestamptz;
