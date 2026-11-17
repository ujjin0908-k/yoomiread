import type { GlossaryKind } from '../types';
import type { WorldAt, WorldEntry, WorldPair } from './visible';

/**
 * The people web: who is drawn, how big, and where. Pure logic (no drawing), so it can be tested.
 *
 * The layout is worked out once, for the world at my reading line, and every earlier chapter shows a part of it.
 * So when the chapter slider moves, faces and lines appear and fade in place and nothing else jumps about.
 */

/** What kind of link it is, from its label: decides its colour and which filter it answers to. */
export type Tone = 'bond' | 'faith' | 'conflict' | 'other';

const CONFLICT = /enem|rival|oppos|kill|betray|suspicious|imprison|captur|hunt|fought|hate|curse|against|attack/i;
const BOND = /friend|sister|brother|father|mother|aunt|uncle|wife|husband|\bson\b|daughter|child|love|ally|allied|teammate|saved|help|trust|taught|teach|neighbou?r|personality|body of|protect|debt|master|student|disciple|mentor|partner/i;
const FAITH = /follow|herald|god of|member|class|lead|found|chosen|no\. ?\d|host of|rule|shelter|moved to|throne|became|serve|worship|belong/i;

export function toneOf(label: string): Tone {
  if (CONFLICT.test(label)) return 'conflict';
  if (BOND.test(label)) return 'bond';
  if (FAITH.test(label)) return 'faith';
  return 'other';
}

export interface WebNode {
  id: string;
  entry: WorldEntry;
  kind: GlossaryKind;
  main: boolean;
  /** How many links it has. */
  degree: number;
  /** Radius, in layout units. */
  r: number;
  x: number;
  y: number;
}

export interface WebEdge {
  id: string;
  a: string;
  b: string;
  pair: WorldPair;
  tone: Tone;
}

export interface Web {
  nodes: WebNode[];
  edges: WebEdge[];
  byId: Map<string, WebNode>;
  edgeById: Map<string, WebEdge>;
  /** For each node, the nodes it is linked to. */
  around: Map<string, Set<string>>;
}

const BASE: Record<GlossaryKind, number> = { person: 15, god: 17, group: 16, place: 11, term: 11 };

/** Everyone in the web: every person, and anything else that has a link. */
export function buildWeb(world: WorldAt): Web {
  const degree = new Map<string, number>();
  for (const p of world.pairs) {
    degree.set(p.from, (degree.get(p.from) ?? 0) + 1);
    degree.set(p.to, (degree.get(p.to) ?? 0) + 1);
  }
  const nodes: WebNode[] = world.entries
    .filter((e) => e.kind === 'person' || degree.has(e.id))
    .map((e) => {
      const d = degree.get(e.id) ?? 0;
      const main = e.kind === 'person' && e.role === 'main';
      return { id: e.id, entry: e, kind: e.kind, main, degree: d, r: BASE[e.kind] + (main ? 9 : 0) + Math.min(9, Math.sqrt(d) * 2.2), x: 0, y: 0 };
    });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: WebEdge[] = world.pairs
    .filter((p) => byId.has(p.from) && byId.has(p.to))
    .map((p) => ({ id: `${p.from}>${p.to}`, a: p.from, b: p.to, pair: p, tone: toneOf(p.current.label) }));
  const around = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!around.has(e.a)) around.set(e.a, new Set());
    if (!around.has(e.b)) around.set(e.b, new Set());
    around.get(e.a)!.add(e.b);
    around.get(e.b)!.add(e.a);
  }
  return { nodes, edges, byId, edgeById: new Map(edges.map((e) => [e.id, e])), around };
}

/** A number from 0 to 1 that is always the same for the same text. */
export function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Places every node: linked ones pull together, everyone pushes apart, nobody overlaps, and the best-connected sit
 * near the middle. The same world always gives the same picture (the start is set by each name, not by chance).
 */
export function layoutWeb(web: Web, ticks = 320): void {
  const { nodes, edges, byId } = web;
  const n = nodes.length;
  if (!n) return;
  const most = Math.max(1, ...nodes.map((d) => d.degree));
  const spread = 60 + Math.sqrt(n) * 34;
  nodes.forEach((d) => {
    const angle = hash01(d.id) * Math.PI * 2;
    const far = spread * (1.05 - 0.75 * (d.degree / most)) * (0.6 + 0.4 * hash01(`${d.id}r`));
    d.x = Math.cos(angle) * far;
    d.y = Math.sin(angle) * far;
  });
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const index = new Map(nodes.map((d, i) => [d.id, i]));
  const springs = edges.map((e) => {
    const a = byId.get(e.a)!;
    const b = byId.get(e.b)!;
    // Busy nodes hold their links at arm's length, so a hub is a star and not a knot.
    const rest = a.r + b.r + 34 + Math.min(70, (Math.min(a.degree, b.degree) - 1) * 9) + (e.tone === 'faith' ? 16 : 0);
    return { i: index.get(e.a)!, j: index.get(e.b)!, rest };
  });
  for (let t = 0; t < ticks; t++) {
    const heat = 1 - t / ticks;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = hash01(a.id + b.id) - 0.5;
          dy = hash01(b.id + a.id) - 0.5;
          d2 = dx * dx + dy * dy + 0.01;
        }
        const d = Math.sqrt(d2);
        // Push apart, harder when close; a firm shove when two would overlap (with room for the name under each).
        const gap = a.r + b.r + 16;
        let f = (1500 * heat) / d2;
        if (d < gap) f += ((gap - d) / d) * 0.5;
        const fx = dx * f;
        const fy = dy * f;
        vx[i] -= fx;
        vy[i] -= fy;
        vx[j] += fx;
        vy[j] += fy;
      }
    }
    for (const s of springs) {
      const a = nodes[s.i];
      const b = nodes[s.j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - s.rest) / d) * 0.06;
      vx[s.i] += dx * f;
      vy[s.i] += dy * f;
      vx[s.j] -= dx * f;
      vy[s.j] -= dy * f;
    }
    for (let i = 0; i < n; i++) {
      const d = nodes[i];
      // A pull to the middle: firmer for the main cast and the best connected (the story turns around them), and a
      // little more for the unlinked so they ring the web instead of drifting off.
      const pull = d.degree ? 0.012 + 0.02 * (d.degree / most) + (d.main ? 0.045 : 0) : 0.03;
      vx[i] -= d.x * pull;
      vy[i] -= d.y * pull;
      vx[i] *= 0.62;
      vy[i] *= 0.62;
      d.x += Math.max(-30, Math.min(30, vx[i]));
      d.y += Math.max(-30, Math.min(30, vy[i]));
    }
  }
  // The phone is taller than it is wide: stretch the web to suit, then part any faces the squeeze pushed together.
  for (const d of nodes) {
    d.x *= 0.88;
    d.y *= 1.22;
  }
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const d = Math.hypot(dx, dy);
        const gap = a.r + b.r + 14;
        if (d >= gap) continue;
        const push = (gap - d) / d / 2;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** The box that holds every node, for fitting the web to the screen. */
export function bounds(points: { x: number; y: number; r?: number }[]): { x: number; y: number; w: number; h: number } {
  if (!points.length) return { x: -100, y: -100, w: 200, h: 200 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    const r = p.r ?? 0;
    x0 = Math.min(x0, p.x - r);
    y0 = Math.min(y0, p.y - r);
    x1 = Math.max(x1, p.x + r);
    y1 = Math.max(y1, p.y + r);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
