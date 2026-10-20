import { useRoute } from './hooks';
import { BookPage } from './pages/BookPage';
import { ChapterPage } from './pages/ChapterPage';
import { Library } from './pages/Library';
import { Settings } from './pages/Settings';

export function App() {
  const [page, id, sub] = useRoute();
  if (page === 'book' && id) return <BookPage key={id} id={id} finishing={sub === 'finish'} />;
  if (page === 'chapter' && id) return <ChapterPage key={id} id={id} />;
  if (page === 'settings') return <Settings />;
  return <Library />;
}
