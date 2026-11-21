import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Sheet } from '../components';
import { changeVoice, englishVoices, loadReadAloud, loadVoices, pause, playerState, resume, sayOnce, skip, stop, subscribe, voiceRank, type ReadAloudSettings } from './player';
import './speech.css';

/** What a voice says when tried out in the picker. */
const SAMPLE_LINE = "My name is Cheng Shi, and I never lie. You just haven't been fooled by me yet.";

/** The player's state, kept up to date in a component. */
export function usePlayer() {
  return useSyncExternalStore(subscribe, playerState);
}

/** A voice's name without the quality tag, and the tag on its own. */
function voiceLabel(v: SpeechSynthesisVoice): { name: string; tag: string } {
  const rank = voiceRank(v);
  return { name: v.name.replace(/\s*\((premium|enhanced)\)\s*/i, ''), tag: rank === 0 ? 'Premium' : rank === 1 ? 'Enhanced' : 'Standard' };
}

/** The bar at the bottom of the reader while a chapter is read aloud. */
export function ReadAloudBar({ chapterId }: { chapterId: string }) {
  const p = usePlayer();
  const [picking, setPicking] = useState(false);
  const [prefs, setPrefs] = useState<ReadAloudSettings>();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    void loadReadAloud().then(setPrefs);
    void loadVoices().then(setVoices);
  }, [picking]);
  if (p.status === 'idle' && !p.error) return null;
  if (p.chapterId && p.chapterId !== chapterId && p.status !== 'idle') return null;

  const english = englishVoices(voices);
  const voice = english.find((v) => v.voiceURI === prefs?.voice) ?? english[0];
  const line = p.error ?? (p.status === 'ended' ? 'End of the chapter' : `${voice ? voiceLabel(voice).name : 'Voice'} · ${prefs?.speed ?? 1}×`);

  return (
    <>
      <div className="read-aloud" role="region" aria-label="Read aloud">
        <button type="button" className="round-btn plain" aria-label="Back one sentence" disabled={!p.total} onClick={() => skip(-1)}>
          <SkipBack size={18} />
        </button>
        {p.status === 'playing' ? (
          <button type="button" className="round-btn" aria-label="Pause" onClick={pause}>
            <Pause size={20} />
          </button>
        ) : (
          <button type="button" className="round-btn" aria-label="Play" disabled={p.status !== 'paused'} onClick={resume}>
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
              {p.index + 1} / {p.total} · tap for voices
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

/** Choose the voice and speed from the phone's own English voices. Each can be heard first. */
export function VoiceSheet({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<ReadAloudSettings>();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>();
  useEffect(() => {
    void loadReadAloud().then(setPrefs);
    void loadVoices().then((all) => setVoices(englishVoices(all)));
  }, []);

  async function choose(change: Partial<ReadAloudSettings>) {
    setPrefs((p) => (p ? { ...p, ...change } : p));
    await changeVoice(change);
  }

  if (!prefs) return null;
  // A saved voice that is no longer listed (a novelty voice) counts as the first one, which is what plays.
  const chosen = voices?.some((v) => v.voiceURI === prefs.voice) ? prefs.voice : voices?.[0]?.voiceURI;
  const good = (voices ?? []).filter((v) => voiceRank(v) < 2).length;
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
        <p className="muted small">
          These are the voices on this phone. {good ? '' : 'Only standard voices are here so far. '}For much better ones, open the iPhone's Settings →
          Accessibility → Read & Speak (Spoken Content on older iOS) → Voices → English, and download a Premium or Enhanced voice (Ava, Zoe, Evan,
          Nathan…). Then close and reopen YoomiRead, and it shows up here at the top.
        </p>
        {voices === undefined ? (
          <p className="muted small">Looking for voices…</p>
        ) : !voices.length ? (
          <p className="warn small">No English voices were found on this phone.</p>
        ) : (
          <ul className="voice-list">
            {voices.map((v) => {
              const { name, tag } = voiceLabel(v);
              return (
                <li key={v.voiceURI} className={chosen === v.voiceURI ? 'on' : undefined}>
                  <button type="button" className="voice-pick" aria-pressed={chosen === v.voiceURI} onClick={() => void choose({ voice: v.voiceURI })}>
                    <b>{name}</b>
                    <span className="muted small">
                      {tag} · {v.lang}
                    </span>
                  </button>
                  <button type="button" className="round-btn plain" aria-label={`Hear ${name}`} onClick={() => sayOnce(SAMPLE_LINE, v.voiceURI, prefs.speed)}>
                    <Play size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
