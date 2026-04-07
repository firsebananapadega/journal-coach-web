// Template question translation — translates Supabase template content
// Uses Gemini for translation with aggressive localStorage caching
// so each template is only translated once per language.

import { callGemini, parseJsonResponse } from './geminiClient';
import { getLocale } from './language';

interface TemplateQuestion {
  id: string;
  question_text: string;
  input_type: string;
  placeholder: string;
}

interface TranslatedTemplate {
  name: string;
  description: string;
  questions: TemplateQuestion[];
}

const CACHE_PREFIX = 'tmpl_translation_';

function getCacheKey(templateId: string, locale: string): string {
  return `${CACHE_PREFIX}${locale}_${templateId}`;
}

function getCached(templateId: string, locale: string): TranslatedTemplate | null {
  try {
    const raw = localStorage.getItem(getCacheKey(templateId, locale));
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function setCache(templateId: string, locale: string, data: TranslatedTemplate): void {
  try {
    localStorage.setItem(getCacheKey(templateId, locale), JSON.stringify(data));
  } catch {}
}

export async function translateTemplate(
  templateId: string,
  name: string,
  description: string,
  questions: TemplateQuestion[]
): Promise<TranslatedTemplate> {
  const locale = getLocale();

  // No translation needed for English
  if (locale === 'en') {
    return { name, description, questions };
  }

  // Check cache first
  const cached = getCached(templateId, locale);
  if (cached && cached.questions.length === questions.length) {
    return cached;
  }

  // Build translation prompt
  const questionsData = questions.map((q) => ({
    id: q.id,
    question_text: q.question_text,
    placeholder: q.placeholder,
    input_type: q.input_type,
  }));

  const prompt = `Translate the following journaling template content from English to Mexican Spanish (español mexicano).

Use "tú" form. Be warm and natural. Never use Spain Spanish vocabulary (no "vale", "mola", "vosotros", "coger").
Keep inverted punctuation (¿ and ¡). Translate the MEANING, not word-for-word.

Template name: "${name}"
Template description: "${description}"

Questions:
${JSON.stringify(questionsData, null, 2)}

Return ONLY valid JSON in this exact format:
{
  "name": "translated name",
  "description": "translated description",
  "questions": [
    {"id": "original_id", "question_text": "translated question", "placeholder": "translated placeholder"}
  ]
}

Keep the "id" field exactly as-is. Keep "input_type" exactly as-is. If a placeholder is empty string "", keep it empty.
Return ONLY the JSON, nothing else.`;

  try {
    const text = await callGemini('gemini-2.0-flash', prompt, 15000);
    const parsed = parseJsonResponse<TranslatedTemplate>(text, { name, description, questions });

    // Validate parsed result has the right structure
    if (parsed.name && parsed.questions && parsed.questions.length === questions.length) {
      // Merge back input_type from originals (translation might have dropped it)
      const mergedQuestions = parsed.questions.map((q, i) => ({
        ...questions[i],
        question_text: q.question_text || questions[i].question_text,
        placeholder: q.placeholder ?? questions[i].placeholder,
      }));

      const result: TranslatedTemplate = {
        name: parsed.name,
        description: parsed.description || description,
        questions: mergedQuestions,
      };

      // Cache for future use
      setCache(templateId, locale, result);
      return result;
    }
  } catch {
    // Translation failed — fall back to English
  }

  return { name, description, questions };
}
