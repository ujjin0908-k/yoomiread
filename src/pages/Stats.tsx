import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Cover, PageTitle, TabBar } from '../components';
import { useLive } from '../hooks';
import { useCountUp } from '../motion';
import { aiSpent, statsInput } from '../queries';
import { formatCost } from '../translate/prompt';
import { lineFor } from '../mascot/lines';
import { useMood } from '../mascot/useMood';
import { Wizard } from '../mascot/Wizard';
import { periodId, periodName, wrapsOffered } from '../wrapped/data';
import { BAND_HOURS, BANDS, calendar, hours, RANGES, readingReport, WEEKDAYS, type Bucket, type Range, type Report, type Share } from '../stats';

const RANGE_KEY = 'stats-range';
const savedRange = (): Range => {
  try {
    const r = localStorage.getItem(RANGE_KEY);
    return RANGES.some((x) => x.id === r) ? (r as Range) : 'week';
  } catch {
    return 'week';
  }
};

/** The words for "this week", "last week" and so on. */
const PERIOD: Record<Range, { now: string; before: string }> = {
  week: { now: 'Last 7 days', before: 'the 7 days before' },
  month: { now: 'Last 30 days', before: 'the 30 days before' },
  year: { now: 'Last 12 months', before: 'the 12 months before' },
  all: { now: 'Since your first session', before: '' },
};

export function Stats() {
  const input = useLive(statsInput, [], 'stats-input');
  const spent = useLive(aiSpent, [], 'spent');
  const [range, setRangeState] = useState<Range>(savedRange);
  const setRange = (r: Range) => {
    setRangeState(r);
    try {
      localStorage.setItem(RANGE_KEY, r);
    } catch {
      // Only a convenience.
    }
  };
  const report = useMemo(() => (input ? readingReport(input, range) : undefined), [input, range]);
  const cal = useMemo(() => (input ? calendar(input.sessions) : undefined), [input]);
  const { mood, trouble } = useMood();

  return (
    <>
      <main className="page tabs-page stats-page">
        <PageTitle title="Stats" sub="Time spent with my books" />
        {mood && (
          <section className="wizard-card">
            <Wizard mood={mood} size={120} />
            <p>{lineFor(mood, new Date().toDateString(), trouble)}</p>
          </section>
        )}
        {input && <WrapEntry sessions={input.sessions} />}
        <div className="seg stats-range" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.id} type="button" className={r.id === range ? 'on' : ''} aria-pressed={r.id === range} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        {report && cal && (
          <>
            <Hero report={report} />
            <section className="tiles">
              <Tile label="Day streak" value={<Count value={report.streak} />} />
              <Tile label="Best streak" value={<Count value={report.bestStreak} />} />
              <Tile label="Books finished" value={<Count value={report.finished} />} />
            </section>
            <section className="tiles quiet">
              <Tile label="Chapters opened" value={<Count value={report.chapters} />} />
              <Tile label="Chapters per hour" value={report.chaptersPerHour !== undefined ? <Count value={report.chaptersPerHour} show={(v) => v.toFixed(1)} /> : '–'} />
              <Tile label="Sessions" value={<Count value={report.sessions} />} />
            </section>
            <TimeChart report={report} />
            <YearCalendar weeks={cal.weeks} firstDay={cal.firstDay} />
            <Rhythm report={report} />
            <WhatYouRead genres={report.genres} languages={report.languages} />
            <BookList report={report} />
            {spent && spent.total > 0 && (
              <section className="tiles one">
                <Tile label={`Spent on AI translation, all time${spent.estimated ? ' (partly estimated)' : ''}`} value={formatCost(spent.total)} />
              </section>
            )}
          </>
        )}
      </main>
      <TabBar active="stats" />
    </>
  );
}

/** A number that counts up when it first shows. */
function Count({ value, show = (v) => String(Math.round(v)) }: { value: number; show?: (v: number) => string }) {
  const now = useCountUp(value);
  return (
    <>
      <span aria-hidden="true">{show(now)}</span>
      <span className="sr-only">{show(value)}</span>
    </>
  );
}

function Tile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="tile">
      <span className="tile-num">{value}</span>
      <span className="tile-label">{label}</span>
    </div>
  );
}

