import { useEffect, type ReactNode } from 'react';

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
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Header({ title, back, right }: { title: string; back?: string; right?: ReactNode }) {
  return (
    <header className="top">
      {back !== undefined ? (
        <a className="icon-btn" href={`#/${back}`} aria-label="Back">
          ‹
        </a>
      ) : (
        <span className="logo">读</span>
      )}
      <h1>{title}</h1>
      <div className="top-right">{right}</div>
    </header>
  );
}
