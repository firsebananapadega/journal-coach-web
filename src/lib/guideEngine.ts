// Guide Intelligence Engine — Gemini-powered coaching
// Uses gemini-2.5-pro for higher quality guided sessions
// Parameterized by GuidePersona — same engine, different personality per guide

import { callGemini, parseJsonResponse } from './geminiClient';
import { getTimeOfDay } from './guidanceEngine';
import { getGuideOrDefault, type GuidePersona } from './guideConfigs';

// --- Types ---

export interface GuideResponse {
  type: 'follow_up' | 'goal_suggestion';
  question: string;
  detected_goal?: string;
}

export interface GuideResult {
  response: GuideResponse;
  guideId: string;
}

export interface ConversationExchange {
  question: string;
  answer: string;
}

// --- Build conversation context for Gemini ---

function buildConversationContext(
  guide: GuidePersona,
  exchanges: ConversationExchange[],
  currentAnswer: string,
  context: {
    recentEntriesSummary?: string;
    activeGoals?: string[];
    mood?: string;
    speechIntensity?: number;
  }
): string {
  let prompt = guide.systemPrompt + '\n\n';

  prompt += `Context:\n`;
  prompt += `- Time: ${getTimeOfDay()}\n`;
  if (context.mood) prompt += `- Current mood: ${context.mood}\n`;
  if (context.activeGoals && context.activeGoals.length > 0) {
    prompt += `- Intentions they are holding: ${context.activeGoals.join(', ')}\n`;
  }
  if (context.recentEntriesSummary) {
    prompt += `- Recent journal entries (look for patterns and recurring themes): ${context.recentEntriesSummary}\n`;
    prompt += `- IMPORTANT: If you notice a theme appearing multiple times across their recent entries, name it. Connecting patterns across sessions is one of the most valuable things you can do.\n`;
  }
  if (context.speechIntensity != null && context.speechIntensity > 0.6) {
    prompt += `- Note: The user is speaking with high emotional intensity. Be especially attentive.\n`;
  }

  if (exchanges.length > 0) {
    prompt += `\nConversation so far:\n`;
    for (const ex of exchanges) {
      prompt += `${guide.name}: ${ex.question}\nUser: ${ex.answer}\n`;
    }
  }

  prompt += `\nUser's latest message:\n"${currentAnswer}"\n`;
  prompt += `\nRespond as JSON only.\n`;

  return prompt;
}

// --- Gemini call via centralized client ---

async function getGeminiFollowUp(prompt: string): Promise<GuideResponse> {
  const text = await callGemini('gemini-2.5-flash', prompt);
  const parsed = parseJsonResponse<GuideResponse>(text, { type: 'follow_up', question: text });
  return parsed;
}

// --- Main function for guided sessions ---

export async function getGuideResponse(
  currentAnswer: string,
  context: {
    guideId?: string;
    exchanges?: ConversationExchange[];
    recentEntriesSummary?: string;
    activeGoals?: string[];
    mood?: string;
    speechIntensity?: number;
  } = {}
): Promise<GuideResult> {
  const guide = getGuideOrDefault(context.guideId);

  const prompt = buildConversationContext(
    guide,
    context.exchanges || [],
    currentAnswer,
    {
      recentEntriesSummary: context.recentEntriesSummary,
      activeGoals: context.activeGoals,
      mood: context.mood,
      speechIntensity: context.speechIntensity,
    }
  );

  const response = await getGeminiFollowUp(prompt);
  return { response, guideId: guide.id };
}

// --- Simpler function for voice entry one-shot follow-up ---

export async function getGuideVoiceFollowUp(
  transcriptText: string,
  context: {
    guideId?: string;
    recentEntriesSummary?: string;
    activeGoals?: string[];
    mood?: string;
    speechIntensity?: number;
  } = {}
): Promise<GuideResult> {
  const guide = getGuideOrDefault(context.guideId);

  const prompt = buildConversationContext(guide, [], transcriptText, context);

  const response = await getGeminiFollowUp(prompt);
  return { response, guideId: guide.id };
}

// Re-export useful functions from guidanceEngine
export { getOpeningQuestion, getGuidedSessionOpening, getClosingMessage, getTimeOfDay } from './guidanceEngine';
