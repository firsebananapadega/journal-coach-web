// Ben's Guidance Engine — Rule-based, zero cost, works offline
//
// How it works:
// 1. User writes or speaks a journal entry
// 2. Engine scans entry text for keyword triggers
// 3. Matches to the best question bank (most trigger hits)
// 4. Filters out questions shown in the last 14 days
// 5. Returns a follow-up question in Ben's voice
//
// No AI API is called. Ever. This is deterministic and local.

import { questionBanks, bodhiQuestionBanks, QuestionBank } from './questionBanks';

export interface GuidanceResult {
  question: string;
  bankId: string;
  questionIndex: number;
  source: string;
}

export interface RecentQuestion {
  bankId: string;
  questionIndex: number;
}

/**
 * Get a follow-up question from Ben based on the user's entry text.
 *
 * @param entryText - The user's journal entry (transcription or typed text)
 * @param options - Optional: mood, time of day, recent questions to avoid
 * @returns A GuidanceResult with the question and metadata, or null if no match
 */
export function getFollowUpQuestion(
  entryText: string,
  options?: {
    mood?: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
    recentQuestions?: RecentQuestion[];
    guideId?: string;
  }
): GuidanceResult {
  const textLower = entryText.toLowerCase();

  // Use guide-specific banks when available
  const banks = options?.guideId === 'bodhi' ? bodhiQuestionBanks : questionBanks;

  // Score each bank by number of trigger keyword matches
  const scored = banks
    .filter((bank) => bank.triggers.length > 0) // exclude fallback
    .map((bank) => ({
      bank,
      score: bank.triggers.filter((trigger) => textLower.includes(trigger)).length,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  // If mood is provided, boost mood-related banks
  if (options?.mood) {
    const defaultMoodMap: Record<string, string[]> = {
      great: ['happiness', 'wins', 'gratitude-deepen'],
      good: ['happiness', 'gratitude-deepen', 'productivity'],
      okay: ['general-reflection'],
      low: ['sadness', 'self-compassion'],
      tough: ['sadness', 'anxiety', 'self-compassion'],
    };
    const bodhiMoodMap: Record<string, string[]> = {
      great: ['bodhi-general'],
      good: ['bodhi-general'],
      okay: ['bodhi-general', 'bodhi-meaning'],
      low: ['bodhi-sadness', 'bodhi-meaning'],
      tough: ['bodhi-sadness', 'bodhi-anxiety'],
    };
    const moodBankMap = options?.guideId === 'bodhi' ? bodhiMoodMap : defaultMoodMap;
    const boostIds = moodBankMap[options.mood] || [];
    for (const item of scored) {
      if (boostIds.includes(item.bank.id)) {
        item.score += 1;
      }
    }
    scored.sort((a, b) => b.score - a.score);
  }

  // Pick the best matching bank, or fall back to time-of-day or general
  // For Bodhi, fallback to bodhi-general; for others, use time-of-day or general-reflection
  const fallbackId = options?.guideId === 'bodhi' ? 'bodhi-general' : 'general-reflection';
  let selectedBank: QuestionBank;
  if (scored.length > 0) {
    selectedBank = scored[0].bank;
  } else if (options?.guideId !== 'bodhi' && options?.timeOfDay === 'morning') {
    selectedBank = questionBanks.find((b) => b.id === 'morning-general')!;
  } else if (options?.guideId !== 'bodhi' && options?.timeOfDay === 'evening') {
    selectedBank = questionBanks.find((b) => b.id === 'evening-general')!;
  } else {
    selectedBank = banks.find((b) => b.id === fallbackId) || banks[banks.length - 1];
  }

  // Filter out recently shown questions
  const recentSet = new Set(
    (options?.recentQuestions || [])
      .filter((rq) => rq.bankId === selectedBank.id)
      .map((rq) => rq.questionIndex)
  );

  const availableIndices = selectedBank.questions
    .map((_, i) => i)
    .filter((i) => !recentSet.has(i));

  // If all questions in this bank have been seen, reset and use any
  const pool = availableIndices.length > 0
    ? availableIndices
    : selectedBank.questions.map((_, i) => i);

  const selectedIndex = pool[Math.floor(Math.random() * pool.length)];

  return {
    question: selectedBank.questions[selectedIndex],
    bankId: selectedBank.id,
    questionIndex: selectedIndex,
    source: selectedBank.source,
  };
}

/**
 * Get Ben's opening question based on time of day and user context.
 * Used when the user starts a new voice entry or guided session.
 */
export function getOpeningQuestion(options?: {
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
  userName?: string;
  daysSinceLastEntry?: number;
}): string {
  const name = options?.userName;

  // If they've been away, welcome them back warmly
  if (options?.daysSinceLastEntry && options.daysSinceLastEntry >= 2) {
    const welcomeBack = [
      `Good to see you${name ? ', ' + name : ''}. What's been on your mind?`,
      `Hey${name ? ' ' + name : ''}. It's been a few days — no worries. What's going on?`,
      `Welcome back${name ? ', ' + name : ''}. What would you like to talk about?`,
    ];
    return welcomeBack[Math.floor(Math.random() * welcomeBack.length)];
  }

  // Time-of-day greetings
  switch (options?.timeOfDay) {
    case 'morning':
      return `Morning${name ? ', ' + name : ''}. What's the one thing on your mind going into today?`;
    case 'evening':
      return `Hey${name ? ' ' + name : ''}. What happened today that's worth talking about?`;
    default:
      return `Hey${name ? ' ' + name : ''}. What's on your mind?`;
  }
}

/**
 * Get Ben's guided session opening — warmer and more intentional than voice/home greetings.
 * Ben as a wise, grounded guide welcoming you into a reflective space.
 */
export function getGuidedSessionOpening(options?: {
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
  userName?: string;
  daysSinceLastEntry?: number;
}): string {
  const name = options?.userName;

  if (options?.daysSinceLastEntry && options.daysSinceLastEntry >= 3) {
    const welcomeBack = [
      `Welcome back${name ? ', ' + name : ''}. It takes something to show up again after a pause. What brought you here today?`,
      `Good to have you back${name ? ', ' + name : ''}. No judgment about the gap — you're here now. What's been sitting with you?`,
    ];
    return welcomeBack[Math.floor(Math.random() * welcomeBack.length)];
  }

  const greetings: Record<string, string[]> = {
    morning: [
      `Morning${name ? ', ' + name : ''}. Before the day pulls you in a hundred directions — what's the one thing that feels most important right now?`,
      `Good morning${name ? ', ' + name : ''}. Let's start with what's alive in you today. What are you carrying into this day?`,
    ],
    afternoon: [
      `Hey${name ? ' ' + name : ''}. You're in the middle of your day. Let's slow down for a moment — what's been on your mind?`,
      `Afternoon${name ? ', ' + name : ''}. Half the day is behind you. What's worth reflecting on so far?`,
    ],
    evening: [
      `Evening${name ? ', ' + name : ''}. The day is winding down. What stayed with you today — the thing you're still thinking about?`,
      `Hey${name ? ' ' + name : ''}. Before you close out the day, let's look at it together. What stood out?`,
    ],
  };

  const pool = greetings[options?.timeOfDay || 'evening'] || greetings.evening;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Get Ben's closing message after a journal entry is saved.
 */
export function getClosingMessage(entryType: 'voice' | 'template' | 'guided' | 'freeform'): string {
  const closings: Record<string, string[]> = {
    voice: [
      'Got it. Thanks for sharing that.',
      'Heard. See you next time.',
      'Nice — talking it out always helps.',
    ],
    template: [
      'Nice reflection. See you tomorrow.',
      'Good stuff. That\'s today covered.',
      'All saved. Take it easy.',
    ],
    guided: [
      'Thanks for going deeper on that. It matters.',
      'Good session. You covered a lot.',
      'Appreciate you being honest. That takes something.',
    ],
    freeform: [
      'Got it all out? Sometimes that\'s all you need.',
      'Saved. Writing it down makes it lighter.',
      'Done. That\'s yours now.',
    ],
  };

  const options = closings[entryType] || closings.freeform;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Determine the current time of day based on the hour.
 */
export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
