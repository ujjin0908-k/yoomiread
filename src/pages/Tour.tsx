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

const STEPS: { cat: string; title: string; text: string }[] = [
  {
    cat: 'happy',
    title: 'Bring your books',
    text: 'Import a PDF or ePub, paste a chapter, or write down a book you read somewhere else. Your books stay on this phone and work offline.',
  },
  {
    cat: 'idle',
    title: 'Read with a little help',
    text: 'Tap a word for the dictionary. Highlight lines, keep notes and comments on chapters, and see your quotes and reading time add up.',
  },
  {
    cat: 'high',
    title: 'A world that grows as you read',
    text: 'Who is who, how they are linked, where things happen and what happened when. It only ever shows what you have reached, so nothing is spoiled.',
  },
  {
    cat: 'working',
    title: 'Translate when you want to',
    text: 'Chinese novels can be translated into English with names kept the same in every chapter. This uses AI, which you set up in Settings. Everything else works without it.',
  },
];

/**
 * The tour for someone new: four short cards after the welcome screen, shown once, and only while the library is
 * empty. It ends with the free sample book or the reader's own.
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
      <img key={s.cat} className="tour-cat" src={`/mascot/cat-${s.cat}.${ext}`} alt="" width={200} height={200} draggable={false} />
      <h1>{s.title}</h1>
      <p className="tour-text">{s.text}</p>
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
