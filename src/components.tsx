import { BarChart3, ChevronLeft, Home, LibraryBig, Quote, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useObjectUrl } from './images';
import { motionOk } from './motion';
import type { Book } from './types';

export function Stars({ value, onChange, size = 'md' }: { value?: number; onChange?: (v: number) => void; size?: 'sm' | 'md' }) {
  const v = value ?? 0;
  return (
    <span className={`stars stars-${size}`} role={onChange ? 'radiogroup' : 'img'} aria-label={`${v} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = v >= i ? 'full' : v >= i - 0.5 ? 'half' : 'empty';
        const star = <span className={`star star-${fill}`}>★</span>;
        if (!onChange) return <span key={i}>{star}</span>;
        // Tap once for a full star, tap the same star again for a half star.
        return (
          <button
            key={i}
            type="button"
            className="star-btn"
            aria-label={`${i} stars`}
            onClick={() => onChange(v === i ? i - 0.5 : i)}
          >
            {star}
          </button>
        );
      })}
    </span>
  );
}

/**
 * A sheet that rises from the bottom. It slides away when closed, and can be dragged down by its top edge.
 * `locked` keeps it open (while a translation is running, for example).
 */
export function Sheet({ title, onClose, locked, children }: { title: string; onClose: () => void; locked?: boolean; children: ReactNode }) {
  const [closing, setClosing] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; moved: number }>();
  const latest = useRef({ onClose, locked });
  latest.current = { onClose, locked };

  const close = useCallback(() => {
    if (latest.current.locked) return;
    if (motionOk()) setClosing(true);
    else latest.current.onClose();
  }, []);

  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => latest.current.onClose(), 200);
    return () => window.clearTimeout(t);
  }, [closing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  function dragStart(e: PointerEvent<HTMLDivElement>) {
    if (locked || (e.target as HTMLElement).closest('button, a, input')) return;
    drag.current = { y: e.clientY, moved: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function dragMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !sheet.current) return;
    drag.current.moved = Math.max(0, e.clientY - drag.current.y);
    sheet.current.style.transition = 'none';
    sheet.current.style.transform = `translateY(${drag.current.moved}px)`;
  }
  function dragEnd() {
    if (!drag.current || !sheet.current) return;
    const far = drag.current.moved > 90;
    drag.current = undefined;
    sheet.current.style.transition = '';
    if (far) close();
    else sheet.current.style.transform = '';
  }

  return (
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} onClick={close}>
      <div ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
          <div className="sheet-grip" aria-hidden="true" />
          <div className="sheet-head">
            <h2>{title}</h2>
            <button type="button" className="round-btn" aria-label="Close" onClick={close}>
              <X size={18} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Top bar for inner pages: round back button, centered title, actions on the right. */
export function TopBar({ back, title, right, away }: { back: string; title?: string; right?: ReactNode; away?: boolean }) {
  return (
    <header className={`topbar${away ? ' away' : ''}`}>
      <a className="round-btn" href={`#/${back}`} aria-label="Back">
        <ChevronLeft size={20} />
      </a>
      <span className="topbar-title">{title}</span>
      <div className="topbar-right">{right}</div>
    </header>
  );
}

/** Big serif page title used on the tab pages. */
export function PageTitle({ title, sub, right, icon }: { title: string; sub?: string; right?: ReactNode; icon?: boolean }) {
  return (
    <header className="page-title">
      {icon && <img className="app-icon" src="/icon-192.png" alt="" width={52} height={52} />}
      <div className="page-title-text">
        <h1>
          {title}
          <i className="dot" aria-hidden="true">
            .
          </i>
        </h1>
        {sub && <p>{sub}</p>}
      </div>
      {right}
    </header>
  );
}

const TABS = [
  { href: '', label: 'Home', icon: Home },
  { href: 'library', label: 'Library', icon: LibraryBig },
  { href: 'quotes', label: 'Quotes', icon: Quote },
  { href: 'stats', label: 'Stats', icon: BarChart3 },
];

// Remembered between pages, so the marker slides from the tab you left to the one you opened.
let lastTab = 0;

export function TabBar({ active }: { active: string }) {
  const index = Math.max(0, TABS.findIndex((t) => t.href === active));
  const [at, setAt] = useState(lastTab);
  useLayoutEffect(() => {
    lastTab = index;
    const frame = requestAnimationFrame(() => setAt(index));
    return () => cancelAnimationFrame(frame);
  }, [index]);
  return (
    <nav className="tabbar" aria-label="Main">
      <span className="tab-pill" aria-hidden="true" style={{ transform: `translateX(calc(${at} * (100% + 2px)))` }} />
      {TABS.map(({ href, label, icon: Icon }) => (
        <a key={label} href={`#/${href}`} className={active === href ? 'on' : ''} aria-current={active === href ? 'page' : undefined}>
          <Icon size={21} strokeWidth={1.7} />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}

// Fallback covers: a few paper tones, chosen from the title so a book keeps its color.
const TONES = ['olive', 'ink', 'clay', 'sage', 'night'];

function tone(title: string): string {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

/** Book cover: the real image if there is one, else a made-up cover with the title. */
export function Cover({ book, shape = 'rect', size = 'md' }: { book: Book; shape?: 'rect' | 'arch'; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const url = useObjectUrl(book.cover);
  // A picture the phone cannot show falls back to the made-up cover, not a broken-image icon.
  const [failed, setFailed] = useState<string>();
  return (
    <div className={`cover cover-${shape} cover-${size}`} aria-hidden="true">
      {url && url !== failed ? (
        <img src={url} alt="" onError={() => setFailed(url)} />
      ) : (
        <div className={`cover-made tone-${tone(book.title)}`}>
          <span className="cover-rule" />
          <span className="cover-name" lang={book.language === 'zh' ? 'zh' : undefined}>
            {book.title}
          </span>
          <span className="cover-orn">❦</span>
          {book.author && <span className="cover-author">{book.author}</span>}
        </div>
      )}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-orn" aria-hidden="true">
        ❦
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

/**
 * Shown while translating: the cat in the wizard hat works his wand (the owner's own animated picture) and the English
 * streams in beneath him. A still copy of the same picture shows when animations are off.
 */
export function Working({ label, peek }: { label: string; peek?: string }) {
  return (
    <div className="working" role="status" aria-live="polite">
      <div className="working-figure" aria-hidden="true">
        <img src={`/mascot/cat-working.${motionOk() ? 'gif' : 'png'}`} alt="" width={132} height={132} draggable={false} />
      </div>
      <p className="working-label">
        {label}
        <span className="dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </p>
      {peek ? (
        <p className="peek" lang="en">
          {peek.slice(-260)}
          <span className="caret" aria-hidden="true" />
        </p>
      ) : null}
    </div>
  );
}

/** A book with thickness: front cover, spine and page edges. It sways and floats a little. */
export function Book3D({ book, size = 'md' }: { book: Book; size?: 'md' | 'lg' }) {
  return (
    <div className={`book3d book3d-${size}`}>
      <div className="book3d-float">
        <div className="book3d-body">
          <span className="book3d-back" />
          <span className="book3d-spine" />
          <span className="book3d-pages" />
          <div className="book3d-front">
            <Cover book={book} size="lg" />
            <span className="book3d-shine" />
          </div>
        </div>
      </div>
      <span className="book3d-shadow" />
    </div>
  );
}

export type PocketTint = 'lilac' | 'peach' | 'lime' | 'sky';

/**
 * A frosted pocket with a few covers tucked in. Open, the covers fan up and out.
 * With `href` it is a link; with `onClick` a button that reports whether it is open.
 */
export function Pocket({
  label,
  count,
  books,
  tint,
  open,
  href,
  onClick,
  children,
}: {
  label: string;
  count: number;
  books: Book[];
  tint: PocketTint;
  open?: boolean;
  href?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const shown = books.slice(0, 4);
  const inside = (
    <>
      {shown.map((b, i) => (
        <span key={b.id} className="pocket-cv" style={{ ['--k' as string]: i - (shown.length - 1) / 2 }}>
          <Cover book={b} size="sm" />
        </span>
      ))}
      <span className="pocket-front" />
      {children}
      <span className="pocket-label">
        <b>{label}</b>
        <span>
          {count} {count === 1 ? 'book' : 'books'}
        </span>
      </span>
    </>
  );
  const className = `pocket tint-${tint}${open ? ' open' : ''}`;
  return href ? (
    <a className={className} href={href}>
      {inside}
    </a>
  ) : (
    <button type="button" className={className} aria-pressed={open} onClick={onClick}>
      {inside}
    </button>
  );
}
