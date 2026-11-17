-- 01: extensions, enums, tables, indexes.
-- Event storage decision: every edge envelope is stored once in `edge_events`
-- (the idempotency ledger, unique event_id). Gate and occupancy events are ALSO
-- projected into typed tables `gate_events` / `occupancy_samples` (FK event_id)
-- for fast dashboard queries. Heartbeats and camera status live only in edge_events.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector   with schema extensions;
create extension if not exists postgis  with schema extensions;
create extension if not exists pg_net   with schema extensions;
create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- enums
create type public.user_role     as enum ('admin','professor','student','operator');
create type public.session_state as enum ('scheduled','live','recheck','ended','locked','cancelled');
create type public.att_status    as enum ('pending','present','late','absent','left_early','excused');

-- ---------------------------------------------------------------- academic structure
create table public.departments (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  role          public.user_role not null default 'student',
  full_name     text not null default '',
  email         text,
  student_no    text unique,
  department_id uuid references public.departments on delete set null,
  is_active     boolean not null default true,
  is_simulated  boolean not null default false,
  created_at    timestamptz not null default now()
);
create index on public.profiles (department_id);
create index on public.profiles (role);

create table public.semesters (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  starts_on date not null,
  ends_on   date not null,
  check (ends_on >= starts_on)
);

create table public.holidays (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid references public.semesters on delete cascade,
  day         date not null,
  kind        text not null default 'holiday' check (kind in ('holiday','exam')),
  name        text,
  unique (semester_id, day)
);
create index on public.holidays (day);

create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  title         text not null,
  department_id uuid references public.departments on delete set null,
  credits       int
);
create index on public.courses (department_id);

create table public.rooms (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  name               text,
  building           text,
  floor              int,
  geofence           extensions.geography(polygon, 4326),
  max_gps_accuracy_m int not null default 40,
  require_qr         boolean not null default true
);

create table public.sections (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses on delete cascade,
  semester_id uuid not null references public.semesters on delete cascade,
  section_no  text not null,
  room_id     uuid references public.rooms on delete set null,
  unique (course_id, semester_id, section_no)
);
create index on public.sections (course_id);
create index on public.sections (semester_id);
create index on public.sections (room_id);

create table public.section_staff (
  section_id uuid not null references public.sections on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  staff_role text not null default 'primary' check (staff_role in ('primary','ta','substitute')),
  primary key (section_id, profile_id)
);
create index on public.section_staff (profile_id);

create table public.enrollments (
  section_id uuid not null references public.sections on delete cascade,
  student_id uuid not null references public.profiles on delete cascade,
  starts_on  date not null default current_date,
  ends_on    date,                      -- drop date (inclusive last day)
  created_at timestamptz not null default now(),
  primary key (section_id, student_id),
  check (ends_on is null or ends_on >= starts_on)
);
create index on public.enrollments (student_id);

-- Students invited by email before they sign up; converted to enrollments by the profile trigger.
create table public.pending_enrollments (
  email      text not null,
  section_id uuid not null references public.sections on delete cascade,
  student_no text,
  full_name  text,
  created_at timestamptz not null default now(),
  primary key (email, section_id)
);
create index on public.pending_enrollments (section_id);

create table public.timetable_slots (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections on delete cascade,
  weekday    int not null check (weekday between 1 and 7),   -- ISO: 1 = Monday
  start_time time not null,                                   -- Asia/Seoul local time
  end_time   time not null,
  room_id    uuid references public.rooms on delete set null, -- null = section room
  is_active  boolean not null default true,
  check (end_time > start_time)
);
create index on public.timetable_slots (section_id);
create index on public.timetable_slots (room_id);

-- ---------------------------------------------------------------- biometrics
create table public.biometric_consents (
  student_id   uuid not null references public.profiles on delete cascade,
  version      text not null,
  accepted_at  timestamptz not null default now(),
  withdrawn_at timestamptz,
  primary key (student_id, version)
);

create table public.face_profiles (
  student_id    uuid primary key references public.profiles on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending','active','review','rejected','deleted')),
  template      extensions.vector(512),
  enrolled_at   timestamptz,
  model_version text,
  review_note   text,
  updated_at    timestamptz not null default now()
);
create index on public.face_profiles (status);

