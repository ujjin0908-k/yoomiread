import { ImagePlus } from 'lucide-react';
import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { db } from './db';
import { useLive } from './hooks';
import { shrinkImage } from './images';
import { toPicture, usePictureUrl, type Picture } from './picture';
import { newId } from './logic';
import type { Shelf } from './types';

/**
 * Stickers the owner places on the shelf pockets in the Library.
 * The drawings are our own (made here in code) plus the cat; a photo from the phone can be a sticker too.
 * Saved on this phone only, next to the other device settings.
 */
export interface PlacedSticker {
  id: string;
  shelf: Shelf;
  kind: string;
  /** Where its middle sits on the pocket, 0 to 1 across and down. */
  x: number;
  y: number;
  /** Tilt in degrees. */
  rot: number;
  /** For kind "photo": the picture, shrunk. */
  photo?: Picture;
}

const KEY = 'stickers';
/** More than this on one small pocket hides the covers. */
export const MAX_PER_POCKET = 8;

const svg = (children: ReactNode, viewBox = '0 0 24 24') => (
  <svg viewBox={viewBox} width="100%" height="100%" aria-hidden="true">
    {children}
  </svg>
);

export const STICKERS: { kind: string; label: string; art: ReactNode }[] = [
  { kind: 'cat', label: 'Reading cat', art: <img src="/mascot/cat-idle.png" alt="" draggable={false} /> },
  { kind: 'cat-dance', label: 'Dancing cat', art: <img src="/mascot/cat-happy.png" alt="" draggable={false} /> },
  {
    kind: 'star',
    label: 'Star',
    art: svg(<path d="M12 1l3.2 6.9 7.5.9-5.500 5.200 1.400 7.500L12 17.800 5.400 21.500l1.400-7.500L1.300 8.800l7.500-.9z" fill="#ffd23f" />),
  },
  {
    kind: 'heart',
    label: 'Heart',
    art: svg(
      <>
        <path d="M50 88C12 62 0 42 0 26 0 11 11 2 26 2c11 0 20 6 24 15C54 8 63 2 74 2c15 0 26 9 26 24 0 16-12 36-50 62Z" fill="#4a7fe0" />
        <path d="M50 70C26 54 18 42 18 32c0-9 7-15 15-15 7 0 13 4 17 10 4-6 10-10 17-10 8 0 15 6 15 15 0 10-8 22-32 38Z" fill="#c3b3f2" />
      </>,
      '0 0 100 90',
    ),
  },
  { kind: 'moon', label: 'Moon', art: svg(<path d="M20 14.500A8.500 8.500 0 1 1 9.500 4a7 7 0 0 0 10.500 10.500z" fill="#fff3c4" stroke="#14121f" strokeWidth="1.200" />) },
  { kind: 'spark', label: 'Sparkle', art: svg(<path d="M12 1l2.400 8.600L23 12l-8.600 2.400L12 23l-2.400-8.600L1 12l8.600-2.400z" fill="#ff9ecb" />) },
  {
    kind: 'flower',
    label: 'Flower',
    art: svg(
      <>
        <g fill="#b79cff">
          <circle cx="12" cy="5.500" r="4" />
          <circle cx="18.200" cy="10" r="4" />
          <circle cx="15.800" cy="17.300" r="4" />
          <circle cx="8.200" cy="17.300" r="4" />
          <circle cx="5.800" cy="10" r="4" />
        </g>
        <circle cx="12" cy="12" r="3.400" fill="#ffd23f" />
      </>,
    ),
  },
  { kind: 'bolt', label: 'Lightning', art: svg(<path d="M14 1L4 14h6l-1.500 9L19 9.500h-6.500z" fill="#c8f560" stroke="#14121f" strokeWidth="1.200" strokeLinejoin="round" />) },
  { kind: 'flame', label: 'Flame', art: svg(<path d="M12 1c1 4 6 6 6 12a6 6 0 0 1-12 0c0-2 1-3.500 2-4.500C8.500 11 10 11 10.500 9 11 7 11 4 12 1z" fill="#ff8a5c" />) },
  {
    kind: 'cloud',
    label: 'Cloud',
    art: svg(<path d="M6.500 19a4.500 4.500 0 0 1-.6-8.960A6 6 0 0 1 17.500 9 5 5 0 0 1 18 19z" fill="#ffffff" stroke="#14121f" strokeWidth="1.200" />),
  },
  { kind: 'read', label: 'READ stamp', art: <b className="stk-stamp">READ</b> },
  { kind: 'love', label: 'LOVED stamp', art: <b className="stk-stamp stk-stamp-red">LOVED</b> },
];

export function useStickers(): PlacedSticker[] {
  return useLive(async () => ((await db.settings.get(KEY))?.value as PlacedSticker[] | undefined) ?? [], [], 'stickers') ?? [];
}

