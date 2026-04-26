# Session Handoff — 2026-04-25

Research dossier + roadmap state for the next pickup. Everything in this
file is meant to let a future session resume without re-doing any research.

---

## Quick-reference keywords

Paste any of these in a future session to jump directly back to the
relevant context. The agent will read this file and pick up from there.

| Keyword / phrase | Loads this section |
|---|---|
| `"intentions-replacement handoff"` | Whole document |
| `"Family A through K"` | Design space for "what moved forward today" |
| `"Presence surface"` | Tier 1 recommendation (mid-day pause) |
| `"Connection ledger"` | Tier 2 recommendation (relational tracking) |
| `"Win of the day"` | Tier 3 recommendation (evening pulse fold-in) |
| `"daily-practice research"` | Effect-size table + citation index |
| `"capture mic plan"` | Mic + wall + onboarding fixes (already shipped) |
| `"phase 5 followups"` | JSON mode + eligibility gates work (already shipped) |
| `"cron vault rotation"` | Bearer-token rotation + Vault refactor (already shipped) |

The simplest pickup line:
> *"Read `docs/SESSION_HANDOFF_2026-04-25-intentions-replacement.md` — let's continue with [keyword]."*

---

## Where the app is right now

### Shipped this session (2026-04-25)

| Feature | What it does | Files |
|---|---|---|
| Cron Vault rotation | All 4 pg_cron Bearer secrets moved to Supabase Vault; old ones rotated and inert | `supabase/migrations/20260425*`, `.tmp/rotate_cron_secrets.cjs`, `.tmp/preflight_rotation.cjs` |
| Phase-5 letter fixes | JSON-mode for Gemini (`responseMimeType` + `responseSchema`), strict parsers throw on failure, research-backed eligibility gates per cron | `src/lib/server/eligibility.ts`, `src/lib/{quarterlyLetter,monthlyPattern,weeklyReflection}.ts`, `src/lib/server/gemini.ts`, `src/app/api/cron/generate-{weekly-letters,monthly-patterns,quarterly-letters}/route.ts` |
| Latest-letter card on /patterns | Surfaces the most recent letter across all kinds, links to /letters archive | `src/app/(app)/patterns/page.tsx` |
| Mic freeze fix | Dropped `getUserMedia` preflight + 2.5 s watchdog in `startListening` + cancel hard-stop on `/voice` | `src/lib/speechRecognition.ts`, `src/hooks/useSelectionAwareMic.ts`, `src/app/(app)/voice/page.tsx` |
| Auto-mic + gear toggle | Capture page auto-starts mic by default; gear icon top-right opens settings sheet with toggle; first-open carve-out for new users | `src/app/(app)/voice/page.tsx` |
| Last-wall persistence | Root page reads `wallState.v1` localStorage and redirects to last-active wall + tab | `src/app/page.tsx` (`lastWallDestination()`), reused in `src/app/auth/sign-up/page.tsx` |
| Primary-use onboarding | New step asks Journaling vs Tasks; persists to `profiles.primary_use`; seeds `wallState.v1` | `src/components/onboarding/PrimaryUseStep.tsx`, `src/app/auth/onboarding/page.tsx`, migration `20260425_primary_use.sql` |

### Eligibility thresholds now live (research-backed)

| Cron | Account-age | Entries (window) | Active-day count |
|---|---|---|---|
| Weekly | ≥ 7 d | ≥ 3 / 7 d | ≥ 3 / 7 d |
| Monthly | ≥ 30 d | ≥ 15 / 30 d | ≥ 10 / 30 d |
| Quarterly | ≥ 45 d | ≥ 30 / 90 d | ≥ 20 / 90 d (+ ≥ 85 d since last) |

Constants live in `src/lib/server/eligibility.ts` under `ELIGIBILITY`.

---

## The big open question: replacing the Intentions tab

The user reports finding genuine value in the morning + evening pulse but
under-uses the **Intentions** tab. The question they posed:

> *"What can replace Intentions that I'd actually use daily and would give
> me the most value?"*

Followed by a follow-on question about whether "what moved forward today"
should be **predefined chips** (Exercise, Project X) or **open text**.

Both questions are still open as of end of session. Recommendations and
the full design space follow.

### Top-line conclusion

