-- Reminders: every minute pg_cron asks the app to send due plan events.
-- URL and secret are stored in private.config (set outside git):
--   insert into private.config values ('tick_url','https://<app>/api/cron/tick'), ('cron_secret','<CRON_SECRET>');
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.call_tick() returns void
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select value from private.config where key = 'tick_url'),
    headers := jsonb_build_object('content-type', 'application/json',
                                  'x-cron-secret', (select value from private.config where key = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  where exists (select 1 from private.config where key = 'tick_url');
$$;

select cron.unschedule('colonoscopy-tick') where exists (select 1 from cron.job where jobname = 'colonoscopy-tick');
select cron.schedule('colonoscopy-tick', '* * * * *', 'select private.call_tick()');
