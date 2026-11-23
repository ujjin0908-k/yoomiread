import { Check } from 'lucide-react';
import { useState } from 'react';
import { db } from '../db';
import { go } from '../hooks';
import { motionOk } from '../motion';

const KEY = 'tourSeen';

/**
 * Whether to show the tour when the app opens: always when asked for again from Settings; otherwise only on a device
 * that never saw it and has no books yet (so someone who already uses the app is never shown it).
 */
export async function showTour(): Promise<boolean> {
  try {
    const value = (await db.settings.get(KEY))?.value;
    if (value === 'again') return true;
    return !value && (await db.books.count()) === 0;
  } catch {
    return false;
  }
}

/** Marks the tour seen, or asks for it again the next time the app opens. */
export async function setTourSeen(seen: boolean): Promise<void> {
  await db.settings.put({ key: KEY, value: seen ? true : 'again' });
}

/**
 * The cat pitches the app: what he says in his bubble, a title, and three selling points. Everything he claims is
 * something the app does (checked against the code when written, 2026-11-23).
 */
const STEPS: { cat: string; says: string; title: string; points: string[] }[] = [
  {
    cat: 'closeup',
    says: 'Oh. A reader. Excellent. I run this library. Give me thirty seconds and I will show you why you need me.',
    title: 'Your reading companion',
    points: ['Every book, every name, every place, kept for you', 'Works offline, on your phone', 'No account needed to start'],
  },
  {
    cat: 'happy',
    says: 'Bring me anything. Fan fiction, light novels, that PDF you have been meaning to read. I sort it all.',
    title: 'Bring any book',
    points: [
      'PDF and ePub, with covers, titles and chapters filled in',
      'AO3 fan works arrive with their tags, cast and ships already sorted',
      'Paste a chapter, or start with a free classic',
    ],
  },
  {
    cat: 'high',
    says: 'Forgot who that is? Ask me. I know everyone you have met so far, and I never tell what happens next.',
    title: 'The world, without spoilers',
    points: [
      'Who is who and how they are linked, as a web',
      'Places on a map, events on a timeline, a recap when you come back',
      'Ask the cat about the story: only from the pages you have read',
    ],
  },
  {
    cat: 'working',
    says: 'Six languages. I read them all, and I am very good at names.',
    title: 'Read across languages',
    points: [
      'Translate novels from Chinese, Japanese or Korean into English, Spanish or French',
      'Names stay the same in every chapter, thanks to the glossary',
      'Tap any word for its meaning, like Kindle: offline in four languages',
    ],
  },
  {
    cat: 'idle',
    says: 'You read. I take notes. It is a very good arrangement.',
    title: 'Your reading life, kept',
    points: ['Highlights, notes, quotes and reviews', 'Reading streaks, minutes and stats that add up', 'Backups, and sync across your devices when you sign in'],
  },
  {
    cat: 'happy',
    says: 'Shall we? I suggest the one about a wizard. I may be biased.',
    title: 'Let’s read',
    points: ['The Wonderful Wizard of Oz is free and ready, guide included', 'Or bring your own book', 'AI features are optional: everything else works without them'],
  },
];

/**
 * The tour for someone new: the cat pitches the app in six short cards after the welcome screen, shown once, and only
 * while the library is empty. It ends with the free sample book or the reader's own.
 */
export function Tour({ onDone }: { onDone: (addOwn?: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState('');
  const last = step === STEPS.length - 1;
  const s = STEPS[step];
  const ext = motionOk() ? 'gif' : 'png';

  async function finish(then?: 'sample' | 'own') {
    await setTourSeen(true).catch(() => undefined);
    if (then === 'sample') {
      setBusy('Adding the sample…');
      try {
        const { addSampleBook } = await import('../sample');
        const id = await addSampleBook();
        onDone();
        go(`book/${id}`);
      } catch (e) {
        setBusy(e instanceof Error ? e.message : 'The sample book could not be added.');
      }
      return;
    }
    onDone(then === 'own');
  }

  return (
    <main className="tour" aria-live="polite">
      <button type="button" className="link tour-skip" onClick={() => void finish()}>
        Skip
      </button>
      <div className="tour-speaker" key={step}>
        <img className="tour-cat" src={`/mascot/cat-${s.cat}.${ext}`} alt="" width={160} height={160} draggable={false} />
        <p className="tour-says" aria-label={`The cat says: ${s.says}`}>
          {s.says}
        </p>
      </div>
      <h1>{s.title}</h1>
      <ul className="tour-points">
        {s.points.map((point) => (
          <li key={point}>
            <Check size={18} strokeWidth={2.6} aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <div className="tour-dots" role="tablist" aria-label="Tour">
        {STEPS.map((x, i) => (
          <button
            key={x.title}
            type="button"
            role="tab"
            aria-selected={i === step}
            aria-label={`${i + 1} of ${STEPS.length}: ${x.title}`}
            className={i === step ? 'on' : ''}
            onClick={() => setStep(i)}
          />
        ))}
      </div>
      <div className="tour-actions">
        {last ? (
          <>
            <button type="button" className="btn primary wide" disabled={busy === 'Adding the sample…'} onClick={() => void finish('sample')}>
              {busy === 'Adding the sample…' ? busy : 'Try the free sample book'}
            </button>
            <button type="button" className="btn wide" onClick={() => void finish('own')}>
              Add my own book
            </button>
            {busy && busy !== 'Adding the sample…' && <p className="warn small center">{busy}</p>}
          </>
        ) : (
          <button type="button" className="btn primary wide" onClick={() => setStep(step + 1)}>
            Next
          </button>
        )}
      </div>
    </main>
  );
}
