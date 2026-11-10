import { BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motionOk } from '../motion';

/**
 * The first screen each time the app is opened: the name, the cat opening his eyes, and one round
 * button. Tapping it (or the cat) floods the screen with red, then the library appears.
 */
export function Welcome({ onStart }: { onStart: () => void }) {
  const [going, setGoing] = useState(false);

  // The strip behind the phone's clock takes the page colour, so the screen is one colour to the very top.
  useEffect(() => {
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const before = metas.map((m) => m.content);
    const ground = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (ground) for (const m of metas) m.content = going ? '#e8320e' : ground;
    return () => metas.forEach((m, i) => (m.content = before[i]));
  }, [going]);

  function start() {
    if (going) return;
    setGoing(true);
    window.setTimeout(onStart, motionOk() ? 650 : 0);
  }

  return (
    <main className={`hello${going ? ' go' : ''}`}>
      <h1 aria-label="YoomiRead">
        {['Yoomi', 'Read'].map((word, w) => (
          <span key={word} className="hello-word" aria-hidden="true">
            {[...word].map((letter, i) => (
              <span key={i} style={{ '--i': w * 5 + i } as React.CSSProperties}>
                {letter}
              </span>
            ))}
          </span>
        ))}
      </h1>
      <p className="hello-tag">Read any world</p>

      <button type="button" className="hello-cat" onClick={start} aria-label="Start reading">
        <span className="hello-moon" aria-hidden="true" />
        <img src={`/mascot/cat-closeup.${motionOk() ? 'gif' : 'png'}`} alt="" draggable={false} />
      </button>

      <button type="button" className="hello-start" onClick={start} aria-label="Tap to start reading">
        <i className="hello-halo" aria-hidden="true" />
        <i className="hello-halo late" aria-hidden="true" />
        <svg className="hello-ring" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <path id="hello-circle" d="M50 50 m-41 0 a41 41 0 1 1 82 0 a41 41 0 1 1 -82 0" />
          </defs>
          <text>
            <textPath href="#hello-circle">TAP TO READ · TAP TO READ · </textPath>
          </text>
        </svg>
        <span className="hello-core">
          <BookOpen size={30} strokeWidth={2.2} />
        </span>
      </button>
    </main>
  );
}
