import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callGeminiServer, getProUsage } from '@/lib/server/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Diagnostic timing — visible via `vercel logs`.
function log(tag: string, extra?: Record<string, unknown>) {
  const line = { tag, ts: Date.now(), ...extra };
  console.log('[gemini-route]', JSON.stringify(line));
}

async function authedUserId(req: Request): Promise<string | null> {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      log('auth.no_token');
      return null;
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      log('auth.env_missing', { hasUrl: !!url, hasAnon: !!anonKey });
      return null;
    }
    const supabase = createClient(url, anonKey);
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      log('auth.supabase_error', { msg: error.message });
      return null;
    }
    if (!data.user) {
      log('auth.no_user');
      return null;
    }
    return data.user.id;
  } catch (err) {
    log('auth.throw', { msg: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function POST(req: Request) {
  const t0 = Date.now();
  log('post.start');

  try {
    const userId = await authedUserId(req);
    log('post.authed', { ms: Date.now() - t0, userId: userId ? userId.slice(0, 8) : null });
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      log('post.invalid_json', { ms: Date.now() - t0 });
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const { model, prompt, timeoutMs } = (body ?? {}) as {
      model?: unknown;
      prompt?: unknown;
      timeoutMs?: unknown;
    };
    if (typeof model !== 'string' || typeof prompt !== 'string') {
      log('post.bad_request', { ms: Date.now() - t0 });
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    log('post.gemini_start', {
      ms: Date.now() - t0,
      model,
      promptChars: prompt.length,
    });

    try {
      const result = await callGeminiServer(
        model,
        prompt,
        typeof timeoutMs === 'number' ? { timeoutMs } : {},
      );
      log('post.gemini_ok', {
        ms: Date.now() - t0,
        modelUsed: result.modelUsed,
        fallback: !!result.usedFallback,
        textChars: result.text.length,
      });
      return NextResponse.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown_error';
      // Rate-limit branch: return 429 with a typed payload so the client
      // can render a guide-flavored card instead of a generic connection
      // error. scope='all' means both Pro and Flash are exhausted, so
      // there is no path forward today; scope='pro' means Pro alone is
      // gone but Flash is still serving (we'd normally never reach this
      // branch in that case, since the fallback would have succeeded).
      if (msg.startsWith('RATE_LIMITED:')) {
        const detail = msg.slice('RATE_LIMITED:'.length);
        const scope = /both engines/i.test(detail) ? 'all' : 'pro';
        log('post.rate_limited', { ms: Date.now() - t0, detail, scope });
        return NextResponse.json(
          { error: 'rate_limited', detail, scope },
          { status: 429 },
        );
      }
      const status = /timed out/i.test(msg) ? 504 : 500;
      log('post.gemini_err', { ms: Date.now() - t0, msg, status });
      return NextResponse.json({ error: msg }, { status });
    }
  } catch (err) {
    // Fatal — anything that escaped the inner try/catches (e.g. auth
    // throwing, route-level corruption). Surfaces the exact error text
    // in Vercel logs instead of a bare 500.
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log('post.fatal', { ms: Date.now() - t0, msg, stack: stack?.split('\n').slice(0, 5).join(' | ') });
    return NextResponse.json({ error: 'server_fatal', detail: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const userId = await authedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json(getProUsage());
}
