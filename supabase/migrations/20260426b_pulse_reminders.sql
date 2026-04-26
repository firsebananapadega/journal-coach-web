-- Pulse-reminder dedup columns. Stamped by the
-- send-pulse-reminders cron each time it fires a push so the next
-- tick won't re-send within the same user-local day.
--
-- nullable: a freshly-created profile has never been reminded.

alter table public.profiles
  add column if not exists last_morning_pulse_reminder_at timestamp with time zone,
  add column if not exists last_evening_pulse_reminder_at timestamp with time zone;

-- Vault secret used by the cron's pg_cron schedule. The actual bearer
-- value is seeded by the rotation script (.tmp/rotate_cron_secrets.cjs)
-- via vault.create_secret/update_secret — the migration only enforces
-- that the secret name exists and the cron job is scheduled.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_pulse_reminder_secret') then
    raise exception 'Vault secret "cron_pulse_reminder_secret" missing. Seed it before applying this migration.';
  end if;
end$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-pulse-reminders') then
    perform cron.unschedule('send-pulse-reminders');
  end if;
end$$;

select cron.schedule(
  'send-pulse-reminders',
  '*/5 * * * *',  -- every 5 minutes — covers all timezones with ±5min jitter tolerance
  $$
  select net.http_post(
    url := 'https://journal-coach-web.vercel.app/api/cron/send-pulse-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_pulse_reminder_secret')
    ),
    body := jsonb_build_object('source', 'pg_cron', 'fired_at', now()::text)
  );
  $$
);
