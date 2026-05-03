'use client';

// Global mount point for the GratitudeSuggestionSheet. Sits in
// (app)/layout so the sheet can fire from ANY save surface (/journal,
// /write, /voice, the BookPage composer, etc.) without each page
// needing to mount its own observer. The journalStore exposes
// `pendingGratitudeSuggestion` which the post-structure callback in
// createEntry sets when Gemini returned excerpts and the user has
// the feature enabled.
//
// On Save: creates a NEW entry per accepted excerpt in the Gratitude
// system notebook, with metadata.source_entry_id pointing at the
// original. On Skip: just dismisses. Both clear the pending state.
// On first ever fire: also flips profile.gratitude_intro_seen → true
// so the explainer card stops appearing.

import { useMemo } from 'react';
import { useJournalStore } from '@/stores/journalStore';
import { useAuthStore, type Profile } from '@/stores/authStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useUiStore } from '@/stores/uiStore';
import { t } from '@/lib/translations';
import GratitudeSuggestionSheet from './GratitudeSuggestionSheet';

export default function GratitudeSuggestionMount() {
  const pending = useJournalStore((s) => s.pendingGratitudeSuggestion);
  const clear = useJournalStore((s) => s.clearGratitudeSuggestion);
  const createEntry = useJournalStore((s) => s.createEntry);
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const gratitudeId = useNotebookStore((s) => s.gratitudeId());
  const showToast = useUiStore((s) => s.showToast);

  const showIntro = useMemo(
    () => profile?.gratitude_intro_seen === false,
    [profile?.gratitude_intro_seen],
  );

  if (!pending || pending.excerpts.length === 0) return null;

  const markIntroSeen = async () => {
    if (showIntro) {
      // Fire-and-forget — local state already reflects via the
      // updateProfile cache; we don't gate the sheet's dismissal
      // on the network round-trip.
      updateProfile({ gratitude_intro_seen: true } as Partial<Profile>).catch(() => {});
    }
  };

  const handleSave = async (accepted: string[]) => {
    // Resolve the destination notebook. After 20260509 the gratitude
    // notebook is created on demand (no longer seeded), so it may be
    // null at this point if the user just enabled auto-detect for the
    // first time and hasn't opened the toggle path that promotes it.
    // Defensive auto-restore: ask notebookStore to ensure a system
    // gratitude notebook exists before writing.
    let destId = gratitudeId;
    if (!destId) {
      try {
        const nb = await useNotebookStore.getState().ensureGratitudeNotebook('system');
        destId = nb.id;
      } catch (err) {
        console.warn('[GratitudeSuggestionMount] could not materialize gratitude notebook', err);
        clear();
        return;
      }
    }
    // One Gratitude entry per accepted excerpt. Each carries a
    // backlink to the source via metadata.source_entry_id so a
    // future "open source" affordance can navigate without a
    // fragile text search.
    //
    // skipAutoDetect: the excerpt itself reads as gratitude language
    // (that's how it got selected), so without this flag the
    // structureEntry → gratitude detector would re-detect it and pop
    // a second suggestion sheet over the new entry → user accepts →
    // duplicate row in Gratitude. Bug 1 fix.
    for (const excerpt of accepted) {
      try {
        await createEntry(
          {
            entry_type: 'freeform',
            content_text: excerpt,
            notebook_id: destId,
            word_count: excerpt.split(/\s+/).filter(Boolean).length,
            metadata: {
              source_entry_id: pending.sourceEntryId,
              kind: 'gratitude_extract',
            },
          },
          { skipAutoDetect: true },
        );
      } catch (err) {
        console.warn('[GratitudeSuggestionMount] failed to save excerpt', err);
      }
    }
    if (accepted.length > 0) {
      showToast(t('gratitude.savedToast'), 'success');
    }
    await markIntroSeen();
    clear();
  };

  const handleSkip = async () => {
    await markIntroSeen();
    clear();
  };

  return (
    <GratitudeSuggestionSheet
      excerpts={pending.excerpts}
      showIntro={showIntro}
      onSave={handleSave}
      onSkip={handleSkip}
      onClose={handleSkip}
    />
  );
}