The strongest swap is **NOT another tracker** — it's adding a third daily
reflective touchpoint that fills a dimension the current pulse doesn't
cover (body / attention / relational). Concretely:

1. **Tier 1 — Presence surface** (`"Presence surface"` keyword): mid-day
   30-second pause inspired by Killingsworth & Gilbert's wandering-mind
   research and the Examen tradition. Three quick prompts: where's your
   attention? body check? one word for now?
2. **Tier 2 — Connection ledger** (`"Connection ledger"`): daily 30 s on
   who you connected with and how it felt. Anchored in Harvard Adult
   Development Study's 85-year longitudinal finding that relationships
   are the #1 predictor of life satisfaction.
3. **Tier 3 — Win of the day** (`"Win of the day"`): one-line addition to
   the **existing** evening pulse. Don't make it a new tab. Maps to
   Amabile & Kramer's progress-principle research (12,000 diaries).

The Tier-1 swap is the single highest-leverage change because it
**triples the daily touchpoints from 2 to 3**, which app-stickiness
research shows is the dominant retention lever (independent of what's
inside each touchpoint).

---

## Daily-practice research (effect-size table)

| Practice | Evidence base | Effect / metric |
|---|---|---|
| Mind-wandering reduction (Killingsworth & Gilbert 2010) | 250 K data points, *Science* | Mind-wandering explains **10.8% within-person, 17.7% between-person variance in happiness** |
| Relationships (Harvard Adult Development Study) | 85-year longitudinal | #1 predictor of health + life satisfaction; relationships > cholesterol at age 50 for predicting health |
| Progress / small wins (Amabile & Kramer 2011) | 12 K diary entries, 7 companies, 238 employees | 28 % of "minor" events had major impact on inner work life |
| Best Possible Self exercise | Meta-analysis 26 studies, n=2,909 (Carrillo 2019) | d = 0.325 wellbeing, 0.334 optimism, 0.511 positive affect |
| Gratitude → depression | Meta-analysis (PNAS 2025, 145 studies, 28 countries) | r = -0.39 (moderate, but adherence drops fast) |
| Pennebaker expressive writing | Meta-analyses (Frattaroli 2006, 146 studies) | ~5 % mental-health improvement; cognitive-word mechanism |
| Loving-kindness meditation | 12-wk RCT (Le Nguyen 2019) | Buffered telomere shortening; ↑ vagal tone |
| Habit formation | Lally et al. 2010 | Automaticity asymptote at mean 66 days (range 18-254) |

### What does NOT work for daily-app retention

(JMIR 2024 scoping review + 2019 wearable abandonment study)

- **Time tracking proper** — the user mentioned this. Bad fit. High
  abandonment from "perceived data uselessness." Activity / sleep /
  exercise are the high-retention quantified-self categories; granular
  time-on-task is not.
- **Pure habit checkbox tracker** — what the current Intentions tab is.
  ≤3 habits is the single most important setup decision (per
  StriveCloud retention research); the existing tab over-scopes with 6
  categories × many practices.
- **Setup-heavy systems** — Tiago Forte's rule: *"If your system is as
  intricate as your life, the effort to maintain it deprives you of the
  energy to live it."*

---

## Design space: "what moved forward today"

The user asked specifically about this question after the initial round.
There are 11 distinct designs (Families A through K). Reference them by
letter in future conversations.

| Family | Mechanic | Setup | Daily friction | Scoreboard? | Notes |
|---|---|---|---|---|---|
| **A** | Open text only | None | Low (~10 s) | None | Trust narrative |
| **B** | Pre-defined chip toggles (yes/no) | High | Lowest (~5 s) | Strong | Habit-tracker-shaped — what the current Intentions tab is |
| **C** | Chips + optional text per chip | High | Medium | Strong | Richest signal but more decisions |
| **D** | AI-detected tracks (auto-bootstrap) | None | Lowest after week 2 | Strong | Wait 1-2 weeks, AI proposes 3-5 tracks from journal entries |
| **E** | One rotating prompt (AI picks one) | None | Lowest (1 tap) | Per-item | Surprise factor; depends on AI accuracy |
| **F** | Reuse existing Priorities tab | Already done | Low | Already done | Low new build |
| **G** | Project + ad-hoc combo | High | Medium-high | Strong + text | Most powerful, most setup |
| **H** | Journal tags (`#wellbloom`) | Trivial | **Zero** new | Tag rollup | Reuses the journal capture you already do |
| **I** | Wins-only (Amabile-faithful) | None | Low | Win-count only | Maps cleanly to the actual research |
| **J** | Body / Mind / World 3-line micro | None | High (3 fields) | Three streams | Schematic |
| **K** | In-the-moment capture button (no scheduled prompt) | None | Variable | Progress count | Power-user; Phase 2 |

