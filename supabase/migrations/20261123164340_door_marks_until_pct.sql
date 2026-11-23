-- Door attendance cutoff = 17% of the class time, the same rule for demo and live classes (user decision 2026-11-24;
-- replaces the fixed 15 minutes of 20261123164034). Policy key door_marks_until_pct (default 17): a 75-min class ->
-- 12.75 min, a 10-min demo -> 1.7 min. After it the door still records sightings and tracks exits / re-entries.
update public.settings set value = (value - 'door_marks_until_min') || '{"door_marks_until_pct": 17}'::jsonb
 where key = 'policy';

do $m$
declare d text := pg_get_functiondef('public.apply_edge_events(uuid,jsonb)'::regprocedure);
  a text := $a$v_sess.starts_at + make_interval(mins => public.pol_int(v_sess.policy, 'door_marks_until_min', 15))$a$;
begin
  if position(a in d) = 0 then raise exception 'apply_edge_events: door cutoff not found'; end if;
  d := replace(d, a, $b$v_sess.starts_at + (v_sess.ends_at - v_sess.starts_at) * (public.pol_num(v_sess.policy, 'door_marks_until_pct', 17) / 100.0)$b$);
  d := replace(d, '-- After door_marks_until_min the door', '-- After door_marks_until_pct of the class the door');
  execute d;
end $m$;
