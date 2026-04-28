// Guided micro-practices for intentions on the Patterns tab. Each
// practice is a sequence of short auto-advancing steps the user can
// follow without touching the screen. Designed to be ~2 minutes,
// tap-and-walk-away — the whole point is to NOT scroll while doing it.
//
// Step durations were trimmed ~25% from a longer first pass; people
// hit impatience with anything noticeably over two minutes.
//
// Each practice carries a `category` so the player can pick a matching
// visual style (presence = pulsing circle, body = drifting wave, etc.).
// Steps optionally carry a `breathCycle` so the visual breathes in
// rhythm with cues like "inhale" / "exhale longer."
//
// Practices are grounded in documented traditions:
//   - Presence: 5-4-3-2-1 grounding, mindful breath
//   - Body: Gendlin's Focusing (felt sense)
//   - Mind: NVC observation→feeling→need + Pennebaker cognitive turn
//   - Connection: Metta (loving-kindness)
//   - Growth: Lectio Divina + Building a Second Brain (distillation)
//   - Purpose: Naikan + Ignatian Examen
//
// Slugs derived as `lowercase-hyphen-separated-of-title`.

import type { IntentionCategory } from './presetIntentions';

export interface BreathCycle {
  inhaleSec: number;
  holdSec?: number;
  exhaleSec: number;
}

export interface PracticeStep {
  text: string;
  durationSec: number;
  // When set, the visual scales/breathes on this rhythm. Used for
  // steps that explicitly cue inhale/exhale so the user can sync.
  breathCycle?: BreathCycle;
}

export interface IntentionPractice {
  // Must match the title of a preset intention exactly so lookup works.
  intentionTitle: string;
  // URL-safe identifier (e.g. 'invite-more-stillness'). Used by the
  // /practice/[slug] route.
  slug: string;
  category: IntentionCategory;
  totalSec: number;
  steps: PracticeStep[];
}

const breath = (i: number, h: number, e: number): BreathCycle => ({
  inhaleSec: i,
  holdSec: h,
  exhaleSec: e,
});

