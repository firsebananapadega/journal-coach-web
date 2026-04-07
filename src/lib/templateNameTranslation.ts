// Hardcoded template name/description translations — instant, no API call needed.
// Covers all templates from migrations 001-005.

import { getLocale } from './language';

interface TemplateTranslation {
  name: string;
  description: string;
}

// Map from English template name → Spanish translation
const TEMPLATE_TRANSLATIONS_ES: Record<string, TemplateTranslation> = {
  // Migration 001 — core templates
  'Evening Reflection': {
    name: 'Reflexión nocturna',
    description: 'Cierra tu día con tu guía. Cinco preguntas, dos minutos.',
  },
  'Morning Intention': {
    name: 'Intención matutina',
    description: 'Empieza tu día con claridad. Define tus intenciones antes de que empiece el ruido.',
  },
  'Gratitude': {
    name: 'Gratitud',
    description: 'Tres cosas por las que estás agradecido — y por qué importan.',
  },
  'Emotion Check-In': {
    name: 'Chequeo emocional',
    description: 'Nombra lo que sientes. Ese es el primer paso.',
  },
  'Brain Dump': {
    name: 'Descarga mental',
    description: 'Saca todo de tu cabeza. Sin estructura, sin juicio.',
  },
  'Weekly Review': {
    name: 'Revisión semanal',
    description: 'Una vez a la semana, aléjate un poco. Observa los patrones.',
  },
  'Goal Check-In': {
    name: 'Chequeo de metas',
    description: 'Revisa tus metas. Con honestidad, sin juicio.',
  },

  // Migration 002 — new templates
  'Daily Record': {
    name: 'Registro diario',
    description: 'Una foto completa de tu día en cinco preguntas.',
  },
  'Deep Processing': {
    name: 'Procesamiento profundo',
    description: 'Trabaja algo difícil. Hechos, sentimientos, significado.',
  },
  'Self-Discovery': {
    name: 'Autoconocimiento',
    description: 'Preguntas que revelan quién eres realmente debajo de la superficie.',
  },
  'Energy Audit': {
    name: 'Auditoría de energía',
    description: 'Rastrea qué te agota y qué te llena de energía.',
  },
  'Values Check': {
    name: 'Chequeo de valores',
    description: '¿Estás viviendo alineado con lo que más te importa?',
  },

  // Migration 004 — life transformation templates
  'Year-End Reflection': {
    name: 'Reflexión de fin de año',
    description: 'Mira atrás con honestidad y compasión — qué te formó, qué dejas ir.',
  },
  'New Year Intentions': {
    name: 'Intenciones de año nuevo',
    description: 'Diseña el año que viene — no metas que perseguir, sino la persona en quien quieres convertirte.',
  },
  'Quarterly Life Audit': {
    name: 'Auditoría de vida trimestral',
    description: 'Cada 90 días, aléjate. Verifica que estés subiendo la montaña correcta.',
  },
  'Monthly Review': {
    name: 'Revisión mensual',
    description: 'Atrapa los patrones antes de que se vuelvan rutinas. Una mirada honesta a tu mes.',
  },
  'Belief Audit': {
    name: 'Auditoría de creencias',
    description: 'Descubre las creencias invisibles que dirigen tu vida. Cuestiona las que no elegiste.',
  },
  'Old Self / New Self': {
    name: 'Viejo yo / Nuevo yo',
    description: 'Nombra lo que dejas atrás. Define en quién te estás convirtiendo.',
  },
  'Fear Setting': {
    name: 'Definición de miedos',
    description: 'Define tus miedos con precisión. Descubre que la inacción es el verdadero riesgo.',
  },
  'Shadow Work': {
    name: 'Trabajo con la sombra',
    description: 'Conoce las partes de ti que has estado escondiendo. Tienen algo que enseñarte.',
  },
  "The Story I'm Telling Myself": {
    name: 'La historia que me cuento',
    description: 'Atrapa la narrativa antes de que se convierta en verdad.',
  },
  'Finding Meaning': {
    name: 'Encontrar significado',
    description: 'Cuando la vida se siente pesada o vacía — busca significado, no felicidad.',
  },
  'Deep Expressive Writing': {
    name: 'Escritura expresiva profunda',
    description: 'El protocolo de escritura más investigado en la ciencia. 4 días, 15 min cada uno, un solo tema.',
  },
  'Gratitude Amplification': {
    name: 'Amplificación de gratitud',
    description: 'No es una lista de gratitud — es una práctica. Siéntela en el cuerpo, no solo en la mente.',
  },
  'Purpose Discovery': {
    name: 'Descubrimiento de propósito',
    description: 'Encuentra dónde se cruzan tu pasión, habilidad, necesidad y valor. El marco Ikigai.',
  },
  'Identity Check-In': {
    name: 'Chequeo de identidad',
    description: 'Tus hábitos votan por la persona en la que te conviertes. Revisa quién va ganando.',
  },
  'Stoic Evening Reflection': {
    name: 'Reflexión estoica nocturna',
    description: 'Cierra cada día como Marco Aurelio — no con juicio, sino con honestidad.',
  },

  // Migration 005
  'The 5-5-5 System': {
    name: 'El sistema 5-5-5',
    description: '15 minutos. 3 fases. Revisa tu pasado, sueña tu futuro, luego prioriza sin piedad.',
  },
};

export function getTranslatedTemplateName(
  _templateId: string,
  originalName: string,
  locale?: string
): string {
  const loc = locale || getLocale();
  if (loc === 'en') return originalName;
  return TEMPLATE_TRANSLATIONS_ES[originalName]?.name || originalName;
}

export function getTranslatedTemplateDescription(
  _templateId: string,
  originalDesc: string,
  originalName?: string,
  locale?: string
): string {
  const loc = locale || getLocale();
  if (loc === 'en') return originalDesc;
  if (originalName && TEMPLATE_TRANSLATIONS_ES[originalName]) {
    return TEMPLATE_TRANSLATIONS_ES[originalName].description;
  }
  return originalDesc;
}

// No-op — translations are hardcoded, no async work needed
export async function translateTemplateNames(
  _templates: { id: string; name: string; description: string }[]
): Promise<void> {
  // Hardcoded translations — nothing to do
}
