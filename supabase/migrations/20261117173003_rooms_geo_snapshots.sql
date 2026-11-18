-- 06: geofence as GeoJSON for the admin map + private bucket for camera snapshots (ROI editor).

create view public.rooms_geo with (security_invoker = true) as
  select r.id, extensions.st_asgeojson(r.geofence)::jsonb as geofence
  from public.rooms r;
revoke all on public.rooms_geo from anon;
grant select on public.rooms_geo to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('camera-snapshots', 'camera-snapshots', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "camera-snapshots: operator read" on storage.objects for select to authenticated
  using (bucket_id = 'camera-snapshots' and public.is_operator());
create policy "camera-snapshots: operator insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'camera-snapshots' and public.is_operator());
create policy "camera-snapshots: operator update" on storage.objects for update to authenticated
  using (bucket_id = 'camera-snapshots' and public.is_operator())
  with check (bucket_id = 'camera-snapshots' and public.is_operator());
create policy "camera-snapshots: operator delete" on storage.objects for delete to authenticated
  using (bucket_id = 'camera-snapshots' and public.is_operator());
