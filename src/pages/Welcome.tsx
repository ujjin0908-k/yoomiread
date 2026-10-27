import { useState } from 'react';

/** The heart, drawn from the centre outwards: each layer is a smaller heart inside the one before. */
const HEART = 'M50 88 C 12 62, 0 42, 0 26 C 0 11, 11 2, 26 2 C 37 2, 46 8, 50 17 C 54 8, 63 2, 74 2 C 89 2, 100 11, 100 26 C 100 42, 88 62, 50 88 Z';
const LAYERS = [
  { fill: 'url(#layer-outer)', scale: 1 },
  { fill: 'url(#layer-mid)', scale: 0.8 },
  { fill: 'url(#layer-inner)', scale: 0.6 },
  { fill: 'url(#layer-core)', scale: 0.38 },
];

/** The first screen: shown once, on the first visit, then the app opens as usual. */
export function Welcome({ onStart }: { onStart: () => void }) {
  const [tapped, setTapped] = useState(false);

  function start() {
    if (tapped) return;
    setTapped(true);
    window.setTimeout(onStart, 1400);
  }

  return (
    <main className="welcome">
      <img className="welcome-scene" src="/welcome.jpg" alt="" />
      <h1>YoomiRead</h1>
      <p>Read any world</p>
      <button type="button" className={`heart-start${tapped ? ' tapped' : ''}`} onClick={start} aria-label="Tap to start reading">
        <svg viewBox="0 0 100 90" aria-hidden="true">
          <defs>
            <linearGradient id="layer-outer" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7d9be8" />
              <stop offset="1" stopColor="#4466c8" />
            </linearGradient>
            <linearGradient id="layer-mid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5f94f0" />
              <stop offset="1" stopColor="#2f5fd0" />
            </linearGradient>
            <linearGradient id="layer-inner" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8fb6f5" />
              <stop offset="1" stopColor="#4a7fe0" />
            </linearGradient>
            <linearGradient id="layer-core" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c3b3f2" />
              <stop offset="1" stopColor="#8f7fd8" />
            </linearGradient>
          </defs>
          {LAYERS.map((layer, i) => (
            <g key={i} transform={`translate(${50 * (1 - layer.scale)} ${40 * (1 - layer.scale)}) scale(${layer.scale})`}>
              <path className="heart-layer" style={{ '--i': i, fill: layer.fill } as React.CSSProperties} d={HEART} />
            </g>
          ))}
        </svg>
        <span>Tap</span>
      </button>
    </main>
  );
}
