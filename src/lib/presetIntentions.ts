import { getLocale, type Locale } from './language';

// Preset intentions — invitation-based, identity-focused
// Not outcome goals ("exercise 4x/week") but directions to hold ("invite more movement")
// Rooted in self-awareness research: change comes from identity, not checklists

export type IntentionCategory = 'presence' | 'body' | 'mind' | 'connection' | 'growth' | 'purpose';

export interface PresetIntention {
  title: string;
  description: string;
  icon: string;
  category: IntentionCategory;
  dailyHabit?: string; // optional small habit to link
}

export const INTENTION_CATEGORIES: { key: IntentionCategory; label: string }[] = [
  { key: 'presence', label: 'Presence' },
  { key: 'body', label: 'Body' },
  { key: 'mind', label: 'Mind' },
  { key: 'connection', label: 'Connection' },
  { key: 'growth', label: 'Growth' },
  { key: 'purpose', label: 'Purpose' },
];

export const PRESET_INTENTIONS: PresetIntention[] = [
  // Presence
  { title: 'Be more present in my daily life', description: 'Notice the moments instead of rushing through them.', icon: '🌿', category: 'presence', dailyHabit: 'Put my phone away during meals' },
  { title: 'Invite more stillness', description: 'Create space for quiet, even when life is loud.', icon: '🧘', category: 'presence', dailyHabit: 'Sit in silence for 5 minutes each morning' },
  { title: 'Slow down when I feel rushed', description: 'Rushing is a habit. Presence is a choice.', icon: '🐢', category: 'presence', dailyHabit: 'Take 3 deep breaths before starting any task' },
  { title: 'Be kinder to myself', description: 'Speak to myself the way I would speak to someone I love.', icon: '💛', category: 'presence', dailyHabit: 'When I catch self-criticism, rewrite it with compassion' },

  // Body
  { title: 'Invite more movement into my day', description: 'Not a fitness plan — just a relationship with my body.', icon: '🏃', category: 'body', dailyHabit: 'Move my body for at least 10 minutes' },
  { title: 'Nourish my body with care', description: 'Eating as an act of respect, not restriction.', icon: '🥗', category: 'body', dailyHabit: 'Choose one meal today where I eat slowly and mindfully' },
  { title: 'Prioritize rest and recovery', description: 'Sleep is not laziness. It is the foundation of everything.', icon: '🌙', category: 'body', dailyHabit: 'Screens off and lights dim by 9 PM' },
  { title: 'Listen to what my body is telling me', description: 'Tension, fatigue, energy — my body speaks before my mind does.', icon: '👂', category: 'body', dailyHabit: 'Check in with my body once in the afternoon' },

  // Mind
  { title: 'Understand my own patterns', description: 'See the circuits in my thinking — the triggers, the loops, the defaults.', icon: '🧠', category: 'mind', dailyHabit: 'Journal about one pattern I noticed today' },
  { title: 'Challenge thoughts that hold me back', description: 'Not every thought is true. Some are just old habits.', icon: '💭', category: 'mind', dailyHabit: 'Write down one limiting belief and question it' },
  { title: 'Build a daily reflection practice', description: 'The unexamined life is not worth living. — Socrates', icon: '📝', category: 'mind', dailyHabit: 'Open this app and reflect for 10 minutes' },
  { title: 'Cultivate gratitude', description: 'Train my brain to see what is here, not what is missing.', icon: '🙏', category: 'mind', dailyHabit: 'Name 3 specific things I am grateful for' },

  // Connection
  { title: 'Be more present with the people I love', description: 'Presence is the greatest gift I can give.', icon: '👨‍👩‍👧', category: 'connection', dailyHabit: 'Phone in another room during quality time' },
  { title: 'Nurture one relationship more deeply', description: 'Depth over breadth. Invest in the people who matter most.', icon: '❤️', category: 'connection', dailyHabit: 'Send one thoughtful message to someone I care about' },
  { title: 'Listen more, fix less', description: 'Sometimes people need to be heard, not helped.', icon: '🤝', category: 'connection', dailyHabit: 'In my next conversation, listen fully before responding' },
  { title: 'Express what I feel', description: 'Holding it in doesn\'t protect anyone. Honesty builds trust.', icon: '💬', category: 'connection', dailyHabit: 'Share one honest feeling with someone today' },

  // Growth
  { title: 'Read something meaningful every day', description: 'Feed the mind the way I feed the body.', icon: '📖', category: 'growth', dailyHabit: 'Read for at least 10 minutes' },
  { title: 'Learn something new', description: 'Stay curious. Growth is the antidote to stagnation.', icon: '🎯', category: 'growth', dailyHabit: 'Spend 15 minutes learning a skill' },
  { title: 'Spend less time consuming, more creating', description: 'Scrolling fills time. Creating fills the soul.', icon: '📵', category: 'growth', dailyHabit: 'Replace 30 minutes of scrolling with creating something' },
  { title: 'Clarify what I truly value', description: 'When I know my values, decisions make themselves.', icon: '🧭', category: 'growth', dailyHabit: 'Ask myself: does this align with what matters most to me?' },

  // Purpose
  { title: 'Do work that matters to me', description: 'Not just productive — meaningful.', icon: '⚡', category: 'purpose', dailyHabit: 'Start each day with the one task that matters most' },
  { title: 'Lead with kindness', description: 'Every interaction is a chance to lift someone up.', icon: '👏', category: 'purpose', dailyHabit: 'Recognize one person for something specific they did' },
  { title: 'Build long-term security', description: 'Small, consistent choices compound into freedom.', icon: '💰', category: 'purpose', dailyHabit: 'Make one financial choice that serves my future self' },
  { title: 'Leave things better than I found them', description: 'A life of contribution, not just consumption.', icon: '🌱', category: 'purpose', dailyHabit: 'Do one thing today that helps someone without expecting anything back' },
];

