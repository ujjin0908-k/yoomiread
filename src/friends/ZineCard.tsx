import { useState } from 'react';
import type { CardData } from './card';

/**
 * A reader's name card in the zine look (the Wrapped style): dark page, pink burst, striped page edge, a badge, what
 * they're reading, a line they kept, and a few numbers. `mini` is the smaller card in the friends list.
 * A line that could spoil a book I'm reading is blurred until tapped (`spoils`).
 */
export function ZineCard({ card, mini, spoils, code }: { card: CardData; mini?: boolean; spoils?: boolean; code?: string }) {
  const [shown, setShown] = useState(false);
  const chips = [
    card.hours ? `${card.hours}h this year` : '',
    card.streak ? `${card.streak}-day streak` : '',
    card.genres ?? '',
    card.theories ? `Theories: ${card.theories}` : '',
    card.wrapped ?? '',
  ].filter(Boolean);
  const progress = card.now_total ? Math.min(1, (card.now_chapter ?? 0) / card.now_total) : 0;

  return (
    <article className={`zine-card${mini ? ' mini' : ''}`} aria-label={`${card.name}’s reader card`}>
      <span className="zine-edge" aria-hidden="true" />
      <svg className="zine-burst" viewBox="0 0 120 120" aria-hidden="true">
        <polygon points="60,4 70,38 104,22 88,54 118,64 86,74 100,108 68,92 60,118 50,92 18,108 34,74 2,64 32,54 16,22 50,38" />
      </svg>
      <img className="zine-cat" src="/mascot/cat-sly.png" alt="" width={120} height={120} draggable={false} />
      <div className="zine-head">
        <span className="zine-kicker">READER CARD</span>
        <h3 className="zine-name">{card.name}</h3>
        {card.badge && <span className="zine-badge">{card.badge.toUpperCase()}</span>}
      </div>

      {card.now_title && (
        <div className="zine-now">
          <span className="zine-kicker">NOW READING</span>
          <span className="zine-title">{card.now_title}</span>
          {!!card.now_total && (
            <>
              <span className="zine-small">
                Chapter {card.now_chapter ?? 0} of {card.now_total}
              </span>
              <span className="zine-bar">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </span>
            </>
          )}
        </div>
      )}

      {card.line && !mini && (
        <div className="zine-line">
          {spoils && !shown ? (
            <button type="button" className="zine-spoiler" onClick={() => setShown(true)}>
              <span className="zine-blur" aria-hidden="true">
                “{card.line}”
              </span>
              <span className="zine-small">
                Might spoil {card.line_book}
                {card.line_chapter ? `, chapter ${card.line_chapter}` : ''}. Tap to show.
              </span>
            </button>
          ) : (
            <>
              <q>{card.line}</q>
              {card.line_book && <span className="zine-small">A line I kept · {card.line_book}</span>}
            </>
          )}
        </div>
      )}

      {chips.length > 0 && (
        <div className="zine-chips">
          {(mini ? chips.slice(0, 2) : chips).map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      )}
      {!mini && (
        <div className="zine-foot">
          <span>YOOMIREAD</span>
          {code && <span>CODE {code.slice(0, 4)} {code.slice(4)}</span>}
        </div>
      )}
    </article>
  );
}