export const INTENTION_PRACTICES: IntentionPractice[] = [
  // ─── Presence ────────────────────────────────────────────────────
  {
    intentionTitle: 'Be more present in my daily life',
    slug: 'be-more-present-in-my-daily-life',
    category: 'presence',
    totalSec: 135,
    steps: [
      { text: 'Pause whatever you’re doing. Take three slow breaths.', durationSec: 15, breathCycle: breath(4, 0, 6) },
      { text: 'Look around. Quietly name 5 things you can see.', durationSec: 25 },
      { text: 'Listen. Name 4 things you can hear.', durationSec: 25 },
      { text: 'Notice your body. 3 things you can feel.', durationSec: 25 },
      { text: 'Take a breath in. 2 scents you can notice.', durationSec: 20 },
      { text: 'Notice 1 taste in your mouth.', durationSec: 15 },
      { text: 'You are here. You are awake. Carry this with you.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Invite more stillness',
    slug: 'invite-more-stillness',
    category: 'presence',
    totalSec: 205,
    steps: [
      { text: 'Find a comfortable seat. Let your shoulders soften.', durationSec: 10 },
      { text: 'Take three slow breaths. Inhale through your nose. Exhale a little longer than you inhale.', durationSec: 35, breathCycle: breath(4, 1, 6) },
      { text: "Notice where your body is holding tension. Don't force it to leave — just see it.", durationSec: 45 },
      { text: 'Without naming them, listen. Let sounds come and go.', durationSec: 45 },
      { text: 'When a thought arrives, see it. Let it pass like a cloud.', durationSec: 45 },
      { text: 'Notice how your body feels now. Carry this stillness with you.', durationSec: 25 },
    ],
  },
  {
    intentionTitle: 'Slow down when I feel rushed',
    slug: 'slow-down-when-i-feel-rushed',
    category: 'presence',
    totalSec: 120,
    steps: [
      { text: 'Pause where you are. Drop your shoulders.', durationSec: 10 },
      { text: 'One slow breath. Inhale. Long exhale.', durationSec: 10, breathCycle: breath(4, 1, 6) },
      { text: 'Another slow breath. Inhale. Long exhale.', durationSec: 10, breathCycle: breath(4, 1, 6) },
      { text: 'One more. Inhale. Long exhale.', durationSec: 10, breathCycle: breath(4, 1, 6) },
      { text: 'Ask yourself: what is the actual rush?', durationSec: 35 },
      { text: 'Notice — the urgency lives in your body, not the world.', durationSec: 35 },
      { text: 'Carry this slower pace into the next thing.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Be kinder to myself',
    slug: 'be-kinder-to-myself',
    category: 'presence',
    totalSec: 145,
    steps: [
      { text: 'Place a hand on your heart. Feel it rise and fall with breath.', durationSec: 15, breathCycle: breath(4, 0, 6) },
      { text: 'Picture yourself, exactly as you are right now.', durationSec: 25 },
      { text: 'Silently offer: "May I be safe."', durationSec: 25 },
      { text: '"May I be healthy and strong."', durationSec: 25 },
      { text: '"May I be at peace with myself."', durationSec: 30 },
      { text: 'Notice — you would offer this to a friend without hesitation.', durationSec: 25 },
    ],
  },

  // ─── Body ────────────────────────────────────────────────────────
  {
    intentionTitle: 'Invite more movement into my day',
    slug: 'invite-more-movement-into-my-day',
    category: 'body',
    totalSec: 120,
    steps: [
      { text: 'Stand up if you are sitting. Sitting is fine too — just notice.', durationSec: 15 },
      { text: 'Roll your shoulders backward, slowly. Three times.', durationSec: 25 },
      { text: 'Reach overhead. Take up a little more space.', durationSec: 15 },
      { text: 'Let your body sway side to side, gently.', durationSec: 25 },
      { text: 'Notice what your body wants more of.', durationSec: 30 },
      { text: 'Promise yourself two minutes of that today.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Nourish my body with care',
    slug: 'nourish-my-body-with-care',
    category: 'body',
    totalSec: 145,
    steps: [
      { text: 'Pause before your next bite. Notice your hunger — true hunger or habit?', durationSec: 25 },
      { text: 'Look at what you are about to eat. Really look.', durationSec: 25 },
      { text: 'Notice the colors. The texture. Where it came from.', durationSec: 30 },
      { text: 'Take one slow breath before the first bite.', durationSec: 10, breathCycle: breath(4, 1, 6) },
      { text: 'The first three bites: chew slowly. Taste.', durationSec: 45 },
      { text: 'Eating is an act of care, not refueling.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Prioritize rest and recovery',
    slug: 'prioritize-rest-and-recovery',
    category: 'body',
    totalSec: 125,
    steps: [
      { text: 'Soften your jaw. Soften your eyes.', durationSec: 15 },
      { text: 'Let your tongue rest at the bottom of your mouth.', durationSec: 10 },
      { text: 'Three slow breaths. Each exhale a little longer.', durationSec: 35, breathCycle: breath(4, 0, 7) },
      { text: 'Sleep is not laziness. It is your foundation.', durationSec: 25 },
      { text: 'What is one small thing you can do tonight to rest better?', durationSec: 30 },
      { text: 'Carry the answer with you.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Listen to what my body is telling me',
    slug: 'listen-to-what-my-body-is-telling-me',
    category: 'body',
    totalSec: 155,
    steps: [
      { text: 'Close your eyes if you can. Bring attention inside your body.', durationSec: 15 },
      { text: 'Scan: throat, chest, stomach. Where is something pulling for attention?', durationSec: 35 },
      { text: 'Don’t name it yet. Just feel the shape of it.', durationSec: 35 },
      { text: 'Now ask: what is this? And wait.', durationSec: 35 },
      { text: 'If a word arrives — sit with it.', durationSec: 25 },
      { text: 'Whatever you found, your body has been telling you.', durationSec: 10 },
    ],
  },

  // ─── Mind ────────────────────────────────────────────────────────
  {
    intentionTitle: 'Understand my own patterns',
    slug: 'understand-my-own-patterns',
    category: 'mind',
    totalSec: 120,
    steps: [
      { text: 'Bring to mind one repeating frustration in your life.', durationSec: 25 },
      { text: 'Don’t analyze. Just see it clearly.', durationSec: 25 },
      { text: 'Notice — what do you usually do in response?', durationSec: 30 },
      { text: 'What is the cost of doing what you usually do?', durationSec: 30 },
      { text: 'There is space between trigger and response. You just found it.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Challenge thoughts that hold me back',
    slug: 'challenge-thoughts-that-hold-me-back',
    category: 'mind',
    totalSec: 155,
    steps: [
      { text: 'Bring up one thought you have been believing about yourself.', durationSec: 25 },
      { text: 'State it as observation, not judgment. "I think X" — not "X is true."', durationSec: 30 },
      { text: 'Underneath the thought — what feeling is here?', durationSec: 25 },
      { text: 'Underneath the feeling — what need is unmet?', durationSec: 30 },
      { text: 'Reframe: "I realize I think this because my need for ___ is not met."', durationSec: 35 },
      { text: 'The thought is a signal, not a verdict.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Build a daily reflection practice',
    slug: 'build-a-daily-reflection-practice',
    category: 'mind',
    totalSec: 120,
    steps: [
      { text: 'Take three slow breaths. Settle into this moment.', durationSec: 25, breathCycle: breath(4, 1, 6) },
      { text: 'Recall one moment from today that mattered.', durationSec: 30 },
      { text: 'What were you feeling in that moment?', durationSec: 30 },
      { text: 'What were you really needing?', durationSec: 25 },
      { text: 'Carry one tiny insight into tomorrow.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Cultivate gratitude',
    slug: 'cultivate-gratitude',
    category: 'mind',
    totalSec: 135,
    steps: [
      { text: 'Bring to mind the last 24 hours.', durationSec: 15 },
      { text: 'What is one tiny thing you received today?', durationSec: 30 },
      { text: 'Notice the effort someone (or something) made for that.', durationSec: 30 },
      { text: 'What did you give in return? Be specific.', durationSec: 25 },
      { text: 'The world has been holding you up. Let yourself feel that.', durationSec: 25 },
      { text: 'Carry this with you.', durationSec: 10 },
    ],
  },

  // ─── Connection ──────────────────────────────────────────────────
  {
    intentionTitle: 'Be more present with the people I love',
    slug: 'be-more-present-with-the-people-i-love',
    category: 'connection',
    totalSec: 140,
    steps: [
      { text: 'Picture someone you love. See their face.', durationSec: 25 },
      { text: 'Silently offer: "May you be safe."', durationSec: 25 },
      { text: '"May you be healthy and strong."', durationSec: 25 },
      { text: '"May you be truly happy."', durationSec: 25 },
      { text: 'Notice the warmth this brings to your own body.', durationSec: 30 },
      { text: 'They will feel this even if you say nothing.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Nurture one relationship more deeply',
    slug: 'nurture-one-relationship-more-deeply',
    category: 'connection',
    totalSec: 120,
    steps: [
      { text: 'Pick one person you’ve been meaning to reach out to.', durationSec: 25 },
      { text: 'Picture them. What’s been on their mind lately?', durationSec: 30 },
      { text: 'Imagine sending them one specific message.', durationSec: 30 },
      { text: 'Notice what message wants to be sent.', durationSec: 25 },
      { text: 'Promise: you will send it within the hour.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Listen more, fix less',
    slug: 'listen-more-fix-less',
    category: 'connection',
    totalSec: 120,
    steps: [
      { text: 'Bring to mind your last conversation with someone close.', durationSec: 25 },
      { text: 'What did they actually say? Not what you replied.', durationSec: 30 },
      { text: 'What was the feeling underneath their words?', durationSec: 30 },
      { text: 'Notice — sometimes people need to be heard, not helped.', durationSec: 25 },
      { text: 'Next conversation: just listen. Hands off the fix.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Express what I feel',
    slug: 'express-what-i-feel',
    category: 'connection',
    totalSec: 140,
    steps: [
      { text: 'Bring up one feeling you have been holding back.', durationSec: 25 },
      { text: 'Name it. Don’t soften it.', durationSec: 25 },
      { text: 'What’s the need underneath?', durationSec: 30 },
      { text: 'Imagine saying out loud: "I feel ___ because I need ___."', durationSec: 35 },
      { text: 'Honesty is not a weapon. It’s a bridge.', durationSec: 25 },
    ],
  },

  // ─── Growth ──────────────────────────────────────────────────────
  {
    intentionTitle: 'Read something meaningful every day',
    slug: 'read-something-meaningful-every-day',
    category: 'growth',
    totalSec: 115,
    steps: [
      { text: 'Bring to mind one phrase from something you have read recently.', durationSec: 25 },
      { text: 'Repeat the phrase slowly to yourself.', durationSec: 25 },
      { text: 'Repeat it again. Don’t analyze. Just listen.', durationSec: 25 },
      { text: 'What does it want to teach you today?', durationSec: 30 },
      { text: 'Carry the phrase with you.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Learn something new',
    slug: 'learn-something-new',
    category: 'growth',
    totalSec: 95,
    steps: [
      { text: 'Recall one thing you learned today.', durationSec: 25 },
      { text: 'What is the essence — three words?', durationSec: 30 },
      { text: 'Imagine writing it as a note to your future self.', durationSec: 30 },
      { text: 'The smallest summary is the most useful one.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Spend less time consuming, more creating',
    slug: 'spend-less-time-consuming-more-creating',
    category: 'growth',
    totalSec: 115,
    steps: [
      { text: 'Notice your hands. They are tools for making, not just scrolling.', durationSec: 25 },
      { text: 'Bring to mind one tiny thing you could create today.', durationSec: 30 },
      { text: 'Smaller than you think. A sentence. A sketch. A song hum.', durationSec: 25 },
      { text: 'Picture yourself doing it for ten minutes.', durationSec: 25 },
      { text: 'Promise: ten minutes today. That’s it.', durationSec: 10 },
    ],
  },
  {
    intentionTitle: 'Clarify what I truly value',
    slug: 'clarify-what-i-truly-value',
    category: 'growth',
    totalSec: 155,
    steps: [
      { text: 'Bring up one decision you made today.', durationSec: 25 },
      { text: 'Was it pulling you toward what matters most?', durationSec: 35 },
      { text: 'Or was it pulling you away?', durationSec: 25 },
      { text: 'No judgment — just notice.', durationSec: 25 },
      { text: 'What is one decision tomorrow you can make differently?', durationSec: 35 },
      { text: 'Hold the answer lightly.', durationSec: 10 },
    ],
  },

  // ─── Purpose ─────────────────────────────────────────────────────
  {
    intentionTitle: 'Do work that matters to me',
    slug: 'do-work-that-matters-to-me',
    category: 'purpose',
    totalSec: 130,
    steps: [
      { text: 'Bring to mind the work you’ll do today (or did).', durationSec: 25 },
      { text: 'Which part — even 10% — felt meaningful?', durationSec: 35 },
      { text: 'What was different about that part?', durationSec: 30 },
      { text: 'Tomorrow, can you do a little more of that?', durationSec: 25 },
      { text: 'Meaning is rarely loud. It’s the quiet pull underneath.', durationSec: 15 },
    ],
  },
  {
    intentionTitle: 'Lead with kindness',
    slug: 'lead-with-kindness',
    category: 'purpose',
    totalSec: 115,
    steps: [
      { text: 'Bring to mind one person you’ll see today.', durationSec: 15 },
      { text: 'What is one specific thing they did recently that you appreciated?', durationSec: 35 },
      { text: 'Imagine telling them — by name.', durationSec: 25 },
      { text: 'Promise yourself you will say it out loud today.', durationSec: 25 },
      { text: 'One specific recognition is worth a hundred general ones.', durationSec: 15 },
    ],
  },
  {
    intentionTitle: 'Build long-term security',
    slug: 'build-long-term-security',
    category: 'purpose',
    totalSec: 130,
    steps: [
      { text: 'Picture yourself five years from now.', durationSec: 25 },
      { text: 'What would they want you to choose today?', durationSec: 30 },
      { text: 'Something small. A ten-dollar choice. A no instead of a yes.', durationSec: 30 },
      { text: 'Picture yourself making that one choice.', durationSec: 25 },
      { text: 'Tiny consistency compounds into freedom.', durationSec: 20 },
    ],
  },
];

export function getPracticeFor(intentionTitle: string): IntentionPractice | null {
  return (
    INTENTION_PRACTICES.find((p) => p.intentionTitle === intentionTitle) ?? null
  );
}

export function getPracticeBySlug(slug: string): IntentionPractice | null {
  return INTENTION_PRACTICES.find((p) => p.slug === slug) ?? null;
}
