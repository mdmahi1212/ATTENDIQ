-- 08: lets the server (service role only) store/rotate the push webhook secret without the
-- secret being typed into the SQL editor. private.app_config itself stays unreachable for clients.
create or replace function public.set_push_webhook_secret(p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_secret is null or length(p_secret) < 32 then
    raise exception 'secret too short (min 32 chars)' using errcode = '22023';
  end if;
  insert into private.app_config (key, value) values ('push_webhook_secret', p_secret)
  on conflict (key) do update set value = excluded.value;
end $$;

revoke execute on function public.set_push_webhook_secret(text) from public, anon, authenticated;
grant execute on function public.set_push_webhook_secret(text) to service_role;
