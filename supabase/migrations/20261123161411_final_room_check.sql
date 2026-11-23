-- Final room check (user decision 2026-11-24): when the professor ends a class, the edge looks at the room for
-- ~30 s (people count over many frames + recognised faces + body identities) and the professor sees who is really
-- there before the class is closed. Request -> edge (via the session poll) -> result.
alter table public.class_sessions
  add column final_check_requested_at timestamptz,
  add column final_check              jsonb,
  add column final_check_at           timestamptz;

create or replace function public.current_session_for_room(p_room uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(x) from (
    select s.id, s.section_id, s.starts_at, s.ends_at, s.state, s.policy, s.is_simulation, r.code as room_code,
           s.final_check_requested_at
      from public.class_sessions s
      join public.rooms r on r.id = s.room_id
     where s.room_id = p_room and s.state in ('live', 'recheck')
     order by s.starts_at desc
     limit 1) x
$$;

-- Staff of the class asks for a final room check.
create or replace function public.request_final_check(p_session uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_at timestamptz := now();
begin
  perform public.assert_session_actor(p_session);
  update public.class_sessions set final_check_requested_at = v_at
   where id = p_session and state in ('live', 'recheck');
  if not found then
    raise exception 'class is not running' using errcode = '55000';
  end if;
  return v_at;
end $$;

-- The edge reports what it saw; compared here with who is marked. Service role only (edge API route).
create or replace function public.record_final_check(p_session uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_seen uuid[];
  v_out  jsonb;
  v_marked int;
  v_missing jsonb;
  v_unmarked jsonb;
begin
  select coalesce(array_agg(x::uuid), '{}') into v_seen
    from jsonb_array_elements_text(coalesce(p_result->'students', '[]'::jsonb)) x
   where x ~ '^[0-9a-f-]{36}$';
  select count(*) into v_marked from public.attendance
   where session_id = p_session and status in ('present', 'late');
  select coalesce(jsonb_agg(p.full_name order by p.full_name), '[]') into v_missing
    from public.attendance a join public.profiles p on p.id = a.student_id
   where a.session_id = p_session and a.status in ('present', 'late') and not (a.student_id = any(v_seen));
  select coalesce(jsonb_agg(p.full_name order by p.full_name), '[]') into v_unmarked
    from public.attendance a join public.profiles p on p.id = a.student_id
   where a.session_id = p_session and a.status not in ('present', 'late', 'excused') and a.student_id = any(v_seen);
  v_out := jsonb_build_object(
    'people_in_room', coalesce((p_result->>'count')::int, 0),
    'people_max', coalesce((p_result->>'count_max')::int, 0),
    'marked_present', v_marked,
    'recognised', cardinality(v_seen),
    'not_seen', v_missing,
    'in_room_not_marked', v_unmarked,
    'unknown_faces', coalesce((p_result->>'unknown_faces')::int, 0),
    'window_s', coalesce((p_result->>'window_s')::numeric, 0),
    'frames', coalesce((p_result->>'frames')::int, 0));
  update public.class_sessions set final_check = v_out, final_check_at = now() where id = p_session;
  perform public.notify_session_staff(p_session, 'final_check', 'Final room check ready',
    format('%s people in the room, %s marked present, %s marked but not seen.',
           v_out->>'people_in_room', v_marked, jsonb_array_length(v_missing)),
    jsonb_build_object('url', '/sessions/' || p_session, 'session_id', p_session));
  return v_out;
end $$;

revoke execute on function public.record_final_check(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_final_check(uuid, jsonb) to service_role;
revoke execute on function public.request_final_check(uuid) from public, anon;
grant execute on function public.request_final_check(uuid) to authenticated;
