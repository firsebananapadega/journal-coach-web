-- Register a minute-level pg_cron job that POSTs due reminders to
-- the Vercel /api/cron/send-reminders route. The route filters tasks,
-- signs HMAC tokens, and sends Web Push.
--
-- Ordering note: the cron starts firing immediately. If the Vercel
-- env vars (REMINDER_CRON_SECRET, VAPID_*, SUPABASE_SERVICE_ROLE_KEY)
-- aren't set yet, the route 401s / 500s silently and the cron tries
-- again next minute. So deploy order is:
--   1. set Vercel env vars
--   2. seed the Vault secret (see guard below)
--   3. run this migration
--
-- The Bearer token lives in Supabase Vault (cron_reminder_secret)
-- and is read at fire-time via vault.decrypted_secrets. To rotate,
-- update the Vault entry — no migration change needed.
--
-- Seeding (one-time, on a fresh environment):
--   select vault.create_secret('<new-bearer>', 'cron_reminder_secret',
--     'Bearer for /api/cron/send-reminders');

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_reminder_secret') then
    raise exception 'Vault secret "cron_reminder_secret" missing. Seed it before applying this migration.';
  end if;
end$$;

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
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_reminder_secret')
    ),
    body := jsonb_build_object('source', 'pg_cron', 'fired_at', now()::text)
  );
  $$
);
