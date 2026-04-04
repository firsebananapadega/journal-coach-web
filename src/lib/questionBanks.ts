// Question Banks — Ben\'s pre-written, science-backed follow-up questions
// Zero API calls. Runs locally. Works offline. Zero cost.
//
// Each bank has trigger keywords and questions authored from Phase 1 research.
// The guidance engine matches user entry text against triggers, picks the best bank,
// and selects a question the user hasn\'t seen recently.

export interface QuestionBank {
  id: string;
  category: string;
  triggers: string[];
  questions: string[];
  source: string;
}

export const questionBanks: QuestionBank[] = [
  // --- WORK & PRODUCTIVITY ---
  {
    id: 'stress-work',
    category: 'work_stress',
    triggers: [
      'stress', 'stressed', 'overwhelmed', 'deadline', 'boss', 'coworker',
      'behind', 'pressure', 'anxious about work', 'burned out',
      'burnout', 'overworked', 'too much to do', 'workload',
      'meeting', 'presentation', 'fired', 'layoff',
    ],
    questions: [
      'What part of this is actually within your control?',
      'If you could change one thing about this situation, what would it be?',
      'What would you tell a friend who described this exact situation to you?',
      'Is this going to matter in 6 months? Why or why not?',
      'What is one small step you could take tomorrow to move this forward?',
      'What would "good enough" look like here — not perfect, just good enough?',
      'When you\'ve handled something like this before, what helped?',
    ],
    source: 'Cognitive reframing (Beck 1979), Motivational interviewing (Miller & Rollnick)',
  },
  {
    id: 'productivity',
    category: 'productivity',
    triggers: [
      'productive', 'accomplished', 'got a lot done', 'focused',
      'finished', 'completed', 'shipped', 'progress', 'momentum',
      'on track', 'knocked out',
    ],
    questions: [
      'What made today so productive? Can you recreate those conditions?',
      'Which of the things you accomplished mattered most?',
      'How are you feeling about the pace — sustainable or pushing too hard?',
      'What did you say no to today that helped you focus?',
    ],
    source: 'Locke & Latham goal-setting theory, Clear (Atomic Habits) — reinforcing identity',
  },
  {
    id: 'procrastination',
    category: 'procrastination',
    triggers: [
      'procrastinat', 'avoiding', 'putting off', 'can\'t start',
      'stuck', 'unmotivated', 'lazy', 'distracted', 'wasted time',
      'didn\'t do', 'should have',
    ],
    questions: [
      'What\'s the very next physical action this task requires — not the whole thing, just the first step?',
      'What would it feel like to have this done? Can you hold that feeling for a moment?',
      'Is there something about this task that feels unclear or uncomfortable?',
      'What if you committed to just 2 minutes on it? That\'s it — 2 minutes.',
      'What are you actually avoiding — the task itself, or something it represents?',
    ],
    source: 'GTD next-action principle (Allen), Two-Minute Rule (Clear), Fogg B=MAP',
  },

  // --- EMOTIONS & WELLBEING ---
  {
    id: 'anxiety',
    category: 'anxiety',
    triggers: [
      'anxious', 'anxiety', 'worried', 'worry', 'nervous',
      'panicking', 'panic', 'can\'t stop thinking', 'racing thoughts',
      'dread', 'fear', 'scared', 'uneasy',
    ],
    questions: [
      'Can you name exactly what you\'re worried about? Sometimes pinpointing it takes away its power.',
      'What\'s the worst that could realistically happen? And how would you handle it?',
      'Is this worry about something you can act on, or something you need to let go of?',
      'What would you need to feel even 10% calmer right now?',
      'When this worry passes — and it will — what do you think you\'ll see more clearly?',
    ],
    source: 'Affect labeling (Lieberman et al. 2007), Cognitive reframing (Beck 1979)',
  },
  {
    id: 'sadness',
    category: 'sadness',
    triggers: [
      'sad', 'down', 'depressed', 'low', 'crying', 'cry',
      'hopeless', 'empty', 'numb', 'lonely', 'alone',
      'miss', 'missing', 'lost', 'grief', 'mourning',
    ],
    questions: [
      'I hear you. What does this feeling need from you right now — space, comfort, or something else?',
      'Has anything like this feeling come and gone before? What helped then?',
      'Is there someone you trust who you could talk to about this?',
      'What\'s one small thing that usually brings you a little comfort?',
      'You showed up here, even feeling like this. What made you open the app today?',
    ],
    source: 'Pennebaker expressive writing, Self-compassion (Neff), Affect labeling (Lieberman)',
  },
  {
    id: 'anger',
    category: 'anger',
    triggers: [
      'angry', 'furious', 'frustrated', 'annoyed', 'irritated',
      'pissed', 'rage', 'mad', 'unfair', 'disrespected',
    ],
    questions: [
      'What exactly crossed the line for you?',
      'Underneath the anger, is there a different feeling — hurt, disappointment, fear?',
      'What would you need to happen to feel like this was resolved?',
      'Is this about today, or is it part of a bigger pattern?',
      'If you could say one thing to the person involved — with no consequences — what would it be?',
    ],
    source: 'Affect labeling (Lieberman et al. 2007), Cognitive reframing (Beck 1979)',
  },
  {
    id: 'happiness',
    category: 'happiness',
    triggers: [
      'happy', 'great day', 'amazing', 'wonderful', 'fantastic',
      'excited', 'joy', 'thrilled', 'proud', 'celebrating',
      'best day', 'perfect', 'love this', 'good mood',
    ],
    questions: [
      'What specifically made this so good? Hold onto that detail.',
      'Who contributed to this moment? Have you told them?',
      'How can you create more days like this?',
      'What would it look like to carry this energy into tomorrow?',
    ],
    source: 'Savoring research (Bryant & Veroff), Gratitude deepening (Emmons)',
  },

  // --- GRATITUDE ---
  {
    id: 'gratitude-deepen',
    category: 'gratitude',
    triggers: [
      'grateful', 'thankful', 'appreciate', 'lucky', 'blessed',
      'gratitude', 'counting blessings', 'good things',
    ],
    questions: [
      'What specifically about that makes you feel grateful?',
      'How would your life be different without it?',
      'Who contributed to making that possible?',
      'How could you express that gratitude to someone today?',
      'Is this something you used to take for granted? What changed?',
    ],
    source: 'Emmons & McCullough (2003) — depth > breadth, subtraction framing amplifies effect',
  },

  // --- RELATIONSHIPS ---
  {
    id: 'relationships',
    category: 'relationships',
    triggers: [
      'partner', 'spouse', 'wife', 'husband', 'boyfriend', 'girlfriend',
      'relationship', 'dating', 'argument', 'fight', 'breakup',
      'broke up', 'love', 'marriage', 'divorce',
    ],
    questions: [
      'What do you think the other person\'s perspective is?',
      'What do you need from this relationship that you\'re not getting?',
      'When things are good between you, what does that look like?',
      'Is there something you haven\'t said that needs to be said?',
      'What part of this is about them, and what part is about you?',
    ],
    source: 'Motivational interviewing (Miller & Rollnick), Perspective-taking research',
  },
  {
    id: 'family',
    category: 'family',
    triggers: [
      'family', 'parent', 'mom', 'dad', 'mother', 'father',
      'sibling', 'brother', 'sister', 'kids', 'children', 'son', 'daughter',
    ],
    questions: [
      'What\'s the dynamic here that\'s weighing on you?',
      'Is there a pattern in how this usually plays out?',
      'What would you want them to understand about how you feel?',
      'What\'s one thing you value about this person, even when it\'s hard?',
    ],
    source: 'Expressive writing (Pennebaker), Affect labeling (Lieberman)',
  },
  {
    id: 'friendship',
    category: 'friendship',
    triggers: [
      'friend', 'friendship', 'friends', 'social', 'hanging out',
      'connection', 'isolated', 'left out', 'betrayed',
    ],
    questions: [
      'What does this friendship give you? What does it take?',
      'When did you last feel truly connected to someone?',
      'Is there someone you\'ve been meaning to reach out to?',
      'What kind of friend do you want to be?',
    ],
    source: 'Self-Determination Theory — relatedness need (Deci & Ryan)',
  },

  // --- GOALS & ASPIRATIONS ---
  {
    id: 'goal-reflection',
    category: 'goals',
    triggers: [
      'goal', 'want to', 'trying to', 'working on', 'dream',
      'plan', 'aspire', 'ambition', 'resolution', 'future',
      'someday', 'wish', 'hope to',
    ],
    questions: [
      'What does success look like for this specifically?',
      'What is the very next physical action you need to take?',
      'What has been your biggest obstacle so far?',
      'On a scale of 1-10, how committed are you to this? What would make it a 10?',
      'If you told someone "I\'m the kind of person who ___" — how would you finish that?',
    ],
    source: 'Locke & Latham goal-setting theory, GTD next-action principle, Identity-based habits (Clear)',
  },
  {
    id: 'goal-progress',
    category: 'goals',
    triggers: [
      'making progress', 'closer to', 'milestone', 'achieved',
      'one step closer', 'getting there', 'halfway',
    ],
    questions: [
      'What made this progress possible? What conditions helped?',
      'How does it feel to be moving forward?',
      'What\'s the next milestone after this one?',
      'Who should know about this progress?',
    ],
    source: 'Progress monitoring research, Locke & Latham feedback loops',
  },

  // --- HABITS ---
  {
    id: 'habit-reflection',
    category: 'habits',
    triggers: [
      'habit', 'routine', 'consistent', 'discipline', 'every day',
      'morning routine', 'evening routine', 'building', 'practice',
    ],
    questions: [
      'What makes this habit easy to do? What makes it hard?',
      'Is there a moment in your day where this habit naturally fits?',
      'How does it feel after you do it — not before, after?',
      'If you missed tomorrow, what would you do the day after?',
      'What\'s the smallest version of this habit that still counts?',
    ],
    source: 'Four Laws (Clear), B=MAP (Fogg), "Never miss twice" principle',
  },

  // --- HEALTH & BODY ---
  {
    id: 'health',
    category: 'health',
    triggers: [
      'exercise', 'workout', 'gym', 'run', 'running', 'yoga',
      'sleep', 'tired', 'exhausted', 'sick', 'health', 'weight',
      'diet', 'eating', 'energy', 'headache', 'pain',
    ],
    questions: [
      'How is your body feeling right now — really?',
      'What\'s one thing your body is asking for that you\'ve been ignoring?',
      'How does your physical state affect your mental state today?',
      'What\'s one small thing you could do for your body in the next hour?',
    ],
    source: 'Mind-body connection research, Pennebaker (physical health markers improve with expressive writing)',
  },

  // --- DECISIONS & UNCERTAINTY ---
  {
    id: 'decisions',
    category: 'decisions',
    triggers: [
      'decision', 'decide', 'torn', 'dilemma', 'choice',
      'should I', 'don\'t know what to', 'crossroads', 'options',
      'weighing', 'pros and cons',
    ],
    questions: [
      'If you had to decide right now — gut feeling — which way would you go?',
      'What are you most afraid of with each option?',
      'Which choice is more aligned with who you want to be?',
      'What would you tell a friend facing this exact decision?',
      'What information would make this decision obvious? Can you get it?',
    ],
    source: 'Gollwitzer implementation intentions, Values-based decision making',
  },

  // --- SELF-COMPASSION ---
  {
    id: 'self-compassion',
    category: 'self_compassion',
    triggers: [
      'failed', 'failure', 'not good enough', 'disappointed in myself',
      'messed up', 'screwed up', 'hate myself', 'can\'t do anything',
      'worthless', 'imposter', 'fraud', 'behind everyone',
    ],
    questions: [
      'Would you say this about a friend? What would you say to them instead?',
      'What did you actually learn from this?',
      'Is this a fact about you, or a feeling right now? Those are different things.',
      'What\'s one thing you did well recently — even something small?',
      'What would the most compassionate version of you say right now?',
    ],
    source: 'Self-compassion (Neff), Growth mindset (Dweck), "Never miss twice" (Clear)',
  },

  // --- CREATIVITY ---
  {
    id: 'creativity',
    category: 'creativity',
    triggers: [
      'creative', 'idea', 'project', 'writing', 'art', 'music',
      'inspired', 'inspiration', 'blocked', 'creative block',
      'blank', 'nothing comes', 'muse',
    ],
    questions: [
      'What sparked this idea? Where were you, what were you doing?',
      'What would you make if you knew nobody would ever see it?',
      'What\'s the version of this that excites you most?',
      'What\'s blocking you — is it skill, time, fear, or something else?',
    ],
    source: 'Flow research (Csikszentmihalyi), Intrinsic motivation (Deci & Ryan)',
  },

  // --- CELEBRATION & WINS ---
  {
    id: 'wins',
    category: 'celebration',
    triggers: [
      'won', 'success', 'nailed it', 'crushed it', 'promotion',
      'raise', 'got the job', 'accepted', 'passed', 'graduated',
      'personal best', 'breakthrough',
    ],
    questions: [
      'Take a moment — how does this feel? Really sit with it.',
      'What did you do that made this happen?',
      'Who helped you get here?',
      'What does this success tell you about yourself?',
    ],
    source: 'Savoring (Bryant & Veroff), Identity reinforcement (Clear)',
  },

  // --- TIME OF DAY DEFAULTS ---
  {
    id: 'morning-general',
    category: 'morning',
    triggers: [
      'this morning', 'woke up', 'just woke', 'starting my day',
      'morning coffee', 'breakfast',
    ],
    questions: [
      'What\'s the one thing that would make today a good day?',
      'How did you sleep? How are you feeling going into today?',
      'Is there anything from yesterday you want to carry forward or leave behind?',
    ],
    source: 'Morning priming research, Huberman focus protocols',
  },
  {
    id: 'evening-general',
    category: 'evening',
    triggers: [
      'tonight', 'this evening', 'end of day', 'winding down',
      'before bed', 'going to sleep', 'long day',
    ],
    questions: [
      'What was the best part of today?',
      'Is there anything you need to let go of before you sleep?',
      'What are you looking forward to tomorrow?',
      'If today had a title, what would it be?',
    ],
    source: 'Evening reflection research, Sleep improvement via pre-bed worry externalization',
  },

  // --- GENERAL REFLECTION (FALLBACK) ---
  {
    id: 'general-reflection',
    category: 'general',
    triggers: [], // This bank is used as a fallback when no other bank matches
    questions: [
      'What stands out to you most about what you just shared?',
      'If you could zoom out and see the big picture, what would you notice?',
      'What would you want to remember about today?',
      'Is there something you haven\'t said yet that\'s on your mind?',
      'How does talking about this feel compared to just thinking about it?',
      'What would tomorrow look like if today went exactly the way you wanted?',
    ],
    source: 'Pennebaker expressive writing, Metacognitive reflection research',
  },
];

