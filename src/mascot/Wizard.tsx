import type { Mood } from './mood';

/** Palette for the wizard, so he reads well on every paper and in night mode. */
const C = {
  line: '#3b3a33',
  robe: '#8fb08a',
  robeShade: '#6f9470',
  hat: '#7d5ba6',
  star: '#e8bd4f',
  skin: '#f6cfae',
  beard: '#fff4dd',
  cheek: '#f09aa6',
  pipe: '#b5703f',
};

function Star({ x, y, r = 3.4 }: { x: number; y: number; r?: number }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(x + rad * Math.cos(a)).toFixed(2)},${(y + rad * Math.sin(a)).toFixed(2)}`;
  });
  return <polygon points={pts.join(' ')} fill={C.star} stroke={C.line} strokeWidth="0.8" strokeLinejoin="round" />;
}

/**
 * The wizard, drawn in code as an original character: a round sage robe, a plum hat with gold stars,
 * a cream beard. The face and pose change with the mood.
 */
export function Wizard({ mood, size = 64 }: { mood: Mood; size?: number }) {
  const happy = mood === 'happy';
  const sad = mood === 'sad';
  const high = mood === 'high';
  return (
    <svg className={`wizard wizard-${mood}`} width={size} height={size} viewBox="0 0 120 130" aria-hidden="true">
      <g strokeLinecap="round" strokeLinejoin="round" stroke={C.line} strokeWidth="2.4">
        {/* feet */}
        <ellipse cx="42" cy="122" rx="9" ry="5" fill={C.skin} />
        <ellipse cx="78" cy="122" rx="9" ry="5" fill={C.skin} />
        {/* robe: round and a little wider at the hem */}
        <path d="M30 70 Q28 50 60 48 Q92 50 90 70 Q100 96 96 116 Q60 124 24 116 Q20 96 30 70 Z" fill={C.robe} />
        <path d="M30 96 Q60 104 90 96" fill="none" stroke={C.robeShade} strokeWidth="5" />
        <path d="M30 88 Q60 96 90 88" fill="none" stroke={C.star} strokeWidth="2.6" />
        <Star x={42} y={106} r={3.2} />
        <Star x={76} y={104} r={3.2} />
        <Star x={60} y={76} r={2.6} />
        {/* arms: stubby hands raised when happy, resting when sad or high */}
        {happy ? (
          <>
            <path d="M32 74 Q18 62 16 46" fill="none" />
            <path d="M88 74 Q102 62 104 46" fill="none" />
            <circle cx="16" cy="44" r="5.5" fill={C.skin} />
            <circle cx="104" cy="44" r="5.5" fill={C.skin} />
          </>
        ) : (
          <>
            <circle cx="30" cy="86" r="5.5" fill={C.skin} />
            <circle cx="90" cy="86" r="5.5" fill={C.skin} />
          </>
        )}
        {/* hat: plum cone with a bent tip, brim, gold stars */}
        <path
          d={sad ? 'M24 50 Q60 42 96 50 Q88 34 92 14 Q76 28 60 36 Q40 30 24 50 Z' : 'M26 50 Q60 42 94 50 Q78 30 72 6 Q58 26 26 50 Z'}
          fill={C.hat}
        />
        <ellipse cx="60" cy="50" rx="36" ry="6" fill={C.hat} />
        <Star x={46} y={34} r={3.6} />
        <Star x={70} y={22} r={2.8} />
        {/* head and beard */}
        <circle cx="60" cy="60" r="18" fill={C.skin} />
        <path d="M44 66 Q42 88 52 92 Q60 96 68 92 Q78 88 76 66 Q60 74 44 66 Z" fill={C.beard} />
        {/* face */}
        {happy && (
          <>
            <path d="M50 58 Q53 54 56 58" fill="none" />
            <path d="M64 58 Q67 54 70 58" fill="none" />
            <path d="M55 70 Q60 75 65 70" fill="none" />
          </>
        )}
        {mood === 'idle' && (
          <>
            <circle cx="53" cy="59" r="2" fill={C.line} stroke="none" />
            <circle cx="67" cy="59" r="2" fill={C.line} stroke="none" />
            <path d="M56 70 Q60 72 64 70" fill="none" />
          </>
        )}
        {sad && (
          <>
            <path d="M49 60 Q53 56 56 60" fill="none" />
            <path d="M64 60 Q67 56 71 60" fill="none" />
            <path d="M55 73 Q60 69 65 73" fill="none" />
            <path d="M74 58 Q72 64 74 66 Q77 64 74 58" fill="#8ec5f0" stroke="#4a86b5" strokeWidth="1" />
          </>
        )}
        {high && (
          <>
            <circle cx="53" cy="59" r="3.2" fill="#fff" />
            <circle cx="67" cy="59" r="3.2" fill="#fff" />
            <path d="M53 59 m-1.5 0 a1.5 1.5 0 1 1 3 0 a1 1 0 0 1 -2 0" fill="none" strokeWidth="1" />
            <path d="M67 59 m-1.5 0 a1.5 1.5 0 1 1 3 0 a1 1 0 0 1 -2 0" fill="none" strokeWidth="1" />
            <path d="M56 70 Q60 74 64 70" fill="none" />
            <circle cx="46" cy="66" r="3.5" fill={C.cheek} stroke="none" opacity="0.7" />
            <circle cx="74" cy="66" r="3.5" fill={C.cheek} stroke="none" opacity="0.7" />
          </>
        )}
        {/* pipe for high */}
        {high && (
          <>
            <path d="M68 74 L80 78" stroke={C.pipe} strokeWidth="3.4" />
            <circle cx="82" cy="79" r="3" fill={C.pipe} />
            <path className="smoke" d="M86 70 Q94 60 86 50 Q80 42 90 32" fill="none" stroke="#9a9a92" strokeWidth="2" />
          </>
        )}
        {!happy && mood !== 'idle' && <circle cx="46" cy="66" r="0" fill="none" />}
      </g>
    </svg>
  );
}