function Hero({ report }: { report: Report }) {
  const p = PERIOD[report.range];
  const before = report.previousMinutes;
  let compare: string | undefined;
  if (before !== undefined && (before > 0 || report.totalMinutes > 0)) {
    if (!before) compare = `Nothing in ${p.before}`;
    else {
      const change = Math.round(((report.totalMinutes - before) / before) * 100);
      compare = change === 0 ? `Same as ${p.before}` : `${change > 0 ? '▲' : '▼'} ${Math.abs(change)}% vs ${p.before}`;
    }
  }
  return (
    <section className="hero-stats stats-hero">
      <div className="stats-hero-main">
        <span className="hero-label">Reading time · {p.now}</span>
        <span className="hero-num big">
          <Count value={report.totalMinutes} show={(v) => hours(v)} />
        </span>
        {compare && <span className="hero-compare">{compare}</span>}
      </div>
      <div>
        <span className="hero-label">Days read</span>
        <span className="hero-num">
          <Count value={report.daysRead} />
        </span>
      </div>
      <div>
        <span className="hero-label">On a reading day</span>
        <span className="hero-num">
          <Count value={report.perReadingDay} show={(v) => hours(v)} />
        </span>
      </div>
    </section>
  );
}

function ChartCard({ title, note, children, table }: { title: string; note?: string; children: ReactNode; table?: ReactNode }) {
  return (
    <section className="chart-card">
      <div className="section-head">
        <h2>{title}</h2>
        {note && <span className="muted small">{note}</span>}
      </div>
      {children}
      {table && (
        <details className="chart-table">
          <summary>Show as table</summary>
          {table}
        </details>
      )}
    </section>
  );
}

const W = 340;
const H = 150;
const PAD = { top: 12, right: 4, bottom: 22, left: 30 };

function niceMax(v: number): number {
  if (v <= 10) return 10;
  const step = v <= 60 ? 15 : v <= 180 ? 30 : v <= 600 ? 60 : v <= 1800 ? 300 : 600;
  return Math.ceil(v / step) * step;
}