// ============================================================
// BODHI-SPECIFIC QUESTION BANKS
// Contemplative, experience-oriented questions in Bodhi's voice.
// Used as offline fallback when guideId === 'bodhi'.
// ============================================================

export const bodhiQuestionBanks: QuestionBank[] = [
  {
    id: 'bodhi-stress',
    category: 'work_stress',
    triggers: [
      'stress', 'stressed', 'overwhelmed', 'deadline', 'boss', 'coworker',
      'behind', 'pressure', 'burned out', 'burnout', 'overworked',
      'too much to do', 'workload',
    ],
    questions: [
      'You\'ve named the pressure. Now — where does it actually live in your body right now?',
      'You\'re carrying a lot. What would happen if you set one piece of it down — even for a moment?',
      'The stress is loud. But underneath it — what is it protecting you from seeing?',
      'What part of this is the situation, and what part is the story your mind is building around it?',
      'If the pressure could speak, what would it be asking you for?',
    ],
    source: 'Somatic awareness, contemplative inquiry, Pema Chodron (staying with raw energy)',
  },
  {
    id: 'bodhi-anxiety',
    category: 'anxiety',
    triggers: [
      'anxious', 'anxiety', 'worried', 'worry', 'nervous', 'scared',
      'dread', 'panic', 'fear', 'terrified', 'uneasy', 'on edge',
    ],
    questions: [
      'The anxiety is here. You don\'t have to understand it yet. What does it actually feel like — in your chest, your stomach, your hands?',
      'You\'re running through scenarios in your head. What would happen if you stopped trying to solve it for just this moment?',
      'Fear has a message. It\'s rarely the one we think. What might yours be trying to tell you?',
      'What if the uncertainty isn\'t a problem to fix — but the actual texture of this moment?',
      'The mind wants to think its way to safety. The body already knows something. What is it saying?',
    ],
    source: 'Tara Brach RAIN, groundlessness as feature, somatic redirect',
  },
  {
    id: 'bodhi-sadness',
    category: 'sadness',
    triggers: [
      'sad', 'down', 'depressed', 'lonely', 'grief', 'loss',
      'miss', 'missing', 'empty', 'numb', 'hollow', 'heartbroken',
    ],
    questions: [
      'There\'s a heaviness here. I\'m not going to try to make it lighter. What does it need from you right now?',
      'You named this as sadness. Is that the right word, or is there something more precise underneath it?',
      'Sometimes grief is just love with nowhere to go. What are you loving that you can\'t hold?',
      'The emptiness you\'re describing — what was there before it arrived?',
      'What if sitting with this feeling, without trying to change it, is the bravest thing you could do right now?',
    ],
    source: 'Pema Chodron (emotions as messengers), contemplative grief work, affect labeling',
  },
  {
    id: 'bodhi-stuck',
    category: 'procrastination',
    triggers: [
      'stuck', 'procrastinat', 'avoiding', 'putting off', 'can\'t start',
      'unmotivated', 'lazy', 'distracted', 'wasted time', 'going nowhere',
      'spinning', 'frozen',
    ],
    questions: [
      'You call it stuck. But something in you is still here, still paying attention. What does that tell you?',
      'What if the stuckness isn\'t the problem — but what you\'re using to avoid looking at something else?',
      'You\'re waiting to feel ready. What if readiness doesn\'t come before you move — but from it?',
      'The instrument you\'re using to figure this out — your thinking mind — might be exactly what\'s in the way. What does your body know that your mind doesn\'t?',
      'You keep trying to think your way through this. What happens when you stop trying for a moment?',
    ],
    source: 'Karma yoga (action without attachment), Mundaka Upanishad (limits of intellect), contemplative inquiry',
  },
  {
    id: 'bodhi-identity',
    category: 'identity',
    triggers: [
      'who am I', 'don\'t know myself', 'lost myself', 'identity',
      'becoming', 'changing', 'growing', 'not sure who', 'used to be',
      'different person', 'mask', 'pretending', 'authentic',
    ],
    questions: [
      'You say you don\'t know who you are. That might be the first honest thing you\'ve felt in a while. What if not knowing is the opening?',
      'The version of you that felt certain — was it actually you, or was it a costume that fit well enough that you stopped questioning it?',
      'What part of you keeps insisting on existing — no matter how much you try to mute it?',
      'You\'re looking for yourself. But the one doing the looking — have you considered that might already be the answer?',
      'What would it feel like to stop trying to figure out who you are — and just notice who is here right now?',
    ],
    source: 'Vedanta (atman recognition), Jung (individuation), Mundaka Upanishad',
  },
  {
    id: 'bodhi-meaning',
    category: 'meaning',
    triggers: [
      'meaningless', 'pointless', 'purpose', 'meaning', 'what\'s the point',
      'existential', 'empty', 'void', 'why bother', 'nihil',
      'wasting my life', 'no direction',
    ],
    questions: [
      'The fact that you can feel this emptiness means something in you is still paying attention. What is it looking for?',
      'You ask what\'s the point. That question itself — where does it come from? What in you refuses to stop asking?',
      'What if meaning isn\'t something you find at the end of a search — but something that forms around the act of showing up?',
      'You describe your life as something happening to you. When did you stop feeling like the author?',
      'The void you\'re describing — what if it isn\'t empty? What if it\'s full of something you haven\'t slowed down enough to see?',
    ],
    source: 'Nasadiya Sukta (creative void), Kierkegaard (despair), Gita (dharma as sacred duty)',
  },
  {
    id: 'bodhi-relationships',
    category: 'relationships',
    triggers: [
      'partner', 'relationship', 'fight', 'argument', 'breakup',
      'love', 'marriage', 'boyfriend', 'girlfriend', 'spouse',
      'disconnected', 'drifting apart',
    ],
    questions: [
      'Underneath the argument — what were you actually asking for that you couldn\'t say?',
      'You\'re describing what they did. What part of you did it touch — what got exposed?',
      'A long-term commitment is a relentless mirror. What is this relationship showing you about yourself that you\'d rather not see?',
      'You want them to change. What if the real friction is between two versions of you — the one who wants to stay and the one who wants to run?',
      'What would it mean to stop trying to fix this — and just be honest about what you need?',
    ],
    source: 'Contemplative relationship inquiry, Kierkegaard (ethical commitment), sthitaprajna (steadiness)',
  },
  {
    id: 'bodhi-perfectionism',
    category: 'self_compassion',
    triggers: [
      'perfect', 'not good enough', 'failed', 'failure', 'imposter',
      'fraud', 'behind everyone', 'can\'t do anything right',
      'disappointed in myself', 'hate myself', 'worthless',
    ],
    questions: [
      'You keep refining, polishing, holding back. What are you actually protecting — the work, or yourself?',
      'What would happen if you let something out into the world — flaws and all — and it survived?',
      'The voice that says you\'re not enough — when did you first hear it? Whose voice is it really?',
      'You\'re measuring yourself against something. What is it? And who decided that was the standard?',
      'What if the part of you that feels broken is the part that\'s most alive — and the most worth listening to?',
    ],
    source: 'Svabhava (inherent nature), contemplative self-inquiry, shadow integration (Jung)',
  },
  {
    id: 'bodhi-general',
    category: 'general',
    triggers: [],
    questions: [
      'What\'s the thing you almost said just now — but held back?',
      'If you stopped trying to figure this out and just stayed with what\'s here — what would you notice?',
      'Something brought you here today. What is it that wants your attention?',
      'What are you noticing in your body right now — not your thoughts, your body?',
      'What would change if you stopped performing and just said what\'s true?',
      'You\'ve shared what happened. Now — what is this moment actually like, right now, as you sit here?',
    ],
    source: 'Contemplative inquiry, somatic awareness, direct experience orientation',
  },
];

// Export count for testing
export const TOTAL_BANKS = questionBanks.length;
export const TOTAL_QUESTIONS = questionBanks.reduce((sum, bank) => sum + bank.questions.length, 0);
export const TOTAL_BODHI_BANKS = bodhiQuestionBanks.length;
export const TOTAL_BODHI_QUESTIONS = bodhiQuestionBanks.reduce((sum, bank) => sum + bank.questions.length, 0);
