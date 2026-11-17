-- 03: audit triggers, notification helper + push webhook, enrollment reminder,
--     face matching RPCs, session gallery, geofence check.

-- ---------------------------------------------------------------- audit
-- actor  = auth.uid() (client calls) or app.actor (set by server RPCs); null = system/engine.
-- reason = app.audit_reason (set_config(..., true) inside the same transaction).
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) - 'template' end;
  v_after  jsonb := case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) - 'template' end;
  v_row    jsonb := coalesce(v_after, v_before);
  v_id     text;
  v_actor  uuid;
begin
  if tg_op = 'UPDATE' and v_before = v_after then
    return new;
  end if;
  select string_agg(v_row->>k, ':') into v_id from unnest(tg_argv) k;
  begin
    v_actor := coalesce(auth.uid(), nullif(current_setting('app.actor', true), '')::uuid);
  exception when invalid_text_representation then
    v_actor := auth.uid();
  end;
  insert into public.audit_log (actor, action, entity, entity_id, before, after, reason)
  values (v_actor, lower(tg_op), tg_table_name, v_id, v_before, v_after,
          nullif(current_setting('app.audit_reason', true), ''));
  return coalesce(new, old);
end $$;

create trigger audit_attendance after update on public.attendance
  for each row execute function public.audit_row('session_id', 'student_id');
create trigger audit_enrollments after insert or update or delete on public.enrollments
  for each row execute function public.audit_row('section_id', 'student_id');
create trigger audit_face_profiles after update on public.face_profiles
  for each row execute function public.audit_row('student_id');
create trigger audit_section_staff after insert or update or delete on public.section_staff
  for each row execute function public.audit_row('section_id', 'profile_id');
create trigger audit_profiles after update on public.profiles
  for each row execute function public.audit_row('id');

-- ---------------------------------------------------------------- notifications
-- Single entry point for every notification. Simulated or inactive users get none.
create or replace function public.notify_user(
  p_user uuid, p_type text, p_title text, p_body text,
  p_data jsonb default '{}', p_expires timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.profiles
                 where id = p_user and is_active and not is_simulated) then
    return null;
  end if;
  insert into public.notifications (user_id, type, title, body, data, expires_at)
  values (p_user, p_type, p_title, p_body, coalesce(p_data, '{}'), p_expires)
  returning id into v_id;
  return v_id;
end $$;

-- DB webhook: every notification insert -> POST {APP_URL}/api/internal/push-dispatch.
-- APP_URL and the secret live in private.app_config (set by hand, never in git).
create or replace function public.dispatch_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_url    text := (select value from private.app_config where key = 'app_url');
  v_secret text := (select value from private.app_config where key = 'push_webhook_secret');
begin
  if v_url is null or v_secret is null then
    return new;  -- not configured yet: in-app inbox still works via Realtime
  end if;
  perform net.http_post(
    url     := rtrim(v_url, '/') || '/api/internal/push-dispatch',
    body    := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', v_secret),
    timeout_milliseconds := 5000);
  return new;
end $$;

create trigger dispatch_push after insert on public.notifications
  for each row execute function public.dispatch_push();

-- Enrolling a student whose face is not active creates an enroll_face reminder (max one per 24 h).
create or replace function public.on_enrollment_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.face_profiles (student_id) values (new.student_id) on conflict do nothing;
  if exists (select 1 from public.face_profiles
             where student_id = new.student_id and status in ('pending','rejected'))
     and not exists (select 1 from public.notifications
                     where user_id = new.student_id and type = 'enroll_face'
                       and created_at > now() - interval '24 hours') then
    perform public.notify_user(new.student_id, 'enroll_face', 'Verify your face',
      'Enroll your face to activate automatic attendance.',
      jsonb_build_object('url', '/student/enroll'));
  end if;
  return new;
end $$;

create trigger on_enrollment_insert after insert on public.enrollments
  for each row execute function public.on_enrollment_insert();

-- ---------------------------------------------------------------- face matching (service role only)
create or replace function public.match_face(p_student uuid, p_embedding extensions.vector)
returns real
language sql stable set search_path = public, extensions as $$
  select max(1 - (e.embedding <=> p_embedding))::real
  from public.face_embeddings e
  where e.student_id = p_student
$$;

create or replace function public.match_face_any(p_embedding extensions.vector, p_exclude uuid)
returns table (student_id uuid, similarity real)
language sql stable set search_path = public, extensions as $$
  with nn as (
    select e.student_id, 1 - (e.embedding <=> p_embedding) as sim
    from public.face_embeddings e
    where p_exclude is null or e.student_id <> p_exclude
    order by e.embedding <=> p_embedding
    limit 50)
  select nn.student_id, max(nn.sim)::real as similarity
  from nn group by nn.student_id
  order by similarity desc
  limit 3
$$;

-- Edge gallery: active face profiles of students enrolled in the session's section on that date.
create or replace function public.session_gallery(p_session uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object('students', coalesce(jsonb_agg(g order by g->>'id'), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id,
      'name_initials', (select string_agg(left(w, 1), '') from regexp_split_to_table(trim(p.full_name), '\s+') w),
      'embeddings', (select jsonb_agg(to_jsonb(fe.embedding::real[]) order by fe.id)
                     from public.face_embeddings fe where fe.student_id = p.id)) as g
    from public.class_sessions s
    join public.enrollments e on e.section_id = s.section_id
      and e.starts_on <= s.session_date and (e.ends_on is null or e.ends_on >= s.session_date)
    join public.profiles p on p.id = e.student_id and p.is_active
    join public.face_profiles fp on fp.student_id = p.id and fp.status = 'active'
    where s.id = p_session
      and exists (select 1 from public.face_embeddings fe where fe.student_id = p.id)
  ) x
$$;

-- Point (expanded by GPS accuracy) overlaps the room geofence.
create or replace function public.check_geofence(p_room uuid, p_lat double precision,
  p_lng double precision, p_accuracy_m double precision) returns boolean
language sql stable set search_path = public, extensions as $$
  select coalesce((
    select extensions.st_dwithin(
      r.geofence,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      greatest(coalesce(p_accuracy_m, 0), 0))
    from public.rooms r where r.id = p_room), false)
$$;

revoke execute on function public.audit_row(), public.dispatch_push(), public.on_enrollment_insert()
  from public, anon, authenticated;
-- Server-only RPCs: called from Next.js with the service role.
revoke execute on function
  public.notify_user(uuid, text, text, text, jsonb, timestamptz),
  public.match_face(uuid, extensions.vector),
  public.match_face_any(extensions.vector, uuid),
  public.session_gallery(uuid),
  public.check_geofence(uuid, double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function
  public.notify_user(uuid, text, text, text, jsonb, timestamptz),
  public.match_face(uuid, extensions.vector),
  public.match_face_any(extensions.vector, uuid),
  public.session_gallery(uuid),
  public.check_geofence(uuid, double precision, double precision, double precision)
  to service_role;