async function change(update: (all: PlacedSticker[]) => PlacedSticker[]): Promise<void> {
  const all = ((await db.settings.get(KEY))?.value as PlacedSticker[] | undefined) ?? [];
  await db.settings.put({ key: KEY, value: update(all) });
}

/** Puts a new sticker on a shelf's pocket, a little off centre and tilted, so several do not stack exactly. */
export function addSticker(shelf: Shelf, kind: string, photo?: Picture): Promise<void> {
  const jitter = () => (Math.random() - 0.5) * 0.3;
  return change((all) =>
    all.filter((s) => s.shelf === shelf).length >= MAX_PER_POCKET
      ? all
      : [...all, { id: newId(), shelf, kind, x: 0.5 + jitter(), y: 0.6 + jitter() * 0.5, rot: Math.round((Math.random() - 0.5) * 30), photo }],
  );
}

function Art({ sticker }: { sticker: PlacedSticker }) {
  const url = usePictureUrl(sticker.photo);
  if (sticker.kind === 'photo') return url ? <img className="stk-photo" src={url} alt="" draggable={false} /> : null;
  return <>{STICKERS.find((s) => s.kind === sticker.kind)?.art}</>;
}

/**
 * The stickers on one pocket. While editing they can be dragged about; dragged off the pocket, a sticker is removed.
 * When not editing they are only pictures, so a tap still opens the pocket underneath.
 */
export function StickerLayer({ shelf, stickers, editing }: { shelf: Shelf; stickers: PlacedSticker[]; editing: boolean }) {
  const layer = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; off: boolean }>();

  function place(e: PointerEvent, id: string) {
    const box = layer.current!.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    // "Off" once its middle is clearly outside the pocket: letting go there removes it.
    const off = x < -0.12 || x > 1.12 || y < -0.15 || y > 1.15;
    setDrag({ id, x, y, off });
    return { x, y, off };
  }

  return (
    <div ref={layer} className={`stk-layer${editing ? ' editing' : ''}`}>
      {stickers
        .filter((s) => s.shelf === shelf)
        .map((s) => {
          const at = drag?.id === s.id ? drag : s;
          return (
            <span
              key={s.id}
              className={`stk${drag?.id === s.id ? ' held' : ''}${drag?.id === s.id && drag.off ? ' off' : ''}`}
              style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, transform: `translate(-50%, -50%) rotate(${s.rot}deg)` }}
              onPointerDown={(e) => {
                if (!editing) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                place(e, s.id);
              }}
              onPointerMove={(e) => drag?.id === s.id && place(e, s.id)}
              onPointerUp={(e) => {
                if (drag?.id !== s.id) return;
                const end = place(e, s.id);
                setDrag(undefined);
                void change((all) =>
                  end.off
                    ? all.filter((x) => x.id !== s.id)
                    : all.map((x) => (x.id === s.id ? { ...x, x: Math.min(1, Math.max(0, end.x)), y: Math.min(1, Math.max(0, end.y)) } : x)),
                );
              }}
              onPointerCancel={() => setDrag(undefined)}
            >
              <Art sticker={s} />
            </span>
          );
        })}
    </div>
  );
}

/** The row of stickers to choose from, shown above the tab bar while placing stickers. */
export function StickerTray({ shelf, shelfLabel, count, onDone }: { shelf: Shelf; shelfLabel: string; count: number; onDone: () => void }) {
  const [error, setError] = useState('');
  const full = count >= MAX_PER_POCKET;
  return (
    <div className="stk-tray glass" role="region" aria-label="Stickers">
      <div className="stk-tray-head">
        <span>
          <b>Stickers for {shelfLabel}</b>
          <span className="muted small">
            {error || (full ? ' This pocket is full. Drag one off to make room.' : ' Tap to add. Drag to place. Drag off the pocket to remove.')}
          </span>
        </span>
        <button type="button" className="pill-btn small" onClick={onDone}>
          Done
        </button>
      </div>
      <div className="stk-row">
        <label className={`stk-pick stk-add${full ? ' disabled' : ''}`} aria-label="Use a photo as a sticker">
          <ImagePlus size={22} />
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={full}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setError('');
              shrinkImage(f, 240)
                .then(async (photo) => addSticker(shelf, 'photo', await toPicture(photo)))
                .catch((err) => setError(err instanceof Error ? ` ${err.message}` : ' Could not read that image.'));
            }}
          />
        </label>
        {STICKERS.map((s) => (
          <button key={s.kind} type="button" className="stk-pick" aria-label={s.label} disabled={full} onClick={() => void addSticker(shelf, s.kind)}>
            {s.art}
          </button>
        ))}
      </div>
    </div>
  );
}
