'use client';

const MOODS = [
  { score: 5, label: 'great', emoji: '😊', color: 'bg-mood-great' },
  { score: 4, label: 'good', emoji: '🙂', color: 'bg-mood-good' },
  { score: 3, label: 'okay', emoji: '😐', color: 'bg-mood-okay' },
  { score: 2, label: 'low', emoji: '😔', color: 'bg-mood-low' },
  { score: 1, label: 'tough', emoji: '😢', color: 'bg-mood-tough' },
];

interface MoodSelectorProps {
  value: number | null;
  onChange: (score: number, label: string) => void;
}

export function MoodSelector({ value, onChange }: MoodSelectorProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-text-secondary">How are you feeling?</p>
      <div className="flex gap-3">
        {MOODS.map((mood) => (
          <button
            key={mood.score}
            onClick={() => onChange(mood.score, mood.label)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
              value === mood.score
                ? 'scale-110 ring-2 ring-primary bg-surface-elevated'
                : 'opacity-60 hover:opacity-100'
            }`}
          >
            <span className="text-2xl">{mood.emoji}</span>
            <span className="text-xs text-text-secondary capitalize">{mood.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
