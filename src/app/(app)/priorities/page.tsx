'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { usePriorityStore, type PriorityItem, type GroceryGroup } from '@/stores/priorityStore';
import { toLocalDateStr } from '@/lib/dateUtils';
import {
  isSpeechRecognitionSupported,
  requestMicPermission,
  startListening,
  stopListening,
} from '@/lib/speechRecognition';
import { classifyCapture } from '@/lib/captureEngine';

function buildWeekDates(): Date[] {
  const today = new Date();
  const dates: Date[] = [];
  for (let offset = -3; offset <= 3; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    dates.push(d);
  }
  return dates;
}

function formatDateBubble(date: Date, todayStr: string): { label: string; dateNum: number } {
  const dateStr = toLocalDateStr(date);
  const dateNum = date.getDate();
  if (dateStr === todayStr) {
    return { label: 'Today', dateNum };
  }
  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
  return { label: dayName, dateNum };
}

export default function PrioritiesPage() {
  const todayDateStr = useMemo(() => toLocalDateStr(new Date()), []);
  const weekDates = useMemo(() => buildWeekDates(), []);
  const [selectedDate, setSelectedDate] = useState(todayDateStr);

  const { items, groceries, fetchPriorities, savePriorities, saveGroceries, toggleItem, toggleGroceryItem, loading } = usePriorityStore();
  const [newItem, setNewItem] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [capturedText, setCapturedText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [speechSupported] = useState(() => typeof window !== 'undefined' && isSpeechRecognitionSupported());

  const liveText = useRef('');
  const itemsRef = useRef(items);
  const groceriesRef = useRef(groceries);
  itemsRef.current = items;
  groceriesRef.current = groceries;

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${msg}`]);
  }, []);

  useEffect(() => {
    fetchPriorities(selectedDate);
  }, [fetchPriorities, selectedDate]);

  const handleAddItem = async () => {
    if (!newItem.trim()) return;
    const item: PriorityItem = {
      id: crypto.randomUUID(),
      text: newItem.trim(),
      completed: false,
      sort_order: items.length,
    };
    try {
      await savePriorities(selectedDate, [...items, item]);
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
    const currentGroceries = groceriesRef.current;

    // Use the full capture engine that classifies into priorities, groceries, intentions, habits, journal
    try {
      const result = await classifyCapture(text);
      addLog(`Classified: ${result.priorities.length} tasks, ${result.groceries.length} grocery groups`);

      // Build priority items from classified priorities
      const newPriorityItems: PriorityItem[] = result.priorities.map((taskText, i) => ({
        id: crypto.randomUUID(),
        text: taskText,
        completed: false,
        sort_order: currentItems.length + i,
      }));

      // If no priorities were extracted but there's no groceries either, save raw text as a task
      if (newPriorityItems.length === 0 && result.groceries.length === 0) {
        newPriorityItems.push({
          id: crypto.randomUUID(),
          text,
          completed: false,
          sort_order: currentItems.length,
        });
      }

      // Save priorities
      if (newPriorityItems.length > 0) {
        const mergedItems = [...currentItems, ...newPriorityItems];
        await savePriorities(selectedDate, mergedItems);
        addLog(`Saved ${newPriorityItems.length} task(s)`);
      }

      // Save groceries if any were detected
      if (result.groceries.length > 0) {
        const newGroceryGroups: GroceryGroup[] = result.groceries.map((g) => ({
          id: crypto.randomUUID(),
          store: g.store || 'General',
          items: g.items.map((itemName) => ({
            id: crypto.randomUUID(),
            name: itemName,
            completed: false,
          })),
        }));

        // Merge with existing groceries — combine items for the same store
        const mergedGroceries = [...currentGroceries];
        for (const newGroup of newGroceryGroups) {
          const existingGroup = mergedGroceries.find(
            (g) => g.store.toLowerCase() === newGroup.store.toLowerCase()
          );
          if (existingGroup) {
            existingGroup.items = [...existingGroup.items, ...newGroup.items];
          } else {
            mergedGroceries.push(newGroup);
          }
        }

        await saveGroceries(selectedDate, mergedGroceries);
        const totalNewItems = newGroceryGroups.reduce((sum, g) => sum + g.items.length, 0);
        addLog(`Saved ${totalNewItems} grocery item(s)`);
      }

      setCapturedText('');
      liveText.current = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Capture engine failed: ${msg}, falling back to raw text`);

      // Fallback: save raw text as a single task
      try {
        const fallbackItem: PriorityItem = {
          id: crypto.randomUUID(),
          text,
          completed: false,
          sort_order: currentItems.length,
        };
        await savePriorities(selectedDate, [...currentItems, fallbackItem]);
        addLog('Saved raw text as task (fallback)');
        setCapturedText('');
        liveText.current = '';
      } catch (saveErr) {
        const saveMsg = saveErr instanceof Error ? saveErr.message : String(saveErr);
        setError(`Save failed: ${saveMsg}`);
        addLog(`Supabase save failed: ${saveMsg}`);
      }
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

      {/* Date picker strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {weekDates.map((date) => {
          const dateStr = toLocalDateStr(date);
          const { label, dateNum } = formatDateBubble(date, todayDateStr);
          const isSelected = dateStr === selectedDate;
          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={`flex flex-col items-center min-w-[52px] py-2 px-2 rounded-xl text-xs font-medium transition-colors ${
                isSelected
                  ? 'bg-primary text-white'
                  : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="text-[10px] uppercase">{label}</span>
              <span className="text-lg font-bold">{dateNum}</span>
            </button>
          );
        })}
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
                {item.completed && <span className="text-white text-xs font-bold">&#10003;</span>}
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
                    {item.completed && <span className="text-white text-[10px]">&#10003;</span>}
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
          <p className="text-4xl">&#127919;</p>
          <p className="text-text-secondary text-sm">No tasks for today yet.</p>
        </div>
      )}

      {/* Activity log -- visible debug panel */}
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
