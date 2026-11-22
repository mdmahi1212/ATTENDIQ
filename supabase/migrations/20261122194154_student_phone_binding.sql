-- Rule F (user decision 2026-11-23): self-verify only from the student's registered phone.
-- The phone's random device id (kept in its browser) is stored hashed (SHA-256). The first self-verify registers the
-- phone; another phone is refused until an admin resets it (Admin -> People -> Reset phone). Written by the server.
create table public.student_devices (
  student_id    uuid primary key references public.profiles on delete cascade,
  device_hash   text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  label         text check (char_length(label) <= 120),
  registered_at timestamptz not null default now()
);
alter table public.student_devices enable row level security;
create policy "student_devices: own or admin read" on public.student_devices for select to authenticated
  using (student_id = auth.uid() or public.is_admin());
create policy "student_devices: admin reset" on public.student_devices for delete to authenticated
  using (public.is_admin());

create trigger audit_student_devices after insert or delete on public.student_devices
  for each row execute function public.audit_row('student_id');
