// One-shot: generate a bearer secret for the new send-pulse-reminders
// cron, store in Supabase Vault, push to Vercel env, then write to
// .env.local. Mirrors the structure of rotate_cron_secrets.cjs but
// only handles a single new secret. Re-runnable (idempotent).

const fs = require('fs');
const crypto = require('crypto');
const { Client } = require('pg');

const VAULT_NAME = 'cron_pulse_reminder_secret';
const ENV_NAME = 'PULSE_REMINDER_CRON_SECRET';

function readEnvLocal() {
  const env = {};
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

function writeEnvLocal(updates) {
  const lines = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/);
  const seen = new Set();
  const out = lines.map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) return line;
    if (Object.prototype.hasOwnProperty.call(updates, m[1])) {
      seen.add(m[1]);
      return `${m[1]}=${updates[m[1]]}`;
    }
    return line;
  });
  for (const k of Object.keys(updates)) if (!seen.has(k)) out.push(`${k}=${updates[k]}`);
  fs.writeFileSync('.env.local', out.join('\n'));
}

async function vercelEnvUpsert({ token, projectId, teamId, key, value }) {
  const listRes = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}&decrypt=false`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listRes.ok) throw new Error(`Vercel list env failed: ${listRes.status} ${await listRes.text()}`);
  const list = await listRes.json();
  for (const m of (list.envs || []).filter((e) => e.key === key)) {
    const del = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env/${m.id}?teamId=${teamId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    if (!del.ok && del.status !== 404) throw new Error(`Vercel delete env ${key} failed: ${del.status} ${await del.text()}`);
  }
  const create = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, type: 'encrypted', target: ['production', 'preview', 'development'] }),
    },
  );
  if (!create.ok) throw new Error(`Vercel create env ${key} failed: ${create.status} ${await create.text()}`);
}

function quote(s) { return `'${String(s).replace(/'/g, "''")}'`; }

async function main() {
  const env = readEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const password = env.SUPABASE_DB_PASSWORD;
  const vercelToken = env.VERCEL_ACCESS_TOKEN;
  if (!url || !password || !vercelToken) throw new Error('Missing keys in .env.local');

  const ref = url.match(/https?:\/\/([^.]+)\.supabase\.co/)[1];
  const host = `db.${ref}.supabase.co`;
  const projectMeta = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf8'));
  const projectId = projectMeta.projectId;
  const teamId = projectMeta.orgId;

  const newSecret = crypto.randomBytes(32).toString('hex');

  console.log('[seed] Step 1/3: upserting Vercel env…');
  await vercelEnvUpsert({ token: vercelToken, projectId, teamId, key: ENV_NAME, value: newSecret });
  console.log('  ✓ Vercel env set');

  console.log('[seed] Step 2/3: writing Vault secret…');
  const sql = `
do $$
declare existing_id uuid;
begin
  select id into existing_id from vault.secrets where name = ${quote(VAULT_NAME)};
  if existing_id is null then
    perform vault.create_secret(${quote(newSecret)}, ${quote(VAULT_NAME)}, 'Bearer for /api/cron/send-pulse-reminders');
  else
    perform vault.update_secret(existing_id, ${quote(newSecret)});
  end if;
end$$;
`;
  const c = new Client({ host, port: 5432, user: 'postgres', password, database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(sql);
  await c.end();
  console.log('  ✓ Vault secret written');

  console.log('[seed] Step 3/3: writing .env.local…');
  writeEnvLocal({ [ENV_NAME]: newSecret });
  console.log('  ✓ .env.local updated');
  console.log('[seed] DONE.');
}

main().catch((e) => { console.error('[seed] FAILED:', e.message); process.exit(1); });
