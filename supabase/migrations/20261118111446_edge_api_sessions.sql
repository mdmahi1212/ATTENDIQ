-- 10: edge API helpers: current session per room, ad-hoc (test / simulation) sessions.

alter table public.class_sessions add column if not exists is_simulation boolean not null default false;

-- The session the edge node of a room should be working on right now (live or in recheck), or null.
create or replace function public.current_session_for_room(p_room uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(x) from (
    select s.id, s.section_id, s.starts_at, s.ends_at, s.state, s.policy, s.is_simulation, r.code as room_code
      from public.class_sessions s
      join public.rooms r on r.id = s.room_id
     where s.room_id = p_room and s.state in ('live', 'recheck')
     order by s.starts_at desc
     limit 1) x
$$;

-- Creates and starts a session outside the timetable (live gate test, or a simulator run).
-- p_starts_at may be in the past so a simulator can replay a whole class with past observed_at values.
-- Simulation sessions: any older live simulation session in the room is cancelled silently, and only
-- simulated students get attendance rows (real students must never be notified about a simulation).
create or replace function public.create_adhoc_session(
  p_room uuid, p_section uuid, p_starts_at timestamptz, p_minutes int, p_simulation boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_minutes is null or p_minutes < 10 or p_minutes > 240 then
    raise exception 'minutes must be 10..240' using errcode = '22023';
  end if;
  if p_starts_at < now() - interval '3 hours' or p_starts_at > now() + interval '1 day' then
    raise exception 'starts_at out of range' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sections where id = p_section) then
    raise exception 'section not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.rooms where id = p_room) then
    raise exception 'room not found' using errcode = 'P0002';
  end if;

  if p_simulation then
    update public.class_sessions
       set state = 'cancelled', cancelled_reason = 'superseded by a new simulation run'
     where room_id = p_room and is_simulation and state in ('scheduled', 'live', 'recheck');
    update public.verification_requests q set status = 'cancelled', closed_at = now()
      from public.class_sessions s
     where q.session_id = s.id and s.room_id = p_room and s.is_simulation and q.status = 'open';
  elsif exists (select 1 from public.class_sessions
                 where room_id = p_room and not is_simulation and state in ('live', 'recheck')) then
    raise exception 'another live session is running in this room' using errcode = '55000';
  end if;

  insert into public.class_sessions (section_id, room_id, session_date, starts_at, ends_at, is_makeup, is_simulation)
  values (p_section, p_room, (p_starts_at at time zone 'Asia/Seoul')::date, p_starts_at,
          p_starts_at + make_interval(mins => p_minutes), true, p_simulation)
  returning id into v_id;

  perform public.start_session(v_id, now());

  if p_simulation then
    delete from public.attendance a
     using public.profiles p
     where a.session_id = v_id and p.id = a.student_id and not p.is_simulated;
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, after, reason)
  values (auth.uid(), 'create', 'class_sessions', v_id::text,
          jsonb_build_object('starts_at', p_starts_at, 'minutes', p_minutes, 'simulation', p_simulation),
          case when p_simulation then 'simulator run' else 'ad-hoc test session' end);
  return v_id;
end $$;

revoke execute on function public.current_session_for_room(uuid),
  public.create_adhoc_session(uuid, uuid, timestamptz, int, boolean) from public, anon, authenticated;
grant execute on function public.current_session_for_room(uuid),
  public.create_adhoc_session(uuid, uuid, timestamptz, int, boolean) to service_role;
