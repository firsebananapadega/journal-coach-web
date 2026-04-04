'use client';

import { useEffect, useState } from 'react';
import { usePriorityStore, type PriorityItem } from '@/stores/priorityStore';
import { toLocalDateStr } from '@/lib/dateUtils';

export default function PrioritiesPage() {
  const today = toLocalDateStr(new Date());
  const { items, groceries, fetchPriorities, savePriorities, toggleItem, toggleGroceryItem, loading } = usePriorityStore();
  const [newItem, setNewItem] = useState('');

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

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Priorities</h1>
        <p className="text-sm text-text-secondary mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Add new priority */}
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
        !loading && (
          <div className="text-center py-12 space-y-2">
            <p className="text-4xl">🎯</p>
            <p className="text-text-secondary text-sm">No priorities for today yet.</p>
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