function bucketLabel(b: Bucket, long = false): string {
  const d = new Date(b.start);
  if (b.unit === 'year') return String(d.getFullYear());
  if (b.unit === 'month') return d.toLocaleDateString(undefined, long ? { month: 'long', year: 'numeric' } : { month: 'short' });
  return d.toLocaleDateString(undefined, long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
}

/** Axis minutes: plain minutes under 2 hours, else hours. */
const axisLabel = (m: number, max: number) => (max >= 120 ? `${Math.round(m / 60)}h` : String(m));

/** Reading time per day (week, month) or per month (year, all time). One series: no legend; tap a bar for its value. */
function TimeChart({ report }: { report: Report }) {
  const [hover, setHover] = useState<number>();
  const list = report.buckets;
  const max = niceMax(Math.max(...list.map((b) => b.minutes)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / list.length;
  const gap = list.length > 20 ? 2 : 6;
  const barW = Math.max(3, slot - gap);
  const y = (m: number) => PAD.top + innerH - (m / max) * innerH;
  const active = hover !== undefined ? list[hover] : undefined;
  const unit = list[0]?.unit ?? 'day';
  const average = report.totalMinutes / Math.max(1, list.length);
  const labelled = new Set([0, Math.floor((list.length - 1) / 2), list.length - 1]);

  return (
    <ChartCard
      title="Reading time"
      note={report.totalMinutes > 0 ? `per ${unit} · average ${hours(average)} (dashed)` : `per ${unit}`}
      table={
        <table>
          <thead>
            <tr>
              <th>{unit === 'day' ? 'Day' : unit === 'month' ? 'Month' : 'Year'}</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {[...list].reverse().map((b) => (
              <tr key={b.start}>
                <td>{bucketLabel(b, true)}</td>
                <td>{hours(b.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="chart-wrap" onPointerLeave={() => setHover(undefined)}>
        {active && (
          <div className="chart-tip" style={{ left: `${((PAD.left + slot * hover! + slot / 2) / W) * 100}%` }}>
            <strong>{hours(active.minutes)}</strong>
            <span>{bucketLabel(active, true)}</span>
          </div>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Reading time per ${unit}, ${PERIOD[report.range].now.toLowerCase()}`}>
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end">
                {axisLabel(t, max)}
              </text>
            </g>
          ))}
          {list.map((b, i) => {
            const x = PAD.left + slot * i + (slot - barW) / 2;
            const h = Math.max(0, y(0) - y(b.minutes));
            const r = Math.min(4, barW / 2, h);
            const last = i === list.length - 1;
            return (
              <g key={b.start}>
                {h > 0 && (
                  <path
                    className={`bar-mark${hover === i ? ' on' : ''}${last ? ' now' : ''}`}
                    style={{ '--i': i } as CSSProperties}
                    d={`M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barW - r} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + r} V${y(0)} Z`}
                  />
                )}
                {labelled.has(i) && (
                  <text className="axis" x={x + barW / 2} y={H - 6} textAnchor={i === 0 ? 'start' : last ? 'end' : 'middle'}>
                    {last && unit === 'day' ? 'Today' : bucketLabel(b)}
                  </text>
                )}
                <rect className="hit" x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
              </g>
            );
          })}
          {report.totalMinutes > 0 && list.length > 1 && (
            <g className="avg-line">
              <line x1={PAD.left} x2={W - PAD.right} y1={y(average)} y2={y(average)} />
            </g>
          )}
        </svg>
      </div>
    </ChartCard>
  );
}

/** Five steps of one hue, light to dark: 0 = nothing, then quarters of the busiest. */
function level(m: number | null, max: number): number {
  if (!m) return 0;
  return Math.min(4, Math.max(1, Math.ceil((m / Math.max(1, max)) * 4)));
}

function Legend() {
  return (
    <div className="heat-legend" aria-hidden="true">
      <span>Less</span>
      {[0, 1, 2, 3, 4].map((l) => (
        <i key={l} className={`heat l${l}`} />
      ))}
      <span>More</span>
    </div>
  );
}

/** The last 12 months, a square per day, darker the more was read: two rows of half a year, so the squares stay big enough to tap. */
function YearCalendar({ weeks, firstDay }: { weeks: (number | null)[][]; firstDay: number }) {
  const [picked, setPicked] = useState<{ day: number; minutes: number }>();
  const max = Math.max(...weeks.flat().map((m) => m ?? 0));
  const half = Math.ceil(weeks.length / 2);
  const step = 12.4;
  const cell = 10.4;
  const left = 16;
  const blockH = 14 + 7 * step;
  const dayMs = (w: number, d: number) => new Date(firstDay).setDate(new Date(firstDay).getDate() + w * 7 + d);
  const days = weeks.flat().filter((m) => m && m > 0).length;
  const block = (from: number, to: number, y0: number) => {
    const cols = weeks.slice(from, to);
    return (
      <g key={from}>
        {cols.map((_, i) => {
          const d = new Date(dayMs(from + i, 0));
          return d.getDate() <= 7 ? (
            <text key={i} className="axis" x={left + i * step} y={y0 + 9}>
              {d.toLocaleDateString(undefined, { month: 'short' })}
            </text>
          ) : null;
        })}
        {['M', 'W', 'F'].map((l, i) => (
          <text key={l} className="axis" x={0} y={y0 + 14 + i * 2 * step + cell - 2}>
            {l}
          </text>
        ))}
        {cols.map((col, i) =>
          col.map((m, d) =>
            m === null ? null : (
              <rect
                key={`${i}-${d}`}
                className={`heat l${level(m, max)}${picked?.day === dayMs(from + i, d) ? ' picked' : ''}`}
                x={left + i * step}
                y={y0 + 14 + d * step}
                width={cell}
                height={cell}
                rx="2"
                onPointerDown={() => setPicked({ day: dayMs(from + i, d), minutes: m })}
              />
            ),
          ),
        )}
      </g>
    );
  };
  return (
    <ChartCard title="Your year" note={`${days} reading ${days === 1 ? 'day' : 'days'}`}>
      <svg className="heat-svg" viewBox={`0 0 ${left + half * step} ${2 * blockH + 8}`} role="img" aria-label={`Reading days over the last 12 months: ${days} days with reading`}>
        {block(0, half, 0)}
        {block(half, weeks.length, blockH + 8)}
      </svg>
      <div className="heat-foot">
        <span className="small muted">
          {picked
            ? `${new Date(picked.day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${picked.minutes ? hours(picked.minutes) : 'no reading'}`
            : 'Tap a day to see it'}
        </span>
        <Legend />
      </div>
    </ChartCard>
  );
}

const PEAK_WORDS = ['at night', 'early in the morning', 'in the morning', 'in the afternoon', 'in the evening', 'late in the evening'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** When the reading happens: weekday × time of day. */
function Rhythm({ report }: { report: Report }) {
  const [picked, setPicked] = useState<{ w: number; b: number }>();
  const max = Math.max(...report.rhythm.flat());
  const left = 44;
  const top = 26;
  const cw = (W - left - 4) / BANDS.length;
  const ch = 22;
  const p = report.peak;
  return (
    <ChartCard
      title="When you read"
      note={p ? `Mostly ${DAY_NAMES[p.weekday]}s ${PEAK_WORDS[p.band]}` : undefined}
      table={
        <table>
          <thead>
            <tr>
              <th />
              {BANDS.map((b) => (
                <th key={b}>{b}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((d, w) => (
              <tr key={d}>
                <td>{d}</td>
                {report.rhythm[w].map((m, b) => (
                  <td key={b}>{m ? hours(m) : '–'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <svg viewBox={`0 0 ${W} ${top + 7 * ch + 4}`} role="img" aria-label={p ? `Reading by weekday and time of day: mostly ${DAY_NAMES[p.weekday]}s ${PEAK_WORDS[p.band]}` : 'Reading by weekday and time of day'}>
        {BANDS.map((b, i) => (
          <g key={b}>
            <text className="axis" x={left + i * cw + cw / 2} y={10} textAnchor="middle">
              {b}
            </text>
            <text className="axis tiny" x={left + i * cw + cw / 2} y={20} textAnchor="middle">
              {BAND_HOURS[i]}
            </text>
          </g>
        ))}
        {WEEKDAYS.map((d, w) => (
          <g key={d}>
            <text className="axis" x={0} y={top + w * ch + ch / 2 + 3}>
              {d}
            </text>
            {report.rhythm[w].map((m, b) => (
              <rect
                key={b}
                className={`heat l${level(m, max)}${picked?.w === w && picked.b === b ? ' picked' : ''}`}
                x={left + b * cw + 1.5}
                y={top + w * ch + 1.5}
                width={cw - 3}
                height={ch - 3}
                rx="4"
                onPointerDown={() => setPicked({ w, b })}
              />
            ))}
          </g>
        ))}
      </svg>
      <div className="heat-foot">
        <span className="small muted">
          {picked
            ? `${DAY_NAMES[picked.w]}, ${BANDS[picked.b].toLowerCase()} (${BAND_HOURS[picked.b]}): ${report.rhythm[picked.w][picked.b] ? hours(report.rhythm[picked.w][picked.b]) : 'no reading'}`
            : 'Tap a square to see it'}
        </span>
        <Legend />
      </div>
    </ChartCard>
  );
}

/** Time per genre and per language: one measure each, bars sorted biggest first, values written beside them. */
function Bars({ list }: { list: Share[] }) {
  const max = Math.max(1, ...list.map((s) => s.minutes));
  const total = list.reduce((n, s) => n + s.minutes, 0);
  return (
    <ul className="hbars">
      {list.map((s) => (
        <li key={s.id}>
          <span className="hbar-label">{s.label}</span>
          <span className="hbar-track">
            <span className="hbar" style={{ width: `${(s.minutes / max) * 100}%` }} />
          </span>
          <span className="hbar-value">
            {hours(s.minutes)} <span className="muted">· {Math.round((s.minutes / Math.max(1, total)) * 100)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function WhatYouRead({ genres, languages }: { genres: Share[]; languages: Share[] }) {
  if (!genres.length) return null;
  return (
    <ChartCard title="What you read" note="by reading time">
      <h3 className="hbars-head">Genres</h3>
      <Bars list={genres} />
      <h3 className="hbars-head">Languages</h3>
      <Bars list={languages} />
    </ChartCard>
  );
}

function BookList({ report }: { report: Report }) {
  const [all, setAll] = useState(false);
  if (!report.books.length) return null;
  const list = all ? report.books : report.books.slice(0, 5);
  return (
    <ChartCard title="Books" note="by reading time">
      <ul className="stat-books">
        {list.map((r) => (
          <li key={r.book.id}>
            <a href={`#/book/${r.book.id}`}>
              <Cover book={r.book} size="xs" />
              <span className="stat-book-text">
                <span className="stat-book-title">{r.book.title}</span>
                <span className="small muted">
                  {hours(r.minutes)}
                  {r.total ? ` · ${r.read} of ${r.total} chapters` : ''}
                </span>
                {r.total > 0 && (
                  <span className="progress-track" aria-hidden="true">
                    <span className="progress-fill" style={{ width: `${(r.read / r.total) * 100}%` }} />
                  </span>
                )}
                {r.daysLeft !== undefined && (
                  <span className="small muted">{r.daysLeft <= 1 ? 'Done in about a day at your pace' : `Done in about ${forecast(r.daysLeft)} at your pace`}</span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {report.books.length > 5 && !all && (
        <button type="button" className="btn ghost wide" onClick={() => setAll(true)}>
          Show all {report.books.length}
        </button>
      )}
    </ChartCard>
  );
}

function forecast(days: number): string {
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}

/** The way into Reading Wrapped: this year, this month and last month, when they have reading. */
function WrapEntry({ sessions }: { sessions: Parameters<typeof wrapsOffered>[0] }) {
  const offered = wrapsOffered(sessions);
  if (!offered.length) return null;
  return (
    <section className="wrap-entry">
      <div className="wrap-entry-text">
        <span className="wrap-entry-kicker">Reading Wrapped</span>
        <span className="wrap-entry-title">Flip through your reading</span>
        <span className="wrap-entry-sub">Save the pages as pictures, or share them to your story.</span>
      </div>
      <div className="wrap-entry-links">
        {offered.map((p) => (
          <a key={periodId(p)} className="wrap-entry-link" href={`#/wrapped/${periodId(p)}`}>
            {periodName(p, true)}
          </a>
        ))}
      </div>
    </section>
  );
}