const INTENTION_CATEGORIES_ES: { key: IntentionCategory; label: string }[] = [
  { key: 'presence', label: 'Presencia' },
  { key: 'body', label: 'Cuerpo' },
  { key: 'mind', label: 'Mente' },
  { key: 'connection', label: 'Conexión' },
  { key: 'growth', label: 'Crecimiento' },
  { key: 'purpose', label: 'Propósito' },
];

const PRESET_INTENTIONS_ES: PresetIntention[] = [
  // Presencia
  { title: 'Estar más presente en mi vida diaria', description: 'Notar los momentos en vez de pasar corriendo por ellos.', icon: '🌿', category: 'presence', dailyHabit: 'Guardar el celular durante las comidas' },
  { title: 'Invitar más quietud', description: 'Crear espacio para el silencio, incluso cuando la vida hace ruido.', icon: '🧘', category: 'presence', dailyHabit: 'Sentarme en silencio 5 minutos cada mañana' },
  { title: 'Ir más despacio cuando me siento apurado', description: 'La prisa es un hábito. La presencia es una elección.', icon: '🐢', category: 'presence', dailyHabit: 'Tomar 3 respiraciones profundas antes de empezar cualquier tarea' },
  { title: 'Ser más amable conmigo mismo', description: 'Hablarme como le hablaría a alguien que quiero.', icon: '💛', category: 'presence', dailyHabit: 'Cuando me cache criticándome, reescribirlo con compasión' },

  // Cuerpo
  { title: 'Invitar más movimiento a mi día', description: 'No es un plan de ejercicio — es una relación con mi cuerpo.', icon: '🏃', category: 'body', dailyHabit: 'Mover mi cuerpo al menos 10 minutos' },
  { title: 'Nutrir mi cuerpo con cuidado', description: 'Comer como acto de respeto, no de restricción.', icon: '🥗', category: 'body', dailyHabit: 'Elegir una comida hoy donde coma despacio y con atención' },
  { title: 'Priorizar el descanso y la recuperación', description: 'Dormir no es flojera. Es la base de todo.', icon: '🌙', category: 'body', dailyHabit: 'Pantallas apagadas y luces bajas a las 9 PM' },
  { title: 'Escuchar lo que mi cuerpo me dice', description: 'Tensión, cansancio, energía — mi cuerpo habla antes que mi mente.', icon: '👂', category: 'body', dailyHabit: 'Hacer un chequeo con mi cuerpo una vez en la tarde' },

  // Mente
  { title: 'Entender mis propios patrones', description: 'Ver los circuitos en mi forma de pensar — los detonantes, los ciclos, los hábitos.', icon: '🧠', category: 'mind', dailyHabit: 'Escribir sobre un patrón que noté hoy' },
  { title: 'Cuestionar los pensamientos que me frenan', description: 'No todos los pensamientos son verdad. Algunos son solo viejos hábitos.', icon: '💭', category: 'mind', dailyHabit: 'Escribir una creencia limitante y cuestionarla' },
  { title: 'Construir una práctica diaria de reflexión', description: 'Una vida sin examinar no vale la pena vivirla. — Sócrates', icon: '📝', category: 'mind', dailyHabit: 'Abrir esta app y reflexionar 10 minutos' },
  { title: 'Cultivar la gratitud', description: 'Entrenar mi mente para ver lo que hay, no lo que falta.', icon: '🙏', category: 'mind', dailyHabit: 'Nombrar 3 cosas específicas por las que estoy agradecido' },

  // Conexión
  { title: 'Estar más presente con las personas que quiero', description: 'La presencia es el mejor regalo que puedo dar.', icon: '👨‍👩‍👧', category: 'connection', dailyHabit: 'Dejar el celular en otro cuarto durante tiempo de calidad' },
  { title: 'Nutrir una relación más profundamente', description: 'Profundidad sobre cantidad. Invertir en las personas que más importan.', icon: '❤️', category: 'connection', dailyHabit: 'Enviar un mensaje con intención a alguien que me importa' },
  { title: 'Escuchar más, arreglar menos', description: 'A veces las personas necesitan ser escuchadas, no ayudadas.', icon: '🤝', category: 'connection', dailyHabit: 'En mi próxima conversación, escuchar por completo antes de responder' },
  { title: 'Expresar lo que siento', description: 'Guardármelo no protege a nadie. La honestidad construye confianza.', icon: '💬', category: 'connection', dailyHabit: 'Compartir un sentimiento honesto con alguien hoy' },

  // Crecimiento
  { title: 'Leer algo significativo cada día', description: 'Alimentar la mente como alimento el cuerpo.', icon: '📖', category: 'growth', dailyHabit: 'Leer al menos 10 minutos' },
  { title: 'Aprender algo nuevo', description: 'Mantener la curiosidad. El crecimiento es el antídoto del estancamiento.', icon: '🎯', category: 'growth', dailyHabit: 'Dedicar 15 minutos a aprender una habilidad' },
  { title: 'Menos tiempo consumiendo, más creando', description: 'Scrollear llena el tiempo. Crear llena el alma.', icon: '📵', category: 'growth', dailyHabit: 'Reemplazar 30 minutos de scroll por crear algo' },
  { title: 'Aclarar lo que verdaderamente valoro', description: 'Cuando conozco mis valores, las decisiones se toman solas.', icon: '🧭', category: 'growth', dailyHabit: 'Preguntarme: ¿esto se alinea con lo que más me importa?' },

  // Propósito
  { title: 'Hacer trabajo que me importe', description: 'No solo productivo — significativo.', icon: '⚡', category: 'purpose', dailyHabit: 'Empezar cada día con la tarea que más importa' },
  { title: 'Liderar con amabilidad', description: 'Cada interacción es una oportunidad de levantar a alguien.', icon: '👏', category: 'purpose', dailyHabit: 'Reconocer a una persona por algo específico que hizo' },
  { title: 'Construir seguridad a largo plazo', description: 'Decisiones pequeñas y constantes se acumulan en libertad.', icon: '💰', category: 'purpose', dailyHabit: 'Tomar una decisión financiera que sirva a mi yo del futuro' },
  { title: 'Dejar las cosas mejor de como las encontré', description: 'Una vida de contribución, no solo de consumo.', icon: '🌱', category: 'purpose', dailyHabit: 'Hacer algo hoy que ayude a alguien sin esperar nada a cambio' },
];

export function getLocalizedIntentionCategories() {
  return getLocale() === 'es' ? INTENTION_CATEGORIES_ES : INTENTION_CATEGORIES;
}

export function getLocalizedIntentions() {
  return getLocale() === 'es' ? PRESET_INTENTIONS_ES : PRESET_INTENTIONS;
}
