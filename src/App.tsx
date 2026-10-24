import { useRoute } from './hooks';
import { BookPage } from './pages/BookPage';
import { ChapterPage } from './pages/ChapterPage';
import { GlossaryPage } from './pages/Glossary';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { QuoteCard, Quotes } from './pages/Quotes';
import { Settings } from './pages/Settings';
import { Stats } from './pages/Stats';
import { Welcome } from './pages/Welcome';
import { useState } from 'react';

const WELCOMED = 'yoomiread.welcomed';

function readWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED) === '1';
  } catch {
    return false;
  }
}

export function App() {
  const [page, id, sub] = useRoute();
  const [welcomed, setWelcomed] = useState(readWelcomed);
  if (page === 'book' && id) return <BookPage key={id} id={id} sub={sub} />;
  if (page === 'chapter' && id) return <ChapterPage key={id} id={id} />;
  if (page === 'quote' && id) return <QuoteCard id={id} />;
  if (page === 'glossary' && id) return <GlossaryPage key={id} bookId={id} />;
  if (page === 'library') return <Library />;
  if (page === 'quotes') return <Quotes />;
  if (page === 'stats') return <Stats />;
  if (page === 'settings') return <Settings />;
  if (!welcomed) {
    return (
      <Welcome
        onStart={() => {
          try {
            localStorage.setItem(WELCOMED, '1');
          } catch {
            // Private mode: the welcome shows again next time.
          }
          setWelcomed(true);
        }}
      />
    );
  }
  return <Home />;
}
