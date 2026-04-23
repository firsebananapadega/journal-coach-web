'use client';

// /journal — the book-page experience. Sprint 2 upgrade: continuous
// scroll of entries grouped by day (latest on top), editable
// composer card at the top, notebook selector in the top bar.
// Sprint 1's save-and-redirect flow is replaced by an in-place
// scroll feed.

import BookPage from '@/components/journal/BookPage';

export default function JournalPage() {
  // Notebook selector lets the user switch between their notebooks
  // in place. Defaults to 'journal' (the system notebook every user
  // has after Sprint 2's backfill).
  return <BookPage />;
}
