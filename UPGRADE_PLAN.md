# JournalCoach Upgrade Plan

> Document created: 2026-04-17
> Purpose: Complete handoff document so any future Claude session can pick up where this one left off.

---

## Table of Contents

1. [Context & Problem Statement](#1-context--problem-statement)
2. [Current App Architecture](#2-current-app-architecture)
3. [Phase 1: Daily Pulse Feature](#3-phase-1-daily-pulse-feature)
4. [Phase 2: Guide AI Quality — Research & Options](#4-phase-2-guide-ai-quality--research--options)
5. [Phase 3: Speech — Decision Made](#5-phase-3-speech--decision-made)
6. [Technical Reference](#6-technical-reference)

---

## 1. Context & Problem Statement

### The user's core problem
The user built JournalCoach — a sophisticated journaling app with AI-guided sessions, voice input, templates, plans, priorities, groceries, and habits. Despite its depth, **the user does not use it daily**. The consistency problem is the central issue.

### Root cause diagnosis
The app has **no gravity well** — no single, frictionless daily touchpoint that pulls the user back. Instead, the home screen presents 18 draggable bubbles (Write, Voice, Guided, Templates, Plans, Priorities, Habits, etc.), creating decision fatigue before the user does anything. The guided sessions require 7+ exchanges (10-15 min commitment). Templates have 3-7 questions each. There's no 2-minute "open, answer, done" path.

### What research says would fix this
Deep research across 18 primary sources (Ignatian Examen, Zettelkasten, Focusing, Naikan, NVC, Pennebaker, etc.) — conducted via NotebookLM cross-source synthesis — concluded that the single most direction-revealing daily practice is tracking **consolation vs. desolation**: what made you feel alive today vs. what drained you. This is the core of the Ignatian Examen (500+ years of use), and NotebookLM's cross-source query confirmed it as the most "load-bearing" practice for the user's stated goal of "figuring out what direction to go in life."

### The upgrade
Add a **"Daily Pulse"** feature — two questions, voice or text, 2-3 minutes — as the app's primary daily touchpoint. After 7+ days, surface patterns from accumulated pulse data.

### NotebookLM notebook with all research
- **Notebook ID:** `f3bfb5f0-ca6f-4c8e-bae2-92c3018f7a6d`
- **URL:** https://notebooklm.google.com/notebook/f3bfb5f0-ca6f-4c8e-bae2-92c3018f7a6d
- Contains 18 sources covering all the practices researched

---

## 2. Current App Architecture

### Tech Stack
- **Framework:** Next.js 16.2.2 (React 19, TypeScript 5)
- **Styling:** Tailwind CSS v4 + Framer Motion
- **State:** Zustand v5
- **Backend:** Supabase (PostgreSQL + Auth)
- **AI:** Google Gemini 2.5 Flash (free tier, 10 API keys in round-robin)
- **Speech:** Web Speech API (browser-native, no external service)
- **Deployment:** PWA-ready (manifest.json exists with standalone display)

### Key Files for the Upgrade

| File | Purpose | Relevance |
|------|---------|-----------|
| `src/app/(app)/home/page.tsx` | Home page with bubble grid | Daily Pulse card goes here, above bubbles |
| `src/lib/geminiClient.ts` | Gemini API client with key rotation | Guide model selection happens here |
| `src/lib/guideEngine.ts` | Guide conversation engine | Line 80: currently calls `gemini-2.5-flash` despite comment saying Pro |
| `src/lib/guideConfigs.ts` | Guide personas (Ben, Quinn, Sage, Bodhi) | System prompts — these are well-crafted and model-agnostic |
| `src/lib/speechRecognition.ts` | Web Speech API wrapper | User will use Wispr instead, no changes needed |
| `src/stores/journalStore.ts` | Journal entries CRUD (Supabase) | Pulse entries save here with `entry_type: 'pulse'` |
| `src/components/MoodSelector.tsx` | 1-10 mood scale | May want a simplified version for pulse |
| `public/manifest.json` | PWA manifest | Already configured, app installable on phone |

### Database Schema (Supabase)

**journal_entries table:**
- `id`, `user_id`, `entry_type` ('voice'|'template'|'guided'|'freeform' — will add 'pulse')
- `title`, `content_text`, `template_id`
- `mood_score` (1-10), `mood_label`, `tags`, `is_favorite`
- `duration_seconds`, `word_count`
- `metadata` (JSON — for pulse: `{alive: string, drained: string}`)
- `created_at`, `updated_at`

### Current AI Model Usage
- **Guide sessions:** `gemini-2.5-flash` (line 80 of guideEngine.ts)
- **Capture engine:** `gemini-2.5-flash` (for parsing voice into priorities/plans/groceries)
- **Round-robin:** Up to 10 API keys, with cooldown on rate-limit/quota errors
- **All calls are client-side** (NEXT_PUBLIC env vars, no backend API routes)

---

## 3. Phase 1: Daily Pulse Feature

### What It Is
A card on the home page, above the bubble grid, asking two questions:
1. "What moment today made you feel most alive?"
2. "What moment today drained you?"

Voice (via Wispr or keyboard) or text input. No mood scale, no template progression, no multi-exchange session. Answer two questions, done. 2-3 minutes max.

### Why These Specific Questions
- The Ignatian Examen's steps 3-4 (paying attention to emotions, choosing one moment) compressed to their essential kernel
- NotebookLM cross-source query confirmed: "the Examen is the only practice explicitly designed as a direction-finding instrument... it produces discernment"
- Pennebaker's research shows the cognitive turn ("I felt alive BECAUSE...") produces measurable psychological benefit — these questions naturally elicit that causal reasoning
- The pattern data (what clusters on each side after 30 days) IS the user's direction, revealed without conscious analysis

### Implementation Plan

#### A. New Supabase entry type
- Add `'pulse'` to the `entry_type` enum (or just use the string — current code uses string matching)
- Store pulse data in `metadata` JSON: `{alive: string, drained: string}`
- `content_text` = combined text for searchability
- Optional: `mood_score` (simplified — maybe just 3 states: rough/okay/good — or skip entirely for v1)

#### B. New component: `DailyPulseCard.tsx`
**Location:** `src/components/DailyPulseCard.tsx`

**States:**
1. **Not completed today** — shows the two input fields (prominent, inviting)
2. **Completed today** — shows today's answers with a green checkmark, collapsed
3. **Has 7+ days of data** — shows a "View Patterns" link

**Behavior:**
- Check `journalStore` for today's pulse entry on mount
- Two text areas (or single-line inputs with expand on focus)
- Submit saves to Supabase as `entry_type: 'pulse'`
- Voice input: user types via Wispr (system keyboard), no app-level mic needed
- After save: brief affirmation ("Logged"), card collapses to completed state
- No friction: no mood selection, no template progression, no guide response

#### C. Home page integration
**File:** `src/app/(app)/home/page.tsx`
- Daily Pulse card renders FIRST, before the bubble grid
- If already completed today, shows collapsed summary
- The bubble grid remains below — all existing features untouched

#### D. Patterns view (after 7+ entries)
**New page:** `src/app/(app)/pulse/page.tsx`

**What it shows:**
- Timeline of all pulse entries (most recent first)
- **Alive themes:** AI-generated summary of what keeps appearing on the "alive" side (run through Gemini/Claude when user opens patterns view)
- **Drained themes:** Same for the drained side
- **Insight prompt:** "You've mentioned [X] 5 times in 'alive' and [Y] 4 times in 'drained' this month. What does that tell you?"
- Simple word-cloud or frequency view of common themes

**Pattern analysis approach:**
- Collect all pulse entries for last 30 days
- Send to AI: "Here are my daily pulse entries. For 'alive' moments, what themes/patterns repeat? For 'drained' moments, what themes/patterns repeat? Be specific and cite entries."
- Display the synthesis
- This is the "mirror" that makes the user want to come back — curiosity about what the pattern looks like with one more data point

#### E. What NOT to build in Phase 1
- No streak counter (gamification creates guilt, not pull)
- No notifications/reminders (the app should pull, not push)
- No AI-generated follow-up questions on the pulse (keep it pure: 2 questions, done)
- No integration with guided sessions yet (Phase 2 territory)

---

## 4. Phase 2: Guide AI Quality — Research & Options

### The Problem
The user reports that "Talk to Guide" responses are noticeably lower quality than talking directly to Claude. The guide system prompts (Ben, Quinn, Sage, Bodhi) are well-crafted, but the model powering them matters.

**Current model:** `gemini-2.5-flash` (line 80 of `guideEngine.ts`)
**Note:** Line 3's comment says "Uses gemini-2.5-pro" but the actual code uses Flash.

### Option A: Switch to Gemini 2.5 Pro (FREE, test first)

**Research findings:**
- Gemini 2.5 Pro has better performance on nuanced, empathetic conversation than Flash
- Pro "excels at subtlety and picks up on contextual clues and unspoken subtext" vs Flash which is optimized for speed
- **Free tier status (as of late 2025/early 2026):** Google significantly cut the free tier — Gemini 2.5 Pro reduced to ~100 RPD (requests per day), and for some accounts Pro may not appear under free tier at all
- The user should check their specific quota in [Google AI Studio](https://aistudio.google.com/) under Projects

**How to test:**
1. Change line 80 of `guideEngine.ts` from `'gemini-2.5-flash'` to `'gemini-2.5-pro'`
2. Run 5-10 guided sessions and compare quality
3. Monitor for 429 errors (quota exhaustion) — the round-robin key system will handle this automatically
4. If quality is "good enough," stay on Gemini Pro for free. If not, proceed to Option B or C.

**Risk:** Free tier quota may be insufficient for daily use. If the user hits quota with Pro, they could use a hybrid: Pro for guided sessions (few per day), Flash for capture engine (many calls for parsing voice).

**Implementation effort:** One line change.

### Option B: Switch to Claude API (PAID, best quality)

**Research findings:**
- Claude Max subscription ($100-200/mo) does NOT include API access. API is a separate product with separate billing. [Anthropic explicitly confirms this](https://support.claude.com/en/articles/9876003).
- Claude API pricing: Sonnet ~$3/MTok input, $15/MTok output. For personal daily use (a few guided sessions/day, ~2000 tokens each), estimated cost: **$1-5/month**.
- Claude Opus for deep sessions would be more (~$15/MTok input, $75/MTok output) but only needed for Bodhi-type contemplative sessions.

**Implementation:**
1. Create `src/lib/claudeClient.ts` — Anthropic SDK client
2. This MUST be a server-side API route (unlike Gemini, Claude API key cannot be NEXT_PUBLIC — it would be exposed to the browser)
3. Create `src/app/api/guide/route.ts` — Next.js API route that receives the prompt + conversation history and returns Claude's response
4. Update `guideEngine.ts` to call the API route instead of Gemini directly
5. The guide system prompts (Ben, Quinn, Sage, Bodhi) port directly — they're model-agnostic

**Architecture change:** This moves from fully client-side AI to having one server-side API route. The app is already deployed as a Next.js app, so this is straightforward. Supabase auth can validate the user on the API route.

### Option C: Use Claude Max via proxy (FREE but TOS-risky)

**Research findings:**
- **CLIProxyAPI** and similar tools used to allow using your Claude Max subscription as an OpenAI-compatible API endpoint
- **As of April 4, 2026, Anthropic blocked this.** Third-party tools can no longer use Claude subscription limits. [VentureBeat](https://venturebeat.com/technology/anthropic-cuts-off-the-ability-to-use-claude-subscriptions-with-openclaw-and), [Anthropic's announcement](https://support.claude.com/en/articles/9876003)
- Some community workarounds exist (openclaw-billing-proxy) but they explicitly violate Anthropic's Terms of Service
- **Recommendation: Do not rely on this.** It could break at any time and using it risks account suspension.

### Option D: Use Claude Cowork to build/run the app (NOT viable for this use case)

**Research findings:**
- Claude Cowork is an agentic desktop tool — it can build apps, write code, interact with files on your computer
- It is NOT an API. It cannot serve as a backend for a web/mobile app
- It requires the Claude desktop app (macOS/Windows) — no mobile
- Cowork is great for *building* the app (as we're doing now), not for *powering* it at runtime
- **Verdict: Cowork is the wrong tool for this. It's for development, not for serving AI responses to end users.**

### Recommendation

**Start with Option A (Gemini Pro, free).** One line change. Test for 5-10 sessions. If quality is sufficient for guided sessions, stay there — zero cost.

If Pro isn't good enough (which is likely for Bodhi-type deep contemplative sessions), add **Option B (Claude API, server-side)** as a premium path. The $1-5/month cost is negligible for a personal app. Implement a model selector: Gemini Pro for quick check-ins (Ben, Quinn), Claude Sonnet for deep sessions (Sage, Bodhi).

**Do not use Option C (proxy).** TOS violation, unreliable, likely to break.
**Do not use Option D (Cowork).** Wrong tool for this use case.

### Key sources for this research:
- [Claude Max vs API — official Anthropic answer](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console)
- [Claude Code with Pro/Max plan](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)
- [CLIProxyAPI (now blocked)](https://rogs.me/2026/02/use-your-claude-max-subscription-as-an-api-with-cliproxyapi/)
- [Anthropic blocks third-party tools](https://venturebeat.com/technology/anthropic-cuts-off-the-ability-to-use-claude-subscriptions-with-openclaw-and)
- [Claude Cowork — what it is](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- [Gemini 2.5 Pro vs Flash comparison](https://dev.to/leena_malhotra/gemini-25-pro-vs-gemini-25-flash-which-model-should-you-use-3ea2)
- [Gemini free tier rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)

---

## 5. Phase 3: Speech — Decision Made

**Decision:** No changes needed. The user has Wispr installed on their phone and pays for it separately. Wispr provides Whisper-quality transcription at the system keyboard level, which works in any text field in the app. The app's built-in Web Speech API remains as a fallback but is not the primary input method.

No code changes required for Phase 3.

---

## 6. Technical Reference

### Files that Phase 1 will create or modify

**New files:**
1. `src/components/DailyPulseCard.tsx` — The two-question card component
2. `src/app/(app)/pulse/page.tsx` — Patterns/insights view
3. `src/app/(app)/pulse/layout.tsx` — Layout wrapper (if needed)

**Modified files:**
1. `src/app/(app)/home/page.tsx` — Add DailyPulseCard above bubble grid
2. `src/stores/journalStore.ts` — Add pulse-specific query (today's pulse, last 30 days of pulses)
3. `src/lib/guideEngine.ts` — (Phase 2 only) Change model from Flash to Pro on line 80

**No schema migration needed:** The existing `journal_entries` table supports this via:
- `entry_type: 'pulse'` (string field, no enum constraint)
- `metadata: {alive: string, drained: string}` (JSON field)
- `content_text` for combined searchable text

### Current Gemini model line
```typescript
// src/lib/guideEngine.ts, line 80
const text = await callGemini('gemini-2.5-flash', prompt);
// Change to 'gemini-2.5-pro' for Option A test
```

### Supabase connection
- URL: via `NEXT_PUBLIC_SUPABASE_URL` env var
- Anon key: via `NEXT_PUBLIC_SUPABASE_ANON_KEY` env var
- Client: `src/lib/supabase.ts`

### PWA status
- `public/manifest.json` exists with `"display": "standalone"` and `"start_url": "/home"`
- App is already installable as PWA on phone
- No service worker detected (offline support would need adding separately)

---

## Implementation Priority

| Phase | What | Effort | Cost | Impact |
|-------|------|--------|------|--------|
| **1** | Daily Pulse (2 questions + patterns view) | ~4-6 hours | $0 | **Highest** — this is the gravity well |
| **2a** | Switch guide to Gemini 2.5 Pro | 5 minutes (1 line) | $0 | Medium — test quality difference |
| **2b** | Add Claude API for guide (if Pro isn't enough) | ~2-3 hours | ~$3/mo | High — but only if 2a fails |
| **3** | Speech upgrade | None needed | $0 | N/A — Wispr covers this |

**Start with Phase 1. It is the answer to the consistency problem.**
