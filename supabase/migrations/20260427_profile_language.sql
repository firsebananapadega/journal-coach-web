-- profile.language — server-side source of truth for the user's
-- chosen interface language. Previously language lived only in
-- browser localStorage, which the cron can't see. Result: any user
-- who set Spanish in Settings still received English letters,
-- because the weekly cron hard-coded locale='en'.
--
-- The check constraint enumerates the supported codes (matches
-- AppLanguage in src/lib/language.ts). Default 'en-US' mirrors the
-- existing client-side fallback.
--
-- Backfill: zilvy33@gmail.com (the user's wife, reported the bug)
-- gets her stored language flipped to es-MX immediately so the
-- next weekly cron picks up Spanish without waiting for her client
-- to sync from localStorage. Other existing users continue with
-- en-US until they (a) toggle in Settings, or (b) the next client
-- load runs the localStorage→profile sync.

alter table public.profiles
  add column if not exists language text not null default 'en-US'
  check (language in ('en-US', 'es-MX'));

update public.profiles
   set language = 'es-MX'
 where id in (select id from auth.users where email = 'zilvy33@gmail.com');
