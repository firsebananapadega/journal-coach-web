-- Register a minute-level pg_cron job that POSTs due reminders to
-- the Vercel /api/cron/send-reminders route. The route filters tasks,
-- signs HMAC tokens, and sends Web Push.
--
-- Ordering note: the cron starts firing immediately. If the Vercel
-- env vars (REMINDER_CRON_SECRET, VAPID_*, SUPABASE_SERVICE_ROLE_KEY)
-- aren't set yet, the route 401s / 500s silently and the cron tries
-- again next minute. So deploy order is:
--   1. set Vercel env vars
--   2. run this migration
--
-- The URL + secret are embedded here because Supabase's postgres
-- role can't ALTER DATABASE SET custom GUCs. Rotate by re-running
-- this migration with the new values (the DO block at the top will
-- unschedule the old job first).

do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-due-reminders') then
    perform cron.unschedule('send-due-reminders');
  end if;
end$$;

select cron.schedule(
  'send-due-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://journal-coach-web.vercel.app/api/cron/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer 7a9c3e5f1b7d9a2c4e6f8b3d5a7c9e1f3b5d7a9c2e4f6b8d1a3c5e7f9b2d4a6'
    ),
    body := jsonb_build_object('source', 'pg_cron', 'fired_at', now()::text)
  );
  $$
);
