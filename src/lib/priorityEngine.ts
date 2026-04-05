// Priority Extraction Engine — Gemini-powered task parsing
// Takes rambling voice input, returns structured task list
// Handles amendments (add, remove, modify) to existing lists

import { callGemini, parseJsonResponse } from './geminiClient';
import type { PriorityItem } from '../stores/priorityStore';

const EXTRACT_PROMPT = `You are a task extraction assistant inside a journaling app. The user is planning their day by talking out loud.

YOUR JOB: Extract clear, actionable tasks from their rambling speech. Each task should be a concise, specific action item.

RULES:
- Extract individual tasks from the speech, no matter how scattered the input is
- Make each task concise but clear (e.g., "Call dentist to schedule cleaning" not just "dentist")
- Preserve the user's intent — don't add tasks they didn't mention
- If they mention a time or deadline, include it in the task text
- Order tasks by the sequence they were mentioned (user's natural priority)
- Ignore filler words, tangents, and non-task content
- If the speech contains no actionable tasks, return an empty array

Respond with ONLY valid JSON in this format:
{"tasks": ["task 1 text", "task 2 text", "task 3 text"]}`;

const AMEND_PROMPT = `You are a task list assistant. The user has an existing task list and wants to modify it by voice.

CURRENT TASK LIST:
{CURRENT_TASKS}

The user said something to modify this list. Apply their changes:
- If they want to ADD tasks, add them
- If they want to REMOVE tasks, remove them (match by meaning, not exact words)
- If they want to CHANGE/EDIT tasks, update the text
- If they want to REORDER, reorder them
- Keep unchanged tasks exactly as they are
- IMPORTANT: Return ONLY the plain task text. Do NOT include numbers, checkboxes, brackets, or any prefix — just the task description.

Respond with ONLY valid JSON containing the full updated list:
{"tasks": ["task 1", "task 2", "task 3"]}`;

function cleanTaskText(text: string): string {
  return text
    .replace(/^\s*\d+\.\s*/, '')
    .replace(/^\s*\[[ x]?\]\s*/i, '')
    .replace(/^\s*[-•]\s*/, '')
    .trim();
}

async function extractTasks(prompt: string): Promise<string[]> {
  const text = await callGemini('gemini-2.5-flash', prompt);
  const parsed = parseJsonResponse<{ tasks?: string[] }>(text, { tasks: [] });
  return (parsed.tasks || []).map(cleanTaskText).filter(Boolean);
}

export async function extractPriorities(speechText: string): Promise<PriorityItem[]> {
  const prompt = EXTRACT_PROMPT + `\n\nUser said:\n"${speechText}"`;
  const tasks = await extractTasks(prompt);

  return tasks.map((text, i) => ({
    id: `p_${Date.now()}_${i}`,
    text,
    completed: false,
    sort_order: i,
  }));
}

export async function amendPriorities(
  currentItems: PriorityItem[],
  speechText: string
): Promise<PriorityItem[]> {
  const currentTaskList = currentItems
    .map((item, i) => `${i + 1}. ${item.text}${item.completed ? ' (done)' : ''}`)
    .join('\n');

  const prompt =
    AMEND_PROMPT.replace('{CURRENT_TASKS}', currentTaskList) +
    `\n\nUser said:\n"${speechText}"`;

  const tasks = await extractTasks(prompt);

  return tasks.map((text, i) => {
    const cleanedText = cleanTaskText(text);
    const existing = currentItems.find(
      (item) => cleanTaskText(item.text).toLowerCase() === cleanedText.toLowerCase()
    );
    return {
      id: existing?.id || `p_${Date.now()}_${i}`,
      text: cleanedText,
      completed: existing?.completed ?? false,
      sort_order: i,
    };
  });
}
