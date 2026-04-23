'use client';

// /notebooks/[slug] — same book-page experience as /journal, but
// locked to a single notebook. Arrived at by tapping a notebook card
// on /notebooks.

import { use } from 'react';
import BookPage from '@/components/journal/BookPage';

export default function NotebookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <BookPage lockedSlug={slug} backHref="/notebooks" />;
}