create table public.face_embeddings (
  id         bigserial primary key,
  student_id uuid not null references public.profiles on delete cascade,
  embedding  extensions.vector(512) not null,
  quality    real,
  pose       text,
  created_at timestamptz not null default now()
);
create index on public.face_embeddings (student_id);
create index face_embeddings_hnsw on public.face_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------- devices
create table public.edge_devices (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid references public.rooms on delete set null,
  name         text not null,
  kind         text not null default 'edge' check (kind in ('edge','ingest','simulator','esp32')),
  api_key_hash text unique,              -- hex SHA-256 of the plaintext key
  is_active    boolean not null default true,
  last_seen    timestamptz,
  status       jsonb,
  created_at   timestamptz not null default now()
);
create index on public.edge_devices (room_id);

create table public.cameras (
  id               uuid primary key default gen_random_uuid(),
  device_id        uuid not null references public.edge_devices on delete cascade,
  kind             text not null check (kind in ('gate','inside')),
  stream_url       text,
  roi              jsonb,
  entry_line       jsonb,
  snapshot_path    text,
  unique (device_id, kind)
);

-- ---------------------------------------------------------------- sessions & attendance
create table public.class_sessions (
  id                       uuid primary key default gen_random_uuid(),
  section_id               uuid not null references public.sections on delete cascade,
  room_id                  uuid references public.rooms on delete set null,
  slot_id                  uuid references public.timetable_slots on delete set null,
  session_date             date not null,               -- Asia/Seoul date
  starts_at                timestamptz not null,
  ends_at                  timestamptz not null,
  state                    public.session_state not null default 'scheduled',
  is_makeup                boolean not null default false,
  staff_count              int not null default 1,
  policy                   jsonb,                       -- snapshot taken at start
  gate_offline_seconds     int not null default 0,
  started_at               timestamptz,
  finalized_at             timestamptz,
  locked_at                timestamptz,
  cancelled_reason         text,
  last_mismatch_check_at   timestamptz,
  low_count_since          timestamptz,
  low_count_alerted_at     timestamptz,
  over_enrolled_alerted_at timestamptz,
  recheck_checked_at       timestamptz,
  check (ends_at > starts_at)
);
create unique index class_sessions_slot_day on public.class_sessions (slot_id, session_date) where slot_id is not null;
create index on public.class_sessions (section_id);
create index on public.class_sessions (room_id);
create index on public.class_sessions (state, starts_at);

-- QR secret kept apart so no client role can ever select it (no policies; service role only).
create table public.session_secrets (
  session_id uuid primary key references public.class_sessions on delete cascade,
  qr_secret  text not null
);

create table public.attendance (
  session_id       uuid not null references public.class_sessions on delete cascade,
  student_id       uuid not null references public.profiles on delete cascade,
  status           public.att_status not null default 'pending',
  method           text check (method in ('gate','self_verify','recheck','manual','appeal')),
  first_seen_at    timestamptz,
  last_verified_at timestamptz,
  updated_by       uuid references public.profiles on delete set null,
  updated_at       timestamptz not null default now(),
  note             text,
  flags            text[] not null default '{}',
  primary key (session_id, student_id)
);
create index on public.attendance (student_id);
create index on public.attendance (updated_by);

create table public.attendance_evidence (
  id           bigserial primary key,
  session_id   uuid not null,
  student_id   uuid not null,
  source       text not null check (source in ('gate_event','verification_attempt','manual','appeal','engine')),
  source_id    text,
  weight       text not null check (weight in ('strong','supporting','context')),
  rule_version text,
  detail       jsonb,
  created_at   timestamptz not null default now(),
  foreign key (session_id, student_id) references public.attendance on delete cascade
);
create index on public.attendance_evidence (session_id, student_id);
create index on public.attendance_evidence (student_id);

-- Idempotency ledger for every edge envelope.
create table public.edge_events (
  event_id         uuid primary key,
  event_type       text not null check (event_type in (
                     'GATE_PERSON_IN','GATE_PERSON_OUT','GATE_ENTRY_RECOGNISED','GATE_ENTRY_UNKNOWN',
                     'OCCUPANCY_UPDATED','CAMERA_OFFLINE','CAMERA_ONLINE','EDGE_HEARTBEAT')),
  source_device_id uuid not null references public.edge_devices on delete cascade,
  received_via     uuid references public.edge_devices on delete set null,
  session_id       uuid references public.class_sessions on delete cascade,
  observed_at      timestamptz not null,
  received_at      timestamptz not null default now(),
  model_version    text,
  payload          jsonb not null default '{}',
  simulation       boolean not null default false
);
create index on public.edge_events (session_id, observed_at);
create index on public.edge_events (source_device_id, observed_at);
create index on public.edge_events (received_via);