### Recommended pair (still un-decided)

The two designs that fit the user's specific situation without becoming a
guilt machine:

- **Family D (AI-detected tracks)** — wait two weeks of journaling, let
  the AI propose 3-5 tracks from real entries, then chip yes/no nightly.
  Combines scoreboard appeal with zero setup and self-correcting
  categories.
- **Family H (journal tags)** — add `#tag` syntax to journal entries,
  surface a daily roll-up in the evening pulse. Zero new daily friction.

If forced to pick one **without the user's preference**, I lean Family H
because the user already journals heavily and the tag-rollup is a
near-free addition.

### Avoid

- **Family B** straight chips (the current Intentions tab in disguise)
- **Time tracker** of any flavor (research says high abandonment)

### Cross-cutting decisions still open

When the user picks a Family, these orthogonal choices remain:

1. **Where does it live?** Inside evening pulse / standalone tab / inline
   on /home / anytime button.
2. **How does Patterns consume it?** Frequency-only / sentiment-tagged /
   linked to entries / heatmap / fed into letter prompts.
3. **Setup model.** Cold-start / AI-bootstrapped / hybrid / never.
4. **Voice-first variant.** Any text family could be voice-first ("Today:
   shipped Phase 5, ran 3 miles, dad called" parsed by AI into events).

---

## Pending decisions for the user

1. **Pick a Family (A-K)** for "what moved forward today." My
   recommendation: H or D, or both. The user has not yet decided.
2. **Decide on the Tier 1 Presence surface.** The bigger question of
   replacing the Intentions tab. Recommendation is to build Presence;
   the user has not yet decided.
3. **Whether to keep Intentions tab.** If we build Presence, Intentions
   would be replaced (the slot is occupied). If we go with H or D for
   "what moved forward today," that could live INSIDE evening pulse and
   leave Intentions slot free for Presence.

The cleanest unified path:
- Build **Presence** (Tier 1) into the Intentions slot.
- Add **Win of the day** (Tier 3) to evening pulse.
- Add **Family H journal tags** for organic project tracking.
- Defer Tier 2 Connection ledger as a Phase 2 add.

This requires the user's go-ahead before any work starts.

---

## Citation index

Anchored sources for everything claimed above. Reference by URL when
re-confirming evidence in a future session.

### Mind-wandering / experience sampling
- [Killingsworth & Gilbert (2010), *Science*](https://www.science.org/doi/10.1126/science.1192439)
- [Wandering-mind preprint PDF](https://greatergood.berkeley.edu/images/uploads/A_Wandering_Mind_Is_an_Unhappy_Mind.pdf)
- [Harvard Gazette: wandering-mind summary](https://news.harvard.edu/gazette/story/2010/11/wandering-mind-not-a-happy-mind/)

### Harvard Study of Adult Development
- [Robert Waldinger overview, Harvard Chan](https://www.hsph.harvard.edu/news/features/the-good-life-discussion-with-robert-waldinger/)
- [Harvard Gazette 2023 — Relationships make us happy and healthy](https://news.harvard.edu/gazette/story/2023/02/work-out-daily-ok-but-how-socially-fit-are-you/)
- [The Good Life: Lessons from the longest study (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11575524/)

### Progress Principle
- [Amabile & Kramer book page (HBS)](https://www.hbs.edu/faculty/Pages/item.aspx?num=40692)
- [Mindtools: Progress Theory summary](https://www.mindtools.com/arzm8fy/amabile-and-kramers-progress-theory/)

### Best Possible Self
- [Carrillo et al. 2019 meta-analysis (PLOS One)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0222386)

### Gratitude
- [PNAS 2025 meta-analysis (145 studies / 28 countries)](https://www.pnas.org/doi/10.1073/pnas.2425193122)
- [Gratitude interventions systematic review (PMC 2023)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10393216/)

### Pennebaker / expressive writing
- Frattaroli 2006 — meta-analysis of 146 studies (cited via NotebookLM
  source `b8674e14-1b99-4465-a382-af1f9a3d7b2a` in notebook
  `f3bfb5f0-ca6f-4c8e-bae2-92c3018f7a6d`)

### Loving-kindness meditation
- Le Nguyen et al. 2019 — *Psychoneuroendocrinology* 108, 20-27 (DOI:
  10.1016/j.psyneuen.2019.05.020)

### Habit formation
- Lally et al. 2010 — *European Journal of Social Psychology* (mean 66 d
  to automaticity)

### Quantified-self / app retention
- [JMIR 2021 systematic review (67 studies)](https://www.jmir.org/2021/9/e25171/)
- [JMIR 2024 scoping review on abandonment](https://www.jmir.org/2024/1/e56897)
- [Wearable abandonment 2019 (Sciencedirect)](https://www.sciencedirect.com/science/article/abs/pii/S0747563219303127)

### Mindfulness / app interventions
- [Walsh et al. JMIR Mental Health 2019 — RCT + ESM](https://mental.jmir.org/2019/1/e10844)
- [Brief app-based mindfulness RCT (PLOS One 2018)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0209482)

### Habit-tracker app retention
- [StriveCloud — gamification + retention](https://www.strivecloud.io/blog/habit-formation-user-retention)

### Decision journaling (Annie Duke)
- [Annie Duke — Decision making by Thinking in Bets](https://www.annieduke.com/article-decision-making-by-thinking-in-bets-annie-duke/)

### NotebookLM notebook with curated sources
- ID `f3bfb5f0-ca6f-4c8e-bae2-92c3018f7a6d` — "Daily Self-Development
  Practice — Deep Research" (19 sources covering Naikan, Pennebaker,
  Examen, Focusing, Morning Pages, Building a Second Brain, Loving-
  kindness, NVC). Use `mcp__notebooklm-mcp__notebook_query` with this
  ID to pull more depth.
- ID `fe75aa0e-f28a-4d7e-83da-5c359ae70eb6` — "JournalCoach — Reflection
  Depth + Pattern Recognition" (11 sources, queried but timed out
  during research session — retry next time).

---

## Pickup-prompt templates

Verbatim phrases the user can paste in a future session to resume:

**To re-open the whole question:**
> *"Read `docs/SESSION_HANDOFF_2026-04-25-intentions-replacement.md`.
> Let's pick up the intentions-replacement decision."*

**To pick a Family directly:**
> *"From the Family A-K list in the handoff, I want Family H. Spec the
> data model, the prompt design, and the patterns integration."*

**To build the Tier-1 Presence surface:**
> *"Build the Presence surface from the handoff. Use the spec format
> from the Phase-5 work."*

**To add Win-of-the-day to evening pulse:**
> *"Add the Tier-3 Win-of-the-day prompt from the handoff to the
> evening pulse — single text line, one tap to confirm, fed to the
> patterns engine."*

**To explore a different angle entirely:**
> *"From the handoff doc, none of A-K feel right. Help me design Family
> L."*

---

## Open code-level items not blocked by the design decisions

Things the user could have me do **independently** of picking a Family:

1. **Verify the Phase-5 letter fixes end-to-end.** Wait until 2026-06-01
   (next quarterly cron) and confirm the JSON-mode fix actually prevents
   the raw-JSON-in-letter_text bug. Could /schedule a check.
2. **Audit the Intentions tab usage data.** Currently we have no
   instrumentation showing how often the tab gets opened or how often
   any practice is started. Without this, we can't measure the impact
   of replacing it.
3. **Build a tiny Patterns roll-up for journal tags** (`#tag` mentions
   over time). This is independent of any new feature — adds value to
   existing journal data.
4. **Cron secret rotation maintenance.** `.tmp/rotate_cron_secrets.cjs`
   exists and is idempotent. Re-run every 90 d as a security practice.
5. **Decision journal as a Phase-2 add to /patterns.** Annie Duke style;
   per-decision (not daily), so doesn't conflict with the Family
   selection.

---

## End of handoff
