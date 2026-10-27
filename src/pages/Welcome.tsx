import { BookOpen, Languages, PenLine } from 'lucide-react';

const POINTS = [
  { icon: BookOpen, text: 'Read your own books, chapter by chapter' },
  { icon: Languages, text: 'Translate Chinese novels, with names kept consistent' },
  { icon: PenLine, text: 'Keep your highlights, notes and reviews on this phone' },
];

/** The first screen: shown once, on the first visit, then the app opens as usual. */
export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <main className="welcome">
      <img className="welcome-scene" src="/welcome.jpg" alt="" />
      <h1>YoomiRead</h1>
      <p>Read any world</p>
      <ul className="welcome-points">
        {POINTS.map(({ icon: Icon, text }) => (
          <li key={text}>
            <Icon size={20} aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onStart}>
        Start reading
      </button>
    </main>
  );
}
