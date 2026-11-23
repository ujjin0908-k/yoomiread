import { ChevronLeft, ChevronRight, Download, Share2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLive } from '../hooks';
import { wrapInput } from '../queries';
import { parsePeriod, periodId, periodName, wrapFor } from '../wrapped/data';
import { loadAssets, pagePng, savePicture, sharePicture } from '../wrapped/exportImage';
import { PAGE_H, PAGE_W, pagesFor, type Assets } from '../wrapped/Pages';

/**
 * Reading Wrapped: a month or a year as a little book of pages to swipe through (src/wrapped/Pages.tsx), each one
 * saved as a picture or shared to a story. Opened from the Stats tab at #/wrapped/2026 or #/wrapped/2026-11.
 */
export function WrappedPage({ id }: { id?: string }) {
  const period = parsePeriod(id);
  const input = useLive(wrapInput, [], 'wrap-input');
  const wrap = useMemo(() => (input && period ? wrapFor(input, period) : undefined), [input, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = useMemo(() => (wrap ? pagesFor(wrap) : []), [wrap]);
  const [assets, setAssets] = useState<Assets>();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<'share' | 'save'>();
  const [note, setNote] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const svgs = useRef<(SVGSVGElement | null)[]>([]);

  // The covers on the pages and the cat's pictures, loaded once as data so saved pictures carry them.
  useEffect(() => {
    if (!wrap) return;
    const books = [wrap.top?.book, ...wrap.finished, ...wrap.started].filter((b): b is NonNullable<typeof b> => !!b);
    let live = true;
    void loadAssets(books).then((a) => live && setAssets(a));
    return () => {
      live = false;
    };
  }, [wrap]);

  if (!period) {
    return (
      <main className="wrapped-page">
        <p className="wrapped-empty">That Wrapped doesn't exist.</p>
        <a className="pill-btn" href="#/stats">
          Back to Stats
        </a>
      </main>
    );
  }

  const name = periodName(period);
  const go = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(pages.length - 1, i));
    const target = el.children[clamped] as HTMLElement | undefined;
    target?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const centre = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    [...el.children].forEach((c, i) => {
      const box = c as HTMLElement;
      if (Math.abs(box.offsetLeft + box.offsetWidth / 2 - centre) < Math.abs((el.children[best] as HTMLElement).offsetLeft + (el.children[best] as HTMLElement).offsetWidth / 2 - centre)) best = i;
    });
    setIndex(best);
  };

  async function picture(kind: 'share' | 'save') {
    const svg = svgs.current[index];
    if (!svg || !assets) return;
    setBusy(kind);
    setNote('');
    try {
      const png = await pagePng(svg);
      const file = `yoomiread-wrapped-${periodId(period!)}-${index + 1}.png`;
      if (kind === 'save') {
        savePicture(png, file);
        setNote('Picture saved.');
      } else {
        const how = await sharePicture(png, file);
        if (how === 'saved') setNote('Sharing pictures isn’t possible here, so it was saved instead.');
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'The picture could not be made.');
    } finally {
      setBusy(undefined);
    }
  }

  const empty = wrap && wrap.totalMinutes === 0;

  return (
    <main className="wrapped-page">
      <header className="wrapped-top">
        <a className="round-btn" href="#/stats" aria-label="Close">
          <X size={20} />
        </a>
        <span className="wrapped-title">{name} Wrapped</span>
        <span className="wrapped-count" aria-live="polite">
          {pages.length && !empty ? `${index + 1} / ${pages.length}` : ''}
        </span>
      </header>

      {empty ? (
        <div className="wrapped-empty">
          <img src="/mascot/cat-resting.png" alt="" width={160} height={160} />
          <p>No reading in {name} yet. Open a book and the cat will start keeping count.</p>
        </div>
      ) : (
        <>
          <div className="wrapped-book" ref={scroller} onScroll={onScroll} role="region" aria-roledescription="carousel" aria-label={`${name} Wrapped`}>
            {pages.map((p, i) => (
              <div className="wrapped-sheet" key={p.key} aria-roledescription="page" aria-label={`${p.label}, page ${i + 1} of ${pages.length}`}>
                {assets ? (
                  <svg ref={(el) => (svgs.current[i] = el)} viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} role="img" aria-label={p.label}>
                    {p.draw(assets, i + 1, pages.length)}
                  </svg>
                ) : (
                  <div className="wrapped-loading" />
                )}
              </div>
            ))}
          </div>
          <button type="button" className="wrapped-turn prev" aria-label="Previous page" disabled={index === 0} onClick={() => go(index - 1)}>
            <ChevronLeft size={22} />
          </button>
          <button type="button" className="wrapped-turn next" aria-label="Next page" disabled={index >= pages.length - 1} onClick={() => go(index + 1)}>
            <ChevronRight size={22} />
          </button>
          <footer className="wrapped-bar">
            <div className="wrapped-dots" aria-hidden="true">
              {pages.map((p, i) => (
                <i key={p.key} className={i === index ? 'on' : ''} />
              ))}
            </div>
            <div className="wrapped-actions">
              <button type="button" className="pill-btn" disabled={!assets || !!busy} onClick={() => void picture('share')}>
                <Share2 size={18} /> {busy === 'share' ? 'Making it…' : 'Share'}
              </button>
              <button type="button" className="pill-btn ghost" disabled={!assets || !!busy} onClick={() => void picture('save')}>
                <Download size={18} /> {busy === 'save' ? 'Making it…' : 'Save picture'}
              </button>
            </div>
            {note && (
              <p className="wrapped-note" role="status">
                {note}
              </p>
            )}
          </footer>
        </>
      )}
    </main>
  );
}
