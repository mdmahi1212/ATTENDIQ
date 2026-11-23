-- The door camera takes attendance only in the first 15 minutes of a class (user decision 2026-11-24; policy key
-- door_marks_until_min). After that a door recognition is still stored and still used for exits / re-entries
-- ('reentry' flag, returns after an OUT), but it no longer marks a student who is not marked yet: late arrivals are
-- marked by the room camera (method 'room') or by verifying on their phone.
update public.settings set value = value || '{"door_marks_until_min": 15}'::jsonb
 where key = 'policy' and not (value ? 'door_marks_until_min');

do $m$
declare d text := pg_get_functiondef('public.apply_edge_events(uuid,jsonb)'::regprocedure);
  a text := $a$        perform public.record_evidence(v_sess_id, v_student, v_at, 'gate', 'gate_event', v_id::text, false,$a$;
begin
  if position(a in d) = 0 then raise exception 'apply_edge_events: gate evidence call not found'; end if;
  d := replace(d, a, $b$        -- After door_marks_until_min the door only confirms students who are already marked (re-entry).
        if v_at <= v_sess.starts_at + make_interval(mins => public.pol_int(v_sess.policy, 'door_marks_until_min', 15))
           or exists (select 1 from public.attendance where session_id = v_sess_id and student_id = v_student
                        and status in ('present', 'late')) then
$b$ || a);
  d := replace(d, $a$          jsonb_build_object('score', v_payload->'score', 'margin', v_payload->'margin', 'simulation', v_sim));
      elsif v_type = 'GATE_PERSON_OUT'$a$, $a$          jsonb_build_object('score', v_payload->'score', 'margin', v_payload->'margin', 'simulation', v_sim));
        end if;
      elsif v_type = 'GATE_PERSON_OUT'$a$);
  if (length(d) - length(replace(d, 'door_marks_until_min', ''))) / 20 <> 2 or position('end if;
      elsif v_type = ''GATE_PERSON_OUT''' in d) = 0 then
    raise exception 'apply_edge_events: patch did not apply cleanly';
  end if;
  execute d;
end $m$;
