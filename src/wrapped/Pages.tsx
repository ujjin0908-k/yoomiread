import type { ReactNode, SVGProps } from 'react';
import { hours } from '../stats';
import type { Book } from '../types';
import { DAY_NAMES, PEAK_WORDS, periodName, readerType, type Wrap } from './data';

/**
 * Reading Wrapped's pages, the zine flip-book look the owner picked (2026-11-23): grainy peach, pink and black pages,
 * spiky bursts behind the big numbers, stars, comic panels and a striped page edge. Every page is one SVG at story size
 * (1080 × 1920) so the same drawing is shown on screen and saved as a picture (src/wrapped/exportImage.ts).
 * Pictures come in as data addresses so a saved picture carries them.
 */

export const PAGE_W = 1080;
export const PAGE_H = 1920;

export type Assets = { covers: Record<string, string>; cat: Record<'sly' | 'happy' | 'resting' | 'idle', string> };

export type Page = { key: string; label: string; draw: (a: Assets, n: number, total: number) => ReactNode };

const INK = '#14121f';
const CREAM = '#fbf3ea';
const PINK = '#f2a7a0';
const PEACH = '#f7c48d';
const LILAC = '#8f7bd6';
const DISPLAY = "'Bricolage Grotesque', 'Noto Serif SC', sans-serif";
const SERIF = "'Instrument Serif', 'Noto Serif SC', Georgia, serif";
const SANS = "Inter, -apple-system, 'PingFang SC', sans-serif";

/** The same random numbers every time for the same seed, so a page looks the same on screen and saved. */
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function burst(seed: number, cx: number, cy: number, r1: number, r2: number, n: number, sx = 1): string {
  const r = rng(seed);
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n;
    const len = (i % 2 ? r2 : r1) * (0.8 + r() * 0.4);
    pts.push(`${(cx + Math.cos(a) * len * sx).toFixed(1)},${(cy + Math.sin(a) * len).toFixed(1)}`);
  }
  return pts.join(' ');
}

function Stars({ seed, n, x = 0, y = 0, w = PAGE_W, h = PAGE_H, colors }: { seed: number; n: number; x?: number; y?: number; w?: number; h?: number; colors: string[] }) {
  const r = rng(seed);
  return (
    <g aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const cx = Math.round(x + r() * w);
        const cy = Math.round(y + r() * h);
        const s = 6 + Math.round(r() * 16);
        const fill = colors[Math.floor(r() * colors.length)];
        return <path key={i} d={`M${cx} ${cy - s}Q${cx} ${cy} ${cx + s} ${cy}Q${cx} ${cy} ${cx} ${cy + s}Q${cx} ${cy} ${cx - s} ${cy}Q${cx} ${cy} ${cx} ${cy - s}Z`} fill={fill} />;
      })}
    </g>
  );
}

