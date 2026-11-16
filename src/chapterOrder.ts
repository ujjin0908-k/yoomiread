import { useEffect, useState } from 'react';

/**
 * Which way a book's chapter lists run: start to end, or end to start (newest first), remembered per book on this
 * phone. The book page and the reader's chapter list share it.
 */
export type ChapterOrder = 'start' | 'end';
const key = (bookId: string) => `yoomiread.order.${bookId}`;
const listeners = new Set<() => void>();

function read(bookId: string): ChapterOrder {
  try {
    return localStorage.getItem(key(bookId)) === 'end' ? 'end' : 'start';
  } catch {
    return 'start';
  }
}

export function useChapterOrder(bookId: string | undefined): [ChapterOrder, (o: ChapterOrder) => void] {
  const [order, setOrder] = useState<ChapterOrder>(() => (bookId ? read(bookId) : 'start'));
  useEffect(() => {
    if (!bookId) return;
    setOrder(read(bookId));
    const update = () => setOrder(read(bookId));
    listeners.add(update);
    return () => void listeners.delete(update);
  }, [bookId]);
  return [
    order,
    (o) => {
      if (!bookId) return;
      try {
        localStorage.setItem(key(bookId), o);
      } catch {
        // Private mode: the choice lasts for this visit.
      }
      setOrder(o);
      listeners.forEach((l) => l());
    },
  ];
}

/** The list in the chosen order (a copy; the original stays start to end). */
export function inOrder<T>(list: T[], order: ChapterOrder): T[] {
  return order === 'end' ? [...list].reverse() : list;
}
