import { useState } from 'react';
import { PageTitle, TabBar } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { computeStats, formatDuration, type Stats as StatsData } from '../logic';
import { formatCost } from '../translate/prompt';

export function Stats() {
  const stats = useLive(async () => computeStats(await db.books.toArray(), await db.sessions.toArray()), []);
  const spent = useLive(async () => {
    const books = await db.books.toArray();
    return { total: books.reduce((sum, b) => sum + (b.spent ?? 0), 0), estimated: books.some((b) => b.spentEstimated) };
  }, []);

  return (
    <>
      <main className="page tabs-page">
        <PageTitle title="Stats" sub="Time spent with my books" />
        {stats && (
          <>
            <section className="hero-stats">
              <div>
                <span className="hero-label">Reading time</span>
                <span className="hero-num">{formatDuration(stats.totalMs)}</span>
              </div>
              <div>
                <span className="hero-label">Total sessions</span>
                <span className="hero-num">{stats.sessions}</span>
              </div>
            </section>
            <section className="tiles">
              <Tile label="Day streak" value={String(stats.streak)} />
              <Tile label={`Read in ${new Date().getFullYear()}`} value={String(stats.finishedThisYear)} />
              <Tile label="Average rating" value={stats.averageRating ? `${stats.averageRating.toFixed(1)} ★` : '–'} />
            </section>
            {spent && spent.total > 0 && (
              <section className="tiles one">
                <Tile label={`Spent on AI translation${spent.estimated ? ' (partly estimated)' : ''}`} value={formatCost(spent.total)} />
              </section>
            )}
            <DailyChart stats={stats} />
          </>
        )}
      </main>
      <TabBar active="stats" />
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="tile-num">{value}</span>
      <span className="tile-label">{label}</span>
    </div>
  );
}

const W = 340;
const H = 150;
const PAD = { top: 12, right: 4, bottom: 22, left: 26 };

function niceMax(v: number): number {
  if (v <= 10) return 10;
  const step = v <= 60 ? 15 : v <= 180 ? 30 : 60;
  return Math.ceil(v / step) * step;
}

/** Minutes read per day: one series, so no legend; tap a bar for its value. */
function DailyChart({ stats }: { stats: StatsData }) {
  const [hover, setHover] = useState<number>();
  const days = stats.daily;
  const max = niceMax(Math.max(...days.map((d) => d.minutes)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / days.length;
  const barW = Math.max(4, slot - 6);
  const y = (m: number) => PAD.top + innerH - (m / max) * innerH;
  const label = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const active = hover !== undefined ? days[hover] : undefined;

  return (
    <section className="chart-card">
      <div className="section-head">
        <h2>Minutes per day</h2>
        <span className="muted small">Last {days.length} days</span>
      </div>
      <div className="chart-wrap" onPointerLeave={() => setHover(undefined)}>
        {active && (
          <div className="chart-tip" style={{ left: `${((PAD.left + slot * hover! + slot / 2) / W) * 100}%` }}>
            <strong>{active.minutes} min</strong>
            <span>{label(active.day)}</span>
          </div>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Minutes read per day, last 14 days">
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = PAD.left + slot * i + (slot - barW) / 2;
            const h = Math.max(0, y(0) - y(d.minutes));
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={d.day}>
                {h > 0 && (
                  <path
                    className={`bar-mark ${hover === i ? 'on' : ''}`}
                    d={`M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barW - r} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + r} V${y(0)} Z`}
                  />
                )}
                {(i === 0 || i === days.length - 1 || i === Math.floor(days.length / 2)) && (
                  <text className="axis" x={x + barW / 2} y={H - 6} textAnchor="middle">
                    {i === days.length - 1 ? 'Today' : label(d.day)}
                  </text>
                )}
                {/* Hit area taller and wider than the bar. */}
                <rect
                  className="hit"
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={innerH}
                  onPointerEnter={() => setHover(i)}
                  onPointerDown={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <details className="chart-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Minutes</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.day}>
                <td>{label(d.day)}</td>
                <td>{d.minutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
