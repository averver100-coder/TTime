import { useState, useEffect, useCallback } from 'react';

export interface BookmarkItem {
  type: 'teacher' | 'class';
  id: string; // teacher's name or classCode (e.g. '101')
  title: string; // Display title, e.g. '김가영' or '1학년 1반'
  subtitle?: string; // e.g. '1-1 담임' or '101'
  createdAt: number;
}

const STORAGE_KEY = 'ssamtime_bookmarks_v1';
const EVENT_NAME = 'ssamtime_bookmarks_updated';

// Helper to safely read from localStorage
const readBookmarksFromStorage = (): BookmarkItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.error('Failed to read bookmarks from localStorage:', err);
    return [];
  }
};

// Helper to safely write to localStorage
const writeBookmarksToStorage = (items: BookmarkItem[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: items }));
  } catch (err) {
    console.error('Failed to write bookmarks to localStorage:', err);
  }
};

export const useBookmarks = () => {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(() => readBookmarksFromStorage());

  useEffect(() => {
    // Initial sync
    setBookmarks(readBookmarksFromStorage());

    // Listen to in-app custom event
    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<BookmarkItem[]>;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setBookmarks(customEvent.detail);
      } else {
        setBookmarks(readBookmarksFromStorage());
      }
    };

    // Listen to browser storage event (across different tabs or windows)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setBookmarks(readBookmarksFromStorage());
      }
    };

    window.addEventListener(EVENT_NAME, handleCustomEvent);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(EVENT_NAME, handleCustomEvent);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const isBookmarked = useCallback(
    (type: 'teacher' | 'class', id: string): boolean => {
      return bookmarks.some(b => b.type === type && b.id === id);
    },
    [bookmarks]
  );

  const addBookmark = useCallback(
    (item: Omit<BookmarkItem, 'createdAt'>) => {
      const current = readBookmarksFromStorage();
      const existingIdx = current.findIndex(b => b.type === item.type && b.id === item.id);
      if (existingIdx >= 0) return false;

      const newItem: BookmarkItem = {
        ...item,
        createdAt: Date.now(),
      };
      const updated = [newItem, ...current];
      writeBookmarksToStorage(updated);
      setBookmarks(updated);
      return true;
    },
    []
  );

  const removeBookmark = useCallback(
    (type: 'teacher' | 'class', id: string) => {
      const current = readBookmarksFromStorage();
      const updated = current.filter(b => !(b.type === type && b.id === id));
      writeBookmarksToStorage(updated);
      setBookmarks(updated);
      return true;
    },
    []
  );

  const toggleBookmark = useCallback(
    (item: Omit<BookmarkItem, 'createdAt'>): boolean => {
      const current = readBookmarksFromStorage();
      const exists = current.some(b => b.type === item.type && b.id === item.id);
      if (exists) {
        removeBookmark(item.type, item.id);
        return false; // Removed
      } else {
        addBookmark(item);
        return true; // Added
      }
    },
    [addBookmark, removeBookmark]
  );

  const clearAllBookmarks = useCallback(() => {
    writeBookmarksToStorage([]);
    setBookmarks([]);
  }, []);

  const teacherBookmarks = bookmarks.filter(b => b.type === 'teacher');
  const classBookmarks = bookmarks.filter(b => b.type === 'class');

  return {
    bookmarks,
    teacherBookmarks,
    classBookmarks,
    isBookmarked,
    addBookmark,
    removeBookmark,
    toggleBookmark,
    clearAllBookmarks,
  };
};
