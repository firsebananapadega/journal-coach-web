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
