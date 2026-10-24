import type { Mood } from './mood';

/** The wizard, drawn in code (an original character): pointed hat with stars, a long beard, a starry robe. */
export function Wizard({ mood, size = 64 }: { mood: Mood; size?: number }) {
  const sad = mood === 'sad';
  const high = mood === 'high';
  const happy = mood === 'happy';
  // Sad: slumped lower and lower in the robe. High: a little tilt and a smoke ring.
  const dy = sad ? 10 : 0;
  return (
    <svg className={`wizard wizard-${mood}`} width={size} height={size} viewBox="0 0 120 130" aria-hidden="true">
      <g fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" transform={`translate(0 ${dy})`}>
        {/* robe */}
        <path d="M34 62 Q60 50 86 62 L100 118 Q60 124 22 118 Z" fill="var(--surface)" />
        {/* stars on the robe */}
        {[
          [44, 88],
          [70, 84],
          [58, 106],
          [84, 108],
        ].map(([x, y]) => (
          <path key={`${x}-${y}`} d={`M${x} ${y - 4} L${x + 1.4} ${y - 1.2} L${x + 4} ${y} L${x + 1.4} ${y + 1.2} L${x} ${y + 4} L${x - 1.4} ${y + 1.2} L${x - 4} ${y} L${x - 1.4} ${y - 1.2} Z`} fill="var(--star)" stroke="none" />
        ))}
        {/* arms: raised when happy, folded when sad or high */}
        {happy ? (
          <>
            <path d="M36 70 Q18 52 12 36" />
            <path d="M84 70 Q102 52 108 36" />
          </>
        ) : (
          <>
            <path d="M36 74 Q44 84 60 84" />
            <path d="M84 74 Q76 84 60 84" />
          </>
        )}
        {/* hat */}
        <path d="M30 40 Q46 36 58 14 Q64 4 70 0 Q62 22 90 40 Z" fill="var(--surface)" transform={sad ? 'rotate(-14 60 40)' : undefined} />
        <path d="M44 30 L46 34 L50 34 L47 37 L48 41 L44 39 L40 41 L41 37 L38 34 L42 34 Z" fill="var(--star)" stroke="none" />
        {/* face */}
        <path d="M42 42 Q60 36 78 42 Q80 62 60 66 Q40 62 42 42 Z" fill="var(--bg)" />
        {/* eyes */}
        {happy && (
          <>
            <path d="M49 49 Q52 45 55 49" />
            <path d="M65 49 Q68 45 71 49" />
          </>
        )}
        {sad && (
          <>
            <path d="M49 51 Q52 47 55 51" />
            <path d="M65 51 Q68 47 71 51" />
            <path d="M56 57 Q55 62 57 64 Q59 62 58 57" fill="var(--ink)" />
          </>
        )}
        {high && (
          <>
            <path d="M49 49 q3 -4 6 0 q-1 4 -4 3 q-2 -2 0 -4" />
            <path d="M65 49 q3 -4 6 0 q-1 4 -4 3 q-2 -2 0 -4" />
          </>
        )}
        {!happy && !sad && !high && (
          <>
            <circle cx="52" cy="49" r="1.6" fill="var(--ink)" stroke="none" />
            <circle cx="68" cy="49" r="1.6" fill="var(--ink)" stroke="none" />
          </>
        )}
        {/* beard */}
        <path d="M44 60 Q42 78 52 84 Q60 88 68 84 Q78 78 76 60" />
        {/* mouth */}
        {happy ? <path d="M56 58 Q60 62 64 58" /> : <path d="M57 60 L63 60" />}
        {/* pipe for the high mood */}
        {high && (
          <>
            <path d="M66 60 L76 64" strokeWidth="3" />
            <circle cx="77" cy="65" r="2.4" fill="var(--ink)" />
            <path className="smoke" d="M80 60 Q86 52 80 44 Q76 38 84 30" />
          </>
        )}
      </g>
    </svg>
  );
}
