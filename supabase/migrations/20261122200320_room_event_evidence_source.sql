-- Evidence from the room camera (ROOM_SEEN) is stored with source 'room_event'.
alter table public.attendance_evidence drop constraint attendance_evidence_source_check;
alter table public.attendance_evidence add constraint attendance_evidence_source_check
  check (source in ('gate_event', 'verification_attempt', 'manual', 'appeal', 'engine', 'room_event'));
