'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { usePriorityStore, type PriorityItem } from '@/stores/priorityStore';
import { toLocalDateStr } from '@/lib/dateUtils';
import {
  isSpeechRecognitionSupported,
  requestMicPermission,
  startListening,
  stopListening,
} from '@/lib/speechRecognition';
import { extractPriorities } from '@/lib/priorityEngine';

export default function PrioritiesPage() {
  const today = toLocalDateStr(new Date());
  const { items, groceries, fetchPriorities, savePriorities, toggleItem, toggleGroceryItem, loading } = usePriorityStore();
  const [newItem, setNewItem] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [capturedText, setCapturedText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [speechSupported] = useState(() => typeof window !== 'undefined' && isSpeechRecognitionSupported());

  // Direct ref — always has latest transcript, never stale
  const liveText = useRef('');
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    fetchPriorities(today);
  }, [fetchPriorities, today]);

  const handleAddItem = async () => {
    if (!newItem.trim()) return;
    const item: PriorityItem = {
      id: crypto.randomUUID(),
      text: newItem.trim(),
      completed: false,
      sort_order: items.length,
    };
    await savePriorities(today, [...items, item]);
    setNewItem('');
  };

  // Toggle mic on/off — does NOT process, just captures text
  const toggleMic = async () => {
    if (isListening) {
      stopListening();
      setIsListening(false);
      // Copy whatever we have to capturedText for the "Add Tasks" button
      if (liveText.current.trim()) {
        setCapturedText(liveText.current.trim());
      }
    } else {
      const granted = await requestMicPermission();
      if (!granted) {
        alert('Please enable microphone access.');
        return;
      }
      liveText.current = '';
      setError('');
      setIsListening(true);
      startListening({
        continuous: true,
        onResult: (text) => {
          liveText.current = text;
          setCapturedText(text);
        },
        onEnd: () => {
          // Browser auto-stopped — preserve the text, just update mic state
          setIsListening(false);
          if (liveText.current.trim()) {
            setCapturedText(liveText.current.trim());
          }
        },
        onError: (err) => {
          setIsListening(false);
          setError(`Mic error: ${err}`);
        },
      });
    }
  };

  // Process captured text → extract tasks → save
  const handleAddTasks = async () => {
    const text = capturedText.trim();
    if (!text) return;

    // Stop mic if still running
    if (isListening) {
      stopListening();
      setIsListening(false);
    }

    setProcessing(true);
    setError('');
    try {
      const extracted = await extractPriorities(text);
      const currentItems = itemsRef.current;
      if (extracted.length > 0) {
        const merged = [...currentItems, ...extracted.map((p, i) => ({ ...p, sort_order: currentItems.length + i }))];
        await savePriorities(today, merged);
      } else {
        // Gemini found no tasks — save the whole thing as one item
        await savePriorities(today, [...currentItems, {
          id: crypto.randomUUID(),
          text,
          completed: false,
          sort_order: currentItems.length,
        }]);
      }
      setCapturedText('');
      liveText.current = '';
    } catch {
      // Gemini failed — save raw text as fallback
      const currentItems = itemsRef.current;
      try {
        await savePriorities(today, [...currentItems, {
          id: crypto.randomUUID(),
          text,
          completed: false,
          sort_order: currentItems.length,
        }]);
        setCapturedText('');
        liveText.current = '';
      } catch {
        setError('Failed to save. Please try again.');
      }
    }
    setProcessing(false);
  };

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Priorities</h1>
        <p className="text-sm text-text-secondary mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Voice capture — two separate actions: record + process */}
      {speechSupported && (
        <div className="space-y-2">
          {/* Mic toggle */}
          <button
            onClick={toggleMic}
            disabled={processing}
            className={`w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-medium transition-colors ${
              isListening
                ? 'bg-error text-white'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
            } ${processing ? 'opacity-40' : ''}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
            {isListening ? 'Stop Recording' : 'Speak your priorities'}
          </button>

          {/* Show captured text */}
          {capturedText && (
            <div className="bg-surface rounded-xl p-3 space-y-2">
              <p className="text-sm text-text-primary">{capturedText}</p>
              {/* Process button — always visible when there's text */}
              <button
                onClick={handleAddTasks}
                disabled={processing}
                className="w-full py-2.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Add Tasks'}
              </button>
              <button
                onClick={() => { setCapturedText(''); liveText.current = ''; }}
                className="w-full py-2 text-text-tertiary text-sm hover:text-text-secondary"
              >
                Discard
              </button>
            </div>
          )}

          {error && <p className="text-sm text-error">{error}</p>}
        </div>
      )}

      {/* Add new priority manually */}
      <div className="flex gap-2">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
          placeholder="Add a priority..."
          className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none text-sm"
        />
        <button
          onClick={handleAddItem}
          disabled={!newItem.trim()}
          className="px-4 py-3 bg-primary text-white rounded-xl font-medium text-sm disabled:opacity-40 hover:bg-primary-dark transition-colors"
        >
          Add
        </button>
      </div>

      {/* Priority items */}
      {items.length > 0 ? (
        <div className="space-y-1">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Tasks</h2>
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => toggleItem(item.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                item.completed ? 'bg-success/10' : 'bg-surface hover:bg-surface-elevated'
              }`}
            >
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                item.completed ? 'bg-success border-success' : 'border-border'
              }`}>
                {item.completed && <span className="text-white text-xs font-bold">✓</span>}
              </div>
              <span className={`text-sm text-left flex-1 ${item.completed ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                {item.text}
              </span>
            </button>
          ))}
        </div>
      ) : (
        !loading && !processing && !capturedText && (
          <div className="text-center py-12 space-y-2">
            <p className="text-4xl">🎯</p>
            <p className="text-text-secondary text-sm">No priorities for today yet.</p>
            <p className="text-text-tertiary text-xs">Speak or type to add tasks.</p>
          </div>
        )
      )}

      {/* Grocery groups */}
      {groceries.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Groceries</h2>
          {groceries.map((group) => (
            <div key={group.id} className="bg-surface rounded-xl border border-border p-3 space-y-1">
              <p className="text-xs font-semibold text-text-secondary uppercase">{group.store}</p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleGroceryItem(group.id, item.id)}
                  className="w-full flex items-center gap-2 py-1"
                >
                  <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                    item.completed ? 'bg-success border-success' : 'border-border'
                  }`}>
                    {item.completed && <span className="text-white text-[10px]">✓</span>}
                  </div>
                  <span className={`text-sm ${item.completed ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                    {item.name}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
