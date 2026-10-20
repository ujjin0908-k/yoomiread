import { useRoute } from './hooks';
import { BookPage } from './pages/BookPage';
import { ChapterPage } from './pages/ChapterPage';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { QuoteCard, Quotes } from './pages/Quotes';
import { Settings } from './pages/Settings';
import { Stats } from './pages/Stats';

export function App() {
  const [page, id, sub] = useRoute();
  if (page === 'book' && id) return <BookPage key={id} id={id} sub={sub} />;
  if (page === 'chapter' && id) return <ChapterPage key={id} id={id} />;
  if (page === 'quote' && id) return <QuoteCard id={id} />;
  if (page === 'library') return <Library />;
  if (page === 'quotes') return <Quotes />;
  if (page === 'stats') return <Stats />;
  if (page === 'settings') return <Settings />;
  return <Home />;
}