/** Paper grain over the whole page. */
function Grain({ id, opacity, freq = 0.8 }: { id: string; opacity: number; freq?: number }) {
  return (
    <>
      <filter id={`grain-${id}`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={2} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width={PAGE_W} height={PAGE_H} filter={`url(#grain-${id})`} opacity={opacity} />
    </>
  );
}

/** The striped edge of the pages, down the left side. */
function Edge({ x = 0, y = 0, h = PAGE_H, w = 30 }: { x?: number; y?: number; h?: number; w?: number }) {
  const colors = [PINK, '#2a2233', PEACH, LILAC];
  const rows: ReactNode[] = [];
  for (let i = 0, yy = y; yy < y + h; i++) {
    const hh = [18, 9, 18, 9][i % 4];
    rows.push(<rect key={i} x={x} y={yy} width={w} height={Math.min(hh, y + h - yy)} fill={colors[i % 4]} />);
    yy += hh;
  }
  return <g aria-hidden="true">{rows}</g>;
}

function Footer({ n, total, dark }: { n: number; total: number; dark?: boolean }) {
  const fill = dark ? '#c9c2d9' : INK;
  return (
    <g fontFamily={SANS} fontSize={34} fill={fill}>
      <text x={96} y={PAGE_H - 66} fontWeight={600} letterSpacing={3}>
        YOOMIREAD
      </text>
      <text x={PAGE_W - 72} y={PAGE_H - 66} textAnchor="end">
        {n} / {total}
      </text>
    </g>
  );
}

/** Lines of text that fit a width, measured roughly: CJK characters are as wide as the font size, others about half. */
export function wrap(text: string, width: number, size: number, factor = 0.5, maxLines = 6): string[] {
  const w = (s: string) => [...s].reduce((n, ch) => n + (/[⺀-￿]/.test(ch) ? size : ch === ' ' ? size * 0.28 : size * factor), 0);
  const words = /[⺀-￿]/.test(text) && !/\s/.test(text.trim()) ? [...text] : text.split(/\s+/);
  const join = (a: string, b: string) => (a ? (/[⺀-￿]$/.test(a) && /^[⺀-￿]/.test(b) ? a + b : `${a} ${b}`) : b);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = join(line, word);
    if (line && w(next) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = `${cut[maxLines - 1].replace(/[\s.,;:!?]*$/, '')}…`;
    return cut;
  }
  return lines;
}

function Lines({ lines, x, y, size, lh, ...rest }: { lines: string[]; x: number; y: number; size: number; lh: number } & Omit<SVGProps<SVGTextElement>, 'x' | 'y'>) {
  return (
    <text x={x} y={y} fontSize={size} {...rest}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i ? lh : 0}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

/** A book's cover in a comic panel: its picture, or its title on a dark block. */
function Panel({ book, cover, x, y, w, h, rotate }: { book: Book; cover?: string; x: number; y: number; w: number; h: number; rotate: number }) {
  const title = wrap(book.title, w - 60, 54, 0.52, 4);
  return (
    <g transform={`rotate(${rotate} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x} y={y} width={w} height={h} fill={CREAM} stroke={INK} strokeWidth={9} />
      {cover ? (
        <image href={cover} x={x + 4.5} y={y + 4.5} width={w - 9} height={h - 9} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <>
          <rect x={x + 4.5} y={y + 4.5} width={w - 9} height={h - 9} fill="#2a2233" />
          <Lines lines={title} x={x + 30} y={y + 90} size={54} lh={62} fill={CREAM} fontFamily={DISPLAY} fontWeight={700} />
        </>
      )}
    </g>
  );
}

const dateWords = (ms: number) => new Date(ms).toLocaleDateString('en', { month: 'short', day: 'numeric' });
const timeWords = (m: number) => (m >= 60 ? { big: String(Math.round(m / 60)), small: Math.round(m / 60) === 1 ? 'HOUR' : 'HOURS' } : { big: String(Math.max(1, Math.round(m))), small: 'MINUTES' });

/** The pages for a wrap, skipping any with nothing to show. */
export function pagesFor(w: Wrap): Page[] {
  const name = periodName(w.period);
  const short = periodName(w.period, true);
  const year = w.period.kind === 'year';
  const pages: Page[] = [];

  pages.push({
    key: 'cover',
    label: 'Cover',
    draw: (a, n, total) => (
      <>
        <defs>
          <linearGradient id="cover-bg" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor={PEACH} />
            <stop offset="0.55" stopColor={PINK} />
            <stop offset="1" stopColor="#e9a3b8" />
          </linearGradient>
        </defs>
        <rect width={PAGE_W} height={PAGE_H} fill="url(#cover-bg)" />
        <Grain id="cover" opacity={0.3} freq={0.9} />
        {[
          ['#fbf3ea', -9],
          ['#f5e6f2', -4],
          ['#fff7e8', 3],
        ].map(([fill, r]) => (
          <rect key={r} x={174} y={288} width={732} height={990} rx={18} fill={fill as string} transform={`rotate(${r} 540 783)`} />
        ))}
        <g>
          <rect x={174} y={288} width={732} height={990} rx={24} fill="#1b1522" />
          <Edge x={174} y={300} h={966} w={36} />
          <Stars seed={3} n={16} x={220} y={320} w={660} h={900} colors={[PEACH, PINK, LILAC]} />
          <polygon points={burst(5, 540, 740, 300, 205, 13)} fill={PINK} stroke={INK} strokeWidth={9} />
          <text x={540} y={year ? 800 : 770} textAnchor="middle" fontFamily={DISPLAY} fontWeight={800} fontSize={year ? 200 : 128} letterSpacing={year ? -10 : -5} fill={INK}>
            {year ? short : short.slice(0, 3).toUpperCase()}
          </text>
          {!year && (
            <text x={540} y={850} textAnchor="middle" fontFamily={DISPLAY} fontWeight={800} fontSize={64} fill={INK}>
              {w.period.year}
            </text>
          )}
          <Lines lines={[year ? 'My year' : 'My month', 'in books']} x={244} y={1150} size={76} lh={74} fill={CREAM} fontFamily={SERIF} fontStyle="italic" />
        </g>
        <image href={a.cat.sly} x={672} y={990} width={360} height={360} transform="rotate(6 852 1170)" />
        <text x={540} y={1440} textAnchor="middle" fontFamily={DISPLAY} fontWeight={800} fontSize={66} fill={INK}>
          {total} pages
        </text>
        <text x={540} y={1500} textAnchor="middle" fontFamily={SANS} fontSize={38} fill="#3b3752">
          {name} in books, from YoomiRead
        </text>
        <Footer n={n} total={total} />
      </>
    ),
  });

  if (w.totalMinutes > 0) {
    pages.push({
      key: 'time',
      label: 'Time',
      draw: (_a, n, total) => {
        const t = timeWords(w.totalMinutes);
        const max = Math.max(1, ...w.daily);
        const step = (PAGE_W - 100) / Math.max(1, w.daily.length - 1);
        const pts = w.daily.map((m, i) => `${(50 + i * step).toFixed(1)},${(1080 + (m / max) * 150 * (i % 2 ? 1 : -1)).toFixed(1)}`).join(' ');
        const days = w.totalMinutes / 1440;
        const line =
          days >= 1.5 ? `That's almost ${Math.round(days)} days spent inside stories.` : `${w.daysRead} ${w.daysRead === 1 ? 'day' : 'days'} with a book open.`;
        const note = `The line is your ${year ? 'year' : 'month'}: every spike is a day you read.${w.busiest ? ` Busiest: ${hours(w.busiest.minutes)} on ${dateWords(w.busiest.day)}.` : ''}`;
        return (
          <>
            <rect width={PAGE_W} height={PAGE_H} fill="#17121c" />
            <Grain id="time" opacity={0.12} />
            <Edge />
            <Stars seed={7} n={34} colors={['#6b6078', PEACH, LILAC, '#4f4660']} />
            <polygon points={burst(9, 540, 520, 400, 285, 15)} fill={PINK} />
            <text x={540} y={560} textAnchor="middle" fontFamily={DISPLAY} fontWeight={800} fontSize={t.big.length > 3 ? 200 : 276} letterSpacing={-14} fill={INK}>
              {t.big}
            </text>
            <text x={540} y={660} textAnchor="middle" fontFamily={DISPLAY} fontWeight={800} fontSize={78} letterSpacing={8} fill={INK}>
              {t.small}
            </text>
            <defs>
              <linearGradient id="wave" x1="0" x2="1">
                <stop offset="0" stopColor={LILAC} />
                <stop offset="0.6" stopColor={PINK} />
                <stop offset="1" stopColor={PEACH} />
              </linearGradient>
            </defs>
            <polyline points={pts} fill="none" stroke="url(#wave)" strokeWidth={6} strokeLinejoin="round" />
            <Lines lines={wrap(line, 900, 96, 0.42, 3)} x={96} y={1390} size={96} lh={98} fill={CREAM} fontFamily={SERIF} fontStyle="italic" />
            <Lines lines={wrap(note, 880, 38, 0.52, 3)} x={96} y={1690} size={38} lh={50} fill="#c9c2d9" fontFamily={SANS} />
            <Footer n={n} total={total} dark />
          </>
        );
      },
    });
  }

  if (w.peak) {
    const type = readerType(w.peak)!;
    const mostly = `Mostly ${DAY_NAMES[w.peak.weekday]}s ${PEAK_WORDS[w.peak.band]}`;
    pages.push({
      key: 'rhythm',
      label: 'When',
      draw: (a, n, total) => (
        <>
          <defs>
            <linearGradient id="rhythm-bg" x1="0" y1="0" x2="0.2" y2="1">
              <stop offset="0" stopColor="#c9a9c8" />
              <stop offset="1" stopColor={PEACH} />
            </linearGradient>
          </defs>
          <rect width={PAGE_W} height={PAGE_H} fill="url(#rhythm-bg)" />
          <Grain id="rhythm" opacity={0.26} freq={0.75} />
          <Edge />
          <path d="M-30 330 C 240 260, 480 500, 1140 300" stroke="#7d6a86" strokeWidth={54} fill="none" opacity={0.3} />
          <text x={96} y={210} fontFamily={SERIF} fontStyle="italic" fontSize={84} fill={INK}>
            You are a…
          </text>
          <polygon points={burst(13, 540, 640, 370, 250, 16, 1.05)} fill={INK} />
          <Lines lines={wrap(type.toUpperCase(), 640, 128, 0.62, 2)} x={540} y={type.length > 11 ? 600 : 680} size={128} lh={124} textAnchor="middle" fontFamily={DISPLAY} fontWeight={800} fill={CREAM} />
          <rect x={96} y={1040} width={300} height={300} fill="#fff1c9" stroke={INK} strokeWidth={9} transform="rotate(-4 246 1190)" />
          <image href={a.cat.idle} x={110} y={1054} width={272} height={272} transform="rotate(-4 246 1190)" />
          <Lines lines={wrap(mostly, 520, 56, 0.5, 4)} x={450} y={1120} size={56} lh={64} fill={INK} fontFamily={DISPLAY} fontWeight={700} />
          <g fontFamily={SANS} fill={INK}>
            <text x={96} y={1500} fontSize={40}>
              Reading days
            </text>
            <text x={PAGE_W - 96} y={1500} fontSize={90} textAnchor="end" fontFamily={DISPLAY} fontWeight={800}>
              {w.daysRead}
            </text>
            <text x={96} y={1630} fontSize={40}>
              Longest streak
            </text>
            <text x={PAGE_W - 96} y={1630} fontSize={90} textAnchor="end" fontFamily={DISPLAY} fontWeight={800}>
              {w.bestStreak} {w.bestStreak === 1 ? 'day' : 'days'}
            </text>
          </g>
          <Footer n={n} total={total} />
        </>
      ),
    });
  }

  if (w.top) {
    const top = w.top;
    pages.push({
      key: 'top',
      label: 'Top book',
      draw: (a, n, total) => (
        <>
          <rect width={PAGE_W} height={PAGE_H} fill="#fbeee4" />
          <Grain id="top" opacity={0.22} />
          <Edge />
          <Stars seed={17} n={14} colors={[PINK, PEACH, INK]} />
          <text x={96} y={220} fontFamily={DISPLAY} fontWeight={800} fontSize={110} letterSpacing={-5} fill={INK}>
            {year ? 'Book of the year' : 'Book of the month'}
          </text>
          <Panel book={top.book} cover={a.covers[top.book.id]} x={250} y={340} w={560} h={800} rotate={-3} />
          <image href={a.cat.happy} x={690} y={950} width={330} height={330} />
          <Lines lines={wrap(top.book.title, 880, 76, 0.52, 2)} x={96} y={1330} size={76} lh={84} fill={INK} fontFamily={DISPLAY} fontWeight={800} />
          <text x={96} y={1530} fontFamily={DISPLAY} fontWeight={800} fontSize={120} letterSpacing={-5} fill="#e8320e">
            {hours(top.minutes)}
          </text>
          <text x={96} y={1610} fontFamily={SANS} fontSize={40} fill="#3b3752">
            {top.chapters} {top.chapters === 1 ? 'chapter' : 'chapters'} read{top.book.author ? ` · ${top.book.author}` : ''}
          </text>
          <Footer n={n} total={total} />
        </>
      ),
    });
  }

  if (w.genres.length) {
    const total = w.genres.reduce((s, g) => s + g.minutes, 0);
    const three = w.genres.slice(0, 3);
    const pct = (m: number) => `${Math.round((m / total) * 100)}%`;
    const comets = [
      { d: 'M-60 1680 C 270 1410, 660 1260, 1200 900', color: '#ffd23f', width: 138 },
      { d: 'M-60 1830 C 330 1620, 690 1500, 1200 1260', color: '#ff8a3d', width: 84 },
      { d: 'M-60 1950 C 360 1800, 750 1740, 1200 1560', color: '#d63cc4', width: 78 },
    ];
    pages.push({
      key: 'genres',
      label: 'Genres',
      draw: (a, n, t) => (
        <>
          <defs>
            <linearGradient id="genres-bg" x1="0" y1="0" x2="0.3" y2="1">
              <stop offset="0" stopColor="#c9a9c8" />
              <stop offset="0.5" stopColor="#e9a3b8" />
              <stop offset="1" stopColor="#b9a2c9" />
            </linearGradient>
          </defs>
          <rect width={PAGE_W} height={PAGE_H} fill="url(#genres-bg)" />
          <Grain id="genres" opacity={0.22} />
          {three.map((g, i) => (
            <path key={g.id} d={comets[i].d} stroke={comets[i].color} strokeWidth={comets[i].width} fill="none" strokeLinecap="round" opacity={0.92} />
          ))}
          <Stars seed={21} n={14} y={0} h={900} colors={['#fff7e8', '#ffd23f', INK]} />
          <Edge />
          <Lines lines={wrap(`You lived in ${three[0].label}.`, 900, 120, 0.56, 3)} x={90} y={200} size={120} lh={116} fill={INK} fontFamily={DISPLAY} fontWeight={800} letterSpacing={-4} />
          <rect x={640} y={1000} width={340} height={340} fill="#fff1c9" stroke={INK} strokeWidth={9} transform="rotate(4 810 1170)" />
          <image href={a.cat.happy} x={658} y={1018} width={304} height={304} transform="rotate(4 810 1170)" />
          <g fontFamily={SANS} fontSize={52} fill={INK}>
            {three.map((g, i) => (
              <g key={g.id}>
                <text x={250} y={620 + i * 100} textAnchor="end" fontFamily={DISPLAY} fontWeight={800} fontSize={64}>
                  {pct(g.minutes)}
                </text>
                <text x={290} y={620 + i * 100} fontWeight={600}>
                  {g.label}
                </text>
              </g>
            ))}
          </g>
          {w.languages.length > 0 && (
            <Lines
              lines={wrap(`Read from ${w.languages.map((l) => l.label).join(', ')}.`, 860, 38, 0.5, 3)}
              x={96}
              y={930}
              size={38}
              lh={50}
              fill="#3b3752"
              fontFamily={SANS}
            />
          )}
          <Footer n={n} total={t} />
        </>
      ),
    });
  }

  if (w.finished.length || w.started.length) {
    const shown = (w.finished.length ? w.finished : w.started).slice(-4);
    const few = shown.length <= 2;
    const pw = few ? 430 : 360;
    const ph = few ? 620 : 500;
    const spots = few
      ? [
          { x: 90, y: 560, r: -5 },
          { x: 560, y: 900, r: 5 },
        ]
      : [
          { x: 110, y: 600, r: -5 },
          { x: 580, y: 660, r: 5 },
          { x: 150, y: 1120, r: 3 },
          { x: 600, y: 1160, r: -4 },
        ];
    pages.push({
      key: 'books',
      label: 'Books',
      draw: (a, n, total) => (
        <>
          <rect width={PAGE_W} height={PAGE_H} fill="#17121c" />
          <Grain id="books" opacity={0.1} />
          <Edge />
          <Stars seed={31} n={24} colors={['#6b6078', PEACH, LILAC]} />
          <text x={96} y={230} fontFamily={DISPLAY} fontWeight={800} fontSize={150} letterSpacing={-6} fill={CREAM}>
            {w.finished.length} finished
          </text>
          <text x={96} y={330} fontFamily={DISPLAY} fontWeight={800} fontSize={80} letterSpacing={-3} fill={PINK}>
            {w.started.length} started
          </text>
          {shown.map((b, i) => (
            <g key={b.id}>
              <Panel book={b} cover={a.covers[b.id]} x={spots[i].x} y={spots[i].y} w={pw} h={ph} rotate={spots[i].r} />
              <rect x={spots[i].x + pw / 2 - 65} y={spots[i].y - 24} width={130} height={44} fill="rgba(247,196,141,0.85)" transform={`rotate(${spots[i].r * 2} ${spots[i].x + pw / 2} ${spots[i].y})`} />
            </g>
          ))}
          <Footer n={n} total={total} dark />
        </>
      ),
    });
  }

  if (w.quote) {
    const q = w.quote;
    const size = q.text.length > 110 ? 76 : q.text.length > 60 ? 92 : 112;
    pages.push({
      key: 'quote',
      label: 'Quote',
      draw: (a, n, total) => (
        <>
          <rect width={PAGE_W} height={PAGE_H} fill="#fff7e8" />
          <Grain id="quote" opacity={0.2} />
          <Edge />
          <text x={96} y={210} fontFamily={DISPLAY} fontWeight={800} fontSize={96} letterSpacing={-4} fill={INK}>
            A line you kept
          </text>
          <polygon points={burst(41, 170, 420, 110, 70, 11)} fill={PINK} stroke={INK} strokeWidth={7} />
          <text x={170} y={470} textAnchor="middle" fontFamily={SERIF} fontSize={150} fill={INK}>
            “
          </text>
          <Lines lines={wrap(q.text, 860, size, 0.44, 8)} x={110} y={640} size={size} lh={size * 1.08} fill={INK} fontFamily={SERIF} fontStyle="italic" />
          <Lines
            lines={wrap(`${q.book.title}${q.chapter ? `, chapter ${q.chapter}` : ''}`, 600, 40, 0.52, 3)}
            x={110}
            y={1500}
            size={40}
            lh={52}
            fill="#3b3752"
            fontFamily={SANS}
          />
          <text x={110} y={1700} fontFamily={DISPLAY} fontWeight={800} fontSize={90} fill="#e8320e">
            {w.highlights}
          </text>
          <text x={110} y={1760} fontFamily={SANS} fontSize={36} fill={INK}>
            {w.highlights === 1 ? 'line highlighted' : 'lines highlighted'} {year ? 'this year' : 'this month'}
          </text>
          <image href={a.cat.resting} x={660} y={1380} width={380} height={380} />
          <Footer n={n} total={total} />
        </>
      ),
    });
  }

  const next = w.period.kind === 'year' ? String(w.period.year + 1) : 'next month';
  pages.push({
    key: 'end',
    label: 'The end',
    draw: (a, n, total) => (
      <>
        <defs>
          <linearGradient id="end-bg" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor="#e9a3b8" />
            <stop offset="1" stopColor={PEACH} />
          </linearGradient>
        </defs>
        <rect width={PAGE_W} height={PAGE_H} fill="url(#end-bg)" />
        <Grain id="end" opacity={0.28} freq={0.9} />
        <Edge />
        <Stars seed={53} n={18} colors={['#fff7e8', INK, '#ff4fa3']} />
        <text x={540} y={300} textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize={96} fill={INK}>
          That was {short}.
        </text>
        <polygon points={burst(57, 540, 760, 420, 290, 15)} fill={INK} />
        <image href={a.cat.sly} x={340} y={560} width={400} height={400} />
        <g fontFamily={DISPLAY} fontWeight={800} fill={INK} textAnchor="middle">
          <text x={540} y={1260} fontSize={92} letterSpacing={-3}>
            {hours(w.totalMinutes)} · {w.daysRead} days
          </text>
          <text x={540} y={1370} fontSize={64}>
            {w.finished.length} finished · {w.highlights} lines kept
          </text>
        </g>
        <text x={540} y={1520} textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize={70} fill={INK}>
          See you in {next}.
        </text>
        <Footer n={n} total={total} />
      </>
    ),
  });

  return pages;
}
