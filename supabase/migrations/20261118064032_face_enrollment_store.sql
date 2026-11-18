-- 09: face enrollment storage, runtime app config, review thumbnails.

-- Stores one enrollment atomically: embeddings, mean template (L2-normalised), profile status.
-- Called by the Next.js /api/face/enroll route with the service role, after the face-api and the
-- duplicate check. The student is recorded as the audit actor.
create or replace function public.store_face_enrollment(
  p_student uuid, p_embeddings jsonb, p_status text, p_note text, p_replace boolean, p_model text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
  v_template extensions.vector;
begin
  if p_status not in ('active', 'review') then
    raise exception 'invalid status %', p_status using errcode = '22023';
  end if;
  if jsonb_typeof(p_embeddings) is distinct from 'array' or jsonb_array_length(p_embeddings) < 1 then
    raise exception 'no embeddings' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_student and role = 'student' and is_active) then
    raise exception 'not an active student' using errcode = '42501';
  end if;

  perform set_config('app.actor', p_student::text, true);
  perform set_config('app.audit_reason', 'face enrollment', true);

  if p_replace then
    delete from public.face_embeddings where student_id = p_student;
  end if;

  insert into public.face_embeddings (student_id, embedding, quality, pose)
  select p_student, ((e->'embedding')::text)::extensions.vector(512), (e->>'quality')::real, e->>'pose'
  from jsonb_array_elements(p_embeddings) e;

  select count(*), extensions.l2_normalize(extensions.avg(embedding))
    into v_count, v_template
  from public.face_embeddings where student_id = p_student;

  insert into public.face_profiles (student_id, status, template, enrolled_at, model_version, review_note, updated_at)
  values (p_student, p_status, v_template, now(), p_model, p_note, now())
  on conflict (student_id) do update
    set status = excluded.status, template = excluded.template, enrolled_at = excluded.enrolled_at,
        model_version = excluded.model_version, review_note = excluded.review_note, updated_at = now();

  perform set_config('app.audit_reason', '', true);
  return jsonb_build_object('embeddings', v_count, 'status', p_status);
end $$;

-- Runtime config written by trusted server-side scripts (e.g. the face-api tunnel URL changes on restart).
create or replace function public.set_app_config(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_key not in ('face_api_url') then
    raise exception 'key % is not settable', p_key using errcode = '22023';
  end if;
  insert into private.app_config (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end $$;

create or replace function public.get_app_config(p_key text) returns text
language sql stable security definer set search_path = '' as $$
  select value from private.app_config where key = p_key and p_key in ('face_api_url', 'app_url')
$$;

revoke execute on function public.store_face_enrollment(uuid, jsonb, text, text, boolean, text),
  public.set_app_config(text, text), public.get_app_config(text) from public, anon, authenticated;
grant execute on function public.store_face_enrollment(uuid, jsonb, text, text, boolean, text),
  public.set_app_config(text, text), public.get_app_config(text) to service_role;

-- One low-resolution thumbnail per enrollment that needs admin review (possible duplicate face).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('face-review', 'face-review', false, 524288, array['image/jpeg'])
on conflict (id) do nothing;

create policy "face-review: admin read" on storage.objects for select to authenticated
  using (bucket_id = 'face-review' and public.is_admin());
create policy "face-review: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'face-review' and public.is_admin());