create table public.gate_events (
  event_id      uuid primary key references public.edge_events on delete cascade,
  session_id    uuid references public.class_sessions on delete cascade,
  device_id     uuid references public.edge_devices on delete set null,
  event_type    text not null,
  track_id      int,
  direction     text check (direction in ('in','out')),
  student_id    uuid references public.profiles on delete set null,
  score         real,
  margin        real,
  snapshot_path text,
  ts            timestamptz not null,
  received_at   timestamptz not null default now(),
  simulation    boolean not null default false
);
create index on public.gate_events (session_id, ts);
create index on public.gate_events (student_id);
create index on public.gate_events (device_id);

create table public.occupancy_samples (
  id          bigserial primary key,
  event_id    uuid unique references public.edge_events on delete cascade,
  session_id  uuid references public.class_sessions on delete cascade,
  device_id   uuid references public.edge_devices on delete set null,
  raw         int not null,
  smoothed    int not null,
  stable      boolean not null default false,
  ts          timestamptz not null,
  received_at timestamptz not null default now(),
  simulation  boolean not null default false
);
create index on public.occupancy_samples (session_id, ts);
create index on public.occupancy_samples (device_id);

create table public.verification_requests (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.class_sessions on delete cascade,
  kind         text not null check (kind in ('mismatch','recheck','manual')),
  status       text not null default 'open' check (status in ('open','closed','cancelled')),
  opens_at     timestamptz not null default now(),
  closes_at    timestamptz not null,
  closed_at    timestamptz,
  created_by   uuid references public.profiles on delete set null,
  target_count int not null default 0
);
create index on public.verification_requests (session_id, opens_at);
create index on public.verification_requests (status, closes_at);
create index on public.verification_requests (created_by);

-- Who was actually asked (fail-safe: only students who were sent a recheck can become left_early).
create table public.verification_targets (
  request_id  uuid not null references public.verification_requests on delete cascade,
  student_id  uuid not null references public.profiles on delete cascade,
  notified_at timestamptz not null default now(),
  passed_at   timestamptz,
  primary key (request_id, student_id)
);
create index on public.verification_targets (student_id);

create table public.verification_attempts (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.verification_requests on delete cascade,
  student_id     uuid not null references public.profiles on delete cascade,
  device_id      text,
  face_score     real,
  liveness_ok    boolean,
  lat            double precision,
  lng            double precision,
  gps_accuracy_m real,
  gps_ok         boolean,
  qr_ok          boolean,
  result         text not null check (result in ('pass','fail')),
  reason         text,
  created_at     timestamptz not null default now()
);
create index on public.verification_attempts (request_id, student_id);
create index on public.verification_attempts (student_id);

-- ---------------------------------------------------------------- workflow & audit
create table public.appeals (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null,
  student_id       uuid not null,
  reason           text not null,
  requested_status public.att_status not null default 'excused',
  attachment_path  text,
  status           text not null default 'open' check (status in ('open','approved','rejected','withdrawn')),
  decided_by       uuid references public.profiles on delete set null,
  decided_at       timestamptz,
  decision_note    text,
  created_at       timestamptz not null default now(),
  foreign key (session_id, student_id) references public.attendance on delete cascade
);
create index on public.appeals (session_id, student_id);
create index on public.appeals (student_id);
create index on public.appeals (decided_by);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  data       jsonb not null default '{}',
  expires_at timestamptz,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  endpoint   text not null unique,
  keys       jsonb not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);

create table public.audit_log (
  id        bigserial primary key,
  actor     uuid,
  action    text not null,
  entity    text not null,
  entity_id text,
  before    jsonb,
  after     jsonb,
  reason    text,
  at        timestamptz not null default now()
);
create index on public.audit_log (entity, entity_id);
create index on public.audit_log (at desc);

create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Non-secret server config read by triggers (APP_URL, webhook secret). postgres-only.
create table private.app_config (
  key   text primary key,
  value text not null
);
revoke all on private.app_config from public, anon, authenticated;

insert into public.settings (key, value) values ('policy', '{
  "present_until_min": 10,
  "late_until_min": 30,
  "first_mismatch_check_min": 10,
  "mismatch_interval_min": 5,
  "verify_window_min": 5,
  "recheck_before_end_min": 10,
  "recheck_window_min": 4,
  "count_tolerance": 1,
  "stable_count_seconds": 60,
  "left_early_counts_as": "absent",
  "late_weight": 1,
  "lock_after_hours": 48,
  "appeal_days": 7,
  "gate_accept_threshold": 0.45,
  "gate_min_margin": 0.08,
  "gate_min_votes": 2,
  "verify_threshold": 0.50,
  "gps_max_accuracy_m": 40,
  "qr_slot_seconds": 20,
  "warn_attendance_pct": [85, 75]
}'::jsonb);
