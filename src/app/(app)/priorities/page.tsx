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
  const [log, setLog] = useState<string[]>([]);
  const [speechSupported] = useState(() => typeof window !== 'undefined' && isSpeechRecognitionSupported());

  const liveText = useRef('');
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${msg}`]);
  }, []);

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
    try {
      await savePriorities(today, [...items, item]);
      setNewItem('');
      addLog(`Added: "${item.text}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      addLog(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const toggleMic = async () => {
    if (isListening) {
      stopListening();
      setIsListening(false);
      addLog('Mic stopped');
      if (liveText.current.trim()) {
        setCapturedText(liveText.current.trim());
      }
    } else {
      const granted = await requestMicPermission();
      if (!granted) {
        setError('Microphone permission denied');
        addLog('Mic permission denied');
        return;
      }
      liveText.current = '';
      setError('');
      setIsListening(true);
      addLog('Mic started');
      startListening({
        continuous: true,
        onResult: (text) => {
          liveText.current = text;
          setCapturedText(text);
        },
        onEnd: () => {
          setIsListening(false);
          addLog('Mic auto-stopped (browser)');
          if (liveText.current.trim()) {
            setCapturedText(liveText.current.trim());
          }
        },
        onError: (err) => {
          setIsListening(false);
          setError(`Mic error: ${err}`);
          addLog(`Mic error: ${err}`);
        },
      });
    }
  };

  const handleAddTasks = async () => {
    const text = capturedText.trim();
    if (!text) {
      addLog('No text to process');
      return;
    }

    if (isListening) {
      stopListening();
      setIsListening(false);
    }

    setProcessing(true);
    setError('');
    addLog(`Processing: "${text.substring(0, 50)}..."`);

    const currentItems = itemsRef.current;

    // Step 1: Try Gemini extraction
    let tasks: PriorityItem[] = [];
    try {
      tasks = await extractPriorities(text);
      addLog(`Gemini extracted ${tasks.length} task(s)`);
    } catch (geminiErr) {
      addLog(`Gemini failed: ${geminiErr instanceof Error ? geminiErr.message : String(geminiErr)}`);
      // Fall through — will save raw text below
    }

    // Step 2: Build the items to save
    const newItems = tasks.length > 0
      ? tasks.map((p, i) => ({ ...p, sort_order: currentItems.length + i }))
      : [{ id: crypto.randomUUID(), text, completed: false, sort_order: currentItems.length }];

    // Step 3: Save to Supabase
    try {
      const merged = [...currentItems, ...newItems];
      await savePriorities(today, merged);
      addLog(`Saved ${newItems.length} item(s) to Supabase`);
      setCapturedText('');
      liveText.current = '';
    } catch (saveErr) {
      const msg = saveErr instanceof Error ? saveErr.message : String(saveErr);
      setError(`Save failed: ${msg}`);
      addLog(`Supabase save failed: ${msg}`);
    }

    setProcessing(false);
  };

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Tasks & Groceries</h1>
        <p className="text-sm text-text-secondary mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Voice capture */}
      {speechSupported && (
        <div className="space-y-2">
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
            {isListening ? 'Stop Recording' : 'Speak your tasks'}
          </button>

          {capturedText && (
            <div className="bg-surface rounded-xl p-3 space-y-2">
              <p className="text-sm text-text-primary">{capturedText}</p>
              <button
                onClick={handleAddTasks}
                disabled={processing}
                className="w-full py-2.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Add Tasks'}
              </button>
              <button
                onClick={() => { setCapturedText(''); liveText.current = ''; addLog('Discarded text'); }}
                className="w-full py-2 text-text-tertiary text-sm hover:text-text-secondary"
              >
                Discard
              </button>
            </div>
          )}

          {error && (
            <div className="bg-error/10 border border-error/30 rounded-xl p-3">
              <p className="text-sm text-error">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Manual add */}
      <div className="flex gap-2">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
          placeholder="Add a task..."
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

      {/* Task items */}
      {items.length > 0 && (
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
      )}

      {/* Groceries */}
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

      {/* Empty state */}
      {items.length === 0 && groceries.length === 0 && !loading && !processing && !capturedText && (
        <div className="text-center py-12 space-y-2">
          <p className="text-4xl">🎯</p>
          <p className="text-text-secondary text-sm">No tasks for today yet.</p>
        </div>
      )}

      {/* Activity log — visible debug panel */}
      {log.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Activity Log</h2>
            <button onClick={() => setLog([])} className="text-xs text-text-tertiary hover:text-text-secondary">Clear</button>
          </div>
          <div className="bg-surface rounded-xl border border-border p-3 space-y-0.5">
            {log.map((entry, i) => (
              <p key={i} className="text-xs text-text-tertiary font-mono">{entry}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
