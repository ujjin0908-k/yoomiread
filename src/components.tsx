import { BarChart3, ChevronLeft, Home, LibraryBig, Quote, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useObjectUrl } from './images';
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

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="round-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Top bar for inner pages: round back button, centered title, actions on the right. */
export function TopBar({ back, title, right }: { back: string; title?: string; right?: ReactNode }) {
  return (
    <header className="topbar">
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
        <h1>{title}</h1>
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

export function TabBar({ active }: { active: string }) {
  return (
    <nav className="tabbar" aria-label="Main">
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

/** Original artwork: a little green lizard holding a star wand. Drawn in code; nothing copied. */
function LizardWand() {
  return (
    <svg className="lizard" viewBox="0 0 120 90" width="104" height="78" aria-hidden="true">
      <g className="liz-tail">
        <path d="M22 60 C 6 62, 4 46, 14 42" stroke="#6b7a3a" strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>
      <path d="M40 66 l-6 11 M60 66 l4 11" stroke="#6b7a3a" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="50" cy="56" rx="27" ry="16" fill="#8fa04e" />
      <circle cx="78" cy="40" r="15" fill="#8fa04e" />
      <circle cx="84" cy="36" r="3.4" fill="#fbf8f1" />
      <circle cx="85" cy="36" r="1.5" fill="#2a2823" />
      <path d="M86 46 q5 3 9 -1" stroke="#2a2823" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M68 54 L98 28" stroke="#5c4a32" strokeWidth="2.6" strokeLinecap="round" />
      <path className="spark" d="M100 14 l2.4 6.2 6.2 2.4 -6.2 2.4 -2.4 6.2 -2.4 -6.2 -6.2 -2.4 6.2 -2.4z" fill="#d9a441" />
      <circle className="spark s2" cx="112" cy="36" r="2" fill="#d9a441" />
      <circle className="spark s3" cx="92" cy="8" r="1.6" fill="#d9a441" />
    </svg>
  );
}

/** Shown while translating: the lizard works its wand and the English streams in beneath it. */
export function Working({ label, peek }: { label: string; peek?: string }) {
  return (
    <div className="working" role="status" aria-live="polite">
      <div className="working-figure" aria-hidden="true">
        <LizardWand />
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
