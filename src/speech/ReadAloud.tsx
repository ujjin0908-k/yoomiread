import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Sheet } from '../components';
import { loadVoice, speak } from './engine';
import { asMedia, changeVoice, silenceUrl, loadReadAloud, pause, playerState, resume, skip, stop, subscribe, toWav, type ReadAloudSettings } from './player';
import { SAMPLE_LINE, VOICES, voiceById } from './voices';
import './speech.css';

/** The player's state, kept up to date in a component. */
export function usePlayer() {
  return useSyncExternalStore(subscribe, playerState);
}

/** The bar at the bottom of the reader while a chapter is read aloud. */
export function ReadAloudBar({ chapterId }: { chapterId: string }) {
  const p = usePlayer();
  const [picking, setPicking] = useState(false);
  const [prefs, setPrefs] = useState<ReadAloudSettings>();
  useEffect(() => {
    void loadReadAloud().then(setPrefs);
  }, [picking]);
  // Seconds spent getting ready or making the next piece, so slow is told apart from stuck.
  const busy = p.status === 'loading' || p.status === 'waiting';
  const [since, setSince] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setSince(Date.now());
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy, p.index]);
  const secs = busy && since ? Math.max(0, Math.round((Date.now() - since) / 1000)) : 0;
  if (p.status === 'idle' && !p.error) return null;
  if (p.chapterId && p.chapterId !== chapterId && p.status !== 'idle') return null;

  const voice = voiceById(prefs?.voice ?? '')?.name ?? 'Voice';
  const line =
    p.error ??
    (p.status === 'loading'
      ? p.download !== undefined
        ? `Getting the voice ready (first time only): ${Math.round(p.download * 100)}%`
        : `Getting the voice ready… ${secs} s`
      : p.status === 'waiting'
        ? `Making the voice… ${secs} s`
        : p.status === 'ended'
          ? 'End of the chapter'
          : `${voice} · ${prefs?.speed ?? 1}×${p.slow ? ' · this phone is slower than the voice, so it pauses' : ''}`);

  return (
    <>
      <div className="read-aloud" role="region" aria-label="Read aloud">
        <button type="button" className="round-btn plain" aria-label="Back one sentence" disabled={!p.total} onClick={() => skip(-1)}>
          <SkipBack size={18} />
        </button>
        {p.status === 'playing' || p.status === 'waiting' || p.status === 'loading' ? (
          <button type="button" className="round-btn" aria-label="Pause" onClick={pause}>
            <Pause size={20} />
          </button>
        ) : (
          <button type="button" className="round-btn" aria-label="Play" disabled={p.status === 'idle' || p.status === 'ended'} onClick={resume}>
            <Play size={20} />
          </button>
        )}
        <button type="button" className="round-btn plain" aria-label="Forward one sentence" disabled={!p.total} onClick={() => skip(1)}>
          <SkipForward size={18} />
        </button>
        <button type="button" className="read-aloud-line" onClick={() => setPicking(true)}>
          <span className={p.error ? 'warn small' : 'small'}>{line}</span>
          {p.total > 0 && !p.error && (
            <span className="muted small">
              {p.index + 1} / {p.total}
            </span>
          )}
        </button>
        <button type="button" className="round-btn plain" aria-label="Stop reading aloud" onClick={stop}>
          <X size={18} />
        </button>
      </div>
      {picking && <VoiceSheet onClose={() => setPicking(false)} />}
    </>
  );
}

const SPEEDS = [0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5];

/** Choose the voice and speed. Each voice can be heard first (it is made on the phone, so it takes a moment). */
export function VoiceSheet({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<ReadAloudSettings>();
  const [trying, setTrying] = useState('');
  const [error, setError] = useState('');
  const sample = useRef<HTMLAudioElement>();
  useEffect(() => {
    void loadReadAloud().then(setPrefs);
    return () => sample.current?.pause();
  }, []);

  async function tryVoice(id: string) {
    setTrying(id);
    setError('');
    // Unlock sound inside the tap.
    sample.current ??= new Audio();
    asMedia();
    sample.current.src = silenceUrl();
    void sample.current.play().catch(() => {});
    try {
      await loadVoice(!!prefs?.gpu);
      const { samples, rate } = await speak(SAMPLE_LINE, id, prefs?.speed ?? 1);
      sample.current.src = URL.createObjectURL(new Blob([toWav(samples, rate)], { type: 'audio/wav' }));
      await sample.current.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not play the sample.');
    } finally {
      setTrying('');
    }
  }

  async function choose(change: Partial<ReadAloudSettings>) {
    setPrefs((p) => (p ? { ...p, ...change } : p));
    await changeVoice(change);
  }

  if (!prefs) return null;
  return (
    <Sheet title="Voice" onClose={onClose}>
      <div className="form">
        <div className="filter-row" role="group" aria-label="Speed">
          <span className="filter-label">Speed</span>
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={`filter-chip${prefs.speed === s ? ' on' : ''}`} aria-pressed={prefs.speed === s} onClick={() => void choose({ speed: s })}>
              {s}×
            </button>
          ))}
        </div>
        <label className="row small">
          <input type="checkbox" className="switch" checked={prefs.autoNext} onChange={(e) => void choose({ autoNext: e.target.checked })} />
          <span>Go on to the next chapter</span>
        </label>
        <label className="row small">
          <input type="checkbox" className="switch" checked={!!prefs.gpu} onChange={(e) => void choose({ gpu: e.target.checked })} />
          <span>Use the graphics chip: faster on new iPhones, but a bigger download (about 330 MB). Turn it off if the voice stays silent. Takes effect after closing and reopening the app.</span>
        </label>
        <p className="muted small">The voice is Kokoro, made on this phone: free, and private. Grades are its makers' (A is best). Tap ▶ to hear one.</p>
        {error && <p className="warn small">{error}</p>}
        <ul className="voice-list">
          {VOICES.map((v) => (
            <li key={v.id} className={prefs.voice === v.id ? 'on' : undefined}>
              <button type="button" className="voice-pick" aria-pressed={prefs.voice === v.id} onClick={() => void choose({ voice: v.id })}>
                <b>{v.name}</b>
                <span className="muted small">
                  {v.accent} {v.gender.toLowerCase()} · {v.grade}
                </span>
              </button>
              <button type="button" className="round-btn plain" aria-label={`Hear ${v.name}`} disabled={!!trying} onClick={() => void tryVoice(v.id)}>
                {trying === v.id ? <span className="small">…</span> : <Play size={16} />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
