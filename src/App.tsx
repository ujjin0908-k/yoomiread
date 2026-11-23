import { useRoute } from './hooks';
import { JoinPage } from './buddy/JoinPage';
import { BookPage } from './pages/BookPage';
import { ChapterPage } from './pages/ChapterPage';
import { CharacterPage } from './pages/Character';
import { GlossaryPage } from './pages/Glossary';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { BookQuotesPage, QuoteCard } from './pages/Quotes';
import { Ask } from './pages/Ask';
import { WrappedPage } from './pages/Wrapped';
import { Settings } from './pages/Settings';
import { Stats } from './pages/Stats';
import { Welcome } from './pages/Welcome';
import { showTour, Tour } from './pages/Tour';
import { WorldPage } from './pages/World';
import { useEffect, useState } from 'react';
import { rememberAhead } from './hooks';
import { aiSpent, allBooks, allChapters, allQuotes, statsInput } from './queries';
import { animatePage, markIntent } from './motion';


export function App() {
  const [page, id, sub] = useRoute();
  // The first page shows every time the app is opened, then the app opens as usual.
  const [welcomed, setWelcomed] = useState(false);
  // The tour, once, for someone new (see showTour), or again when asked for in Settings.
  const [touring, setTouring] = useState<'check' | 'show' | 'no'>('check');
  const [addOwn, setAddOwn] = useState(false);
  useEffect(() => {
    void (async () => {
      setTouring((await showTour()) ? 'show' : 'no');
    })();
  }, []);
  // A head start for the tabs: their data is read once while nothing else is happening, so each opens complete.
  useEffect(() => {
    const idle = typeof window.requestIdleCallback === 'function';
    const later = (fn: () => void): number => (idle ? window.requestIdleCallback(fn, { timeout: 3000 }) : window.setTimeout(fn, 1500));
    const id = later(() => {
      void (async () => {
        await rememberAhead('books', allBooks);
        await rememberAhead('chapters', allChapters);
        await rememberAhead('stats-input', statsInput);
        await rememberAhead('spent', aiSpent);
        await rememberAhead('quotes', allQuotes);
      })();
    });
    return () => (idle ? window.cancelIdleCallback(id) : window.clearTimeout(id));
  }, []);
  if (page === 'book' && id) return <BookPage key={id} id={id} sub={sub} />;
  if (page === 'chapter' && id) return <ChapterPage key={id} id={id} />;
  if (page === 'quote' && id) return <QuoteCard id={id} />;
  if (page === 'quotes' && id) return <BookQuotesPage key={id} bookId={id} />;
  if (page === 'glossary' && id) return <GlossaryPage key={id} bookId={id} />;
  if (page === 'character' && id) return <CharacterPage key={id} id={id} />;
  if (page === 'world' && id) return <WorldPage key={id} bookId={id} tab={sub} />;
  if (page === 'join' && id) return <JoinPage code={id} />;
  if (page === 'library') return <Library />;
  if (page === 'ask') return <Ask />;
  // The old Quotes tab: quotes are on each book's page now.
  if (page === 'quotes') return <Library />;
  if (page === 'stats') return <Stats />;
  if (page === 'wrapped') return <WrappedPage key={id} id={id} />;
  if (page === 'settings') return <Settings />;
  if (!welcomed) {
    return (
      <Welcome
        onStart={() => {
          markIntent();
          animatePage('open', () => setWelcomed(true));
        }}
      />
    );
  }
  if (touring === 'show') {
    return (
      <Tour
        onDone={(own) => {
          setAddOwn(!!own);
          setTouring('no');
        }}
      />
    );
  }
  return <Home openAdd={addOwn} />;
}
