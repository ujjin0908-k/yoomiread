import type { Mood } from './mood';

/** Palette for the wizard, so he reads well on every paper and in night mode. */
const C = {
  line: '#3a3530',
  robe: '#5d84c9',
  robeDark: '#4a6db0',
  hat: '#3f5fa8',
  hatDark: '#2f4a88',
  star: '#f0c24e',
  skin: '#fbd7b8',
  beard: '#fff6e4',
  beardShade: '#eadcc0',
  cheek: '#ff9fae',
  pipe: '#b97a45',
  smoke: '#a9a59b',
  tear: '#8fd0f5',
};

function Star({ x, y, r = 3.6 }: { x: number; y: number; r?: number }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const rad = i % 2 === 0 ? r : r * 0.48;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(x + rad * Math.cos(a)).toFixed(2)},${(y + rad * Math.sin(a)).toFixed(2)}`;
  });
  return <polygon points={pts.join(' ')} fill={C.star} stroke={C.line} strokeWidth="0.9" strokeLinejoin="round" />;
}

/** A closed "happy" eye: an upward arc. */
const HappyEye = ({ x, y }: { x: number; y: number }) => <path d={`M${x - 4} ${y + 1} Q${x} ${y - 5} ${x + 4} ${y + 1}`} fill="none" strokeWidth="2.6" />;

/** A round eye with a light spot, the cute kind. */
const Eye = ({ x, y }: { x: number; y: number }) => (
  <>
    <ellipse cx={x} cy={y} rx="3.4" ry="4.2" fill={C.line} stroke="none" />
    <circle cx={x + 1.2} cy={y - 1.6} r="1.2" fill="#fff" stroke="none" />
  </>
);

/**
 * The wizard, drawn in code as an original character: a round little body, a big head, a plum hat with
 * gold stars, a cream beard. His face and pose change with the mood.
 */
export function Wizard({ mood, size = 64 }: { mood: Mood; size?: number }) {
  const happy = mood === 'happy';
  const sad = mood === 'sad';
  const high = mood === 'high';
  const idle = mood === 'idle';
  return (
    <svg className={`wizard wizard-${mood}`} width={size} height={size} viewBox="0 0 120 130" aria-hidden="true">
      {/* shadow on the ground */}
      <ellipse cx="60" cy="124" rx="30" ry="4" fill={C.line} opacity="0.12" />
      <g strokeLinecap="round" strokeLinejoin="round" stroke={C.line} strokeWidth="2.4">
        {/* little feet */}
        <ellipse cx="46" cy="121" rx="8" ry="4.6" fill={C.skin} />
        <ellipse cx="74" cy="121" rx="8" ry="4.6" fill={C.skin} />
        {/* robe, wider at the hem */}
        <path d="M36 84 Q32 70 46 66 L74 66 Q88 70 84 84 Q98 108 102 118 Q60 128 18 118 Q22 108 36 84 Z" fill={C.robe} />
        <path d="M26 110 Q60 120 94 110" fill="none" stroke={C.robeDark} strokeWidth="4" />
        <path d="M44 74 Q40 86 42 96" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="3" />
        {/* belt */}
        <path d="M37 90 Q60 96 83 90" fill="none" stroke={C.star} strokeWidth="3" />
        <Star x={60} y={106} r={4} />
        <Star x={38} y={108} r={2.8} />
        <Star x={82} y={107} r={2.8} />
        <Star x={30} y={98} r={2.2} />
        <Star x={90} y={98} r={2.2} />
        <Star x={52} y={116} r={2} />
        <Star x={70} y={116} r={2} />
        {/* arms: mitten hands, up when happy */}
        {happy ? (
          <>
            <path d="M36 80 Q22 66 20 50" fill="none" />
            <path d="M84 80 Q98 66 100 50" fill="none" />
            <circle cx="20" cy="46" r="6" fill={C.skin} />
            <circle cx="100" cy="46" r="6" fill={C.skin} />
          </>
        ) : (
          <>
            <circle cx="34" cy="90" r="6" fill={C.skin} />
            <circle cx="86" cy="90" r="6" fill={C.skin} />
          </>
        )}
        {/* head */}
        <circle cx="60" cy="56" r="21" fill={C.skin} />
        {/* beard, with a soft shade at the bottom */}
        <path d="M41 62 Q37 88 50 94 Q60 98 70 94 Q83 88 79 62 Q60 72 41 62 Z" fill={C.beard} />
        <path d="M50 94 Q60 90 70 94" fill="none" stroke={C.beardShade} strokeWidth="2" />
        {/* hat: one smooth cone from the brim up to a bent tip */}
        <path d={sad ? 'M32 46 C40 30 60 22 84 20 C82 30 80 38 88 46 Z' : 'M32 46 C38 26 58 14 88 4 C84 20 80 34 88 46 Z'} fill={C.hat} />
        <ellipse cx="60" cy="46" rx="40" ry="8" fill={C.hatDark} />
        <path d="M24 46 Q60 56 96 46" fill="none" stroke={C.line} strokeWidth="1.6" opacity="0.5" />
        <Star x={50} y={30} r={3.4} />
        <Star x={68} y={18} r={2.6} />
        <Star x={76} y={36} r={2} />
        <Star x={42} y={40} r={2} />
        {/* face */}
        {happy && (
          <>
            <HappyEye x={50} y={54} />
            <HappyEye x={70} y={54} />
            <path d="M52 66 Q60 76 68 66 Z" fill={C.line} />
          </>
        )}
        {idle && (
          <>
            <Eye x={51} y={55} />
            <Eye x={69} y={55} />
            <path d="M55 66 Q60 70 65 66" fill="none" strokeWidth="2" />
          </>
        )}
        {sad && (
          <>
            <path d="M46 56 Q50 52 54 55" fill="none" strokeWidth="2.2" />
            <path d="M66 55 Q70 52 74 56" fill="none" strokeWidth="2.2" />
            <Eye x={50} y={58} />
            <Eye x={70} y={58} />
            <path d="M55 70 Q60 66 65 70" fill="none" strokeWidth="2" />
            <path d="M78 60 Q75 67 78 70 Q81 67 78 60 Z" fill={C.tear} stroke="#3f7fa8" strokeWidth="1" />
          </>
        )}
        {high && (
          <>
            {/* spiral eyes */}
            <circle cx="50" cy="55" r="5" fill="#fff" />
            <path d="M50 55 m-2.5 0 a2.5 2.5 0 1 1 5 0 a1.5 1.5 0 1 1 -3 0" fill="none" strokeWidth="1.2" />
            <circle cx="70" cy="55" r="5" fill="#fff" />
            <path d="M70 55 m-2.5 0 a2.5 2.5 0 1 1 5 0 a1.5 1.5 0 1 1 -3 0" fill="none" strokeWidth="1.2" />
            <ellipse cx="60" cy="68" rx="3" ry="3.6" fill={C.line} />
          </>
        )}
        {/* blush */}
        <ellipse cx="42" cy="66" rx="4.6" ry="3" fill={C.cheek} stroke="none" opacity={happy || high ? 0.85 : 0.55} />
        <ellipse cx="78" cy="66" rx="4.6" ry="3" fill={C.cheek} stroke="none" opacity={happy || high ? 0.85 : 0.55} />
        {/* pipe and smoke for high */}
        {high && (
          <>
            <path d="M66 72 L78 76" stroke={C.pipe} strokeWidth="3.6" />
            <circle cx="80" cy="77" r="3.4" fill={C.pipe} />
            <path className="smoke" d="M84 68 Q94 58 84 48 Q78 40 88 30" fill="none" stroke={C.smoke} strokeWidth="2.2" />
          </>
        )}
      </g>
    </svg>
  );
}
