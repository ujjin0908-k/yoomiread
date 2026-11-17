import { useEffect, useMemo, useRef } from 'react';
import { motionOk } from '../motion';
import { initials } from '../pages/Glossary';
import { bounds, buildWeb, hash01, layoutWeb, type Tone, type Web, type WebNode } from './graph';
import { Stage, type StageHandle, type View } from './Stage';
import { glow, ground, palette, useDark, useFaces, widthOf, type Palette } from './paint';
import type { WorldAt } from './visible';

/**
 * The people web: faces joined by lines, drawn on a canvas so it stays smooth with a hundred and more names.
 *
 * `full` is the world at my reading line: it sets where everyone sits. `world` is the world at the chapter the slider
 * is on: it decides who and what is shown. Faces and lines fade in and out in place as the slider moves.
 */
interface Props {
  full: WorldAt;
  world: WorldAt;
  selected?: string;
  onSelect: (id: string | undefined) => void;
  tones: Set<Tone>;
  /** Bumped by the page to ask for "show me everything" again. */
  refit: number;
}

interface Fade {
  a: number;
  /** Not before this time (the opening is staggered from the middle outwards). */
  from: number;
}

export function PeopleWeb({ full, world, selected, onSelect, tones, refit }: Props) {
  const stage = useRef<StageHandle>(null);
  const dark = useDark();
  const colours = palette(dark);

  // Where everyone sits: worked out once per reading line.
  const web = useMemo(() => {
    const w = buildWeb(full);
    layoutWeb(w);
    return w;
  }, [full]);
  // Who shows at the slider's chapter.
  const now = useMemo(() => buildWeb(world), [world]);
  const faces = useFaces(web.nodes.map((n) => n.entry), () => stage.current?.redraw());

  const fades = useRef(new Map<string, Fade>());
  const state = useRef({ web, now, selected, tones, colours, faces, last: 0 });
  state.current = { ...state.current, web, now, selected, tones, colours, faces };

  // Opening: the web blooms from the middle outwards.
  useEffect(() => {
    const t0 = performance.now() + 120;
    const byDistance = [...web.nodes].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    const still = !motionOk();
    fades.current = new Map();
    byDistance.forEach((n, i) => fades.current.set(n.id, { a: still ? 1 : 0, from: t0 + i * 9 }));
    for (const e of web.edges) {
      const later = Math.max(fades.current.get(e.a)?.from ?? t0, fades.current.get(e.b)?.from ?? t0);
      fades.current.set(e.id, { a: still ? 1 : 0, from: later + 160 });
    }
    stage.current?.fit(bounds(web.nodes.filter((n) => now.byId.has(n.id))), 18, true);
    stage.current?.redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [web]);

  useEffect(() => {
    stage.current?.redraw();
  }, [now, selected, tones, dark]);

  useEffect(() => {
    if (refit) stage.current?.fit(bounds(web.nodes.filter((n) => now.byId.has(n.id))), 18);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refit]);

  // Selecting someone brings them and everyone they are linked to into view, clear of the card below.
  useEffect(() => {
    const node = selected ? web.byId.get(selected) : undefined;
    const view = stage.current?.view();
    if (!node || !view) return;
    const circle = [node, ...[...(now.around.get(node.id) ?? [])].map((id) => web.byId.get(id)!).filter(Boolean)];
    const box = bounds(circle.length > 1 ? circle : [{ x: node.x, y: node.y, r: 90 }]);
    stage.current!.fit(box, 34, false, { top: 150, bottom: Math.min(view.h * 0.5, 330) + 40 }, { k: 0.8, x: node.x, y: node.y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function tap(x: number, y: number) {
    const k = stage.current?.view().k ?? 1;
    let best: WebNode | undefined;
    let bestD = Infinity;
    for (const n of web.nodes) {
      if (!now.byId.has(n.id)) continue;
      const d = Math.hypot(n.x - x, n.y - y) - Math.max(n.r, 14 / k);
      if (d < 6 / k && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    onSelect(best?.id);
  }

  function draw(ctx: CanvasRenderingContext2D, view: View, time: number): boolean {
    const s = state.current;
    const dt = Math.min(64, time - (s.last || time));
    s.last = time;
    const c = s.colours;
    let moving = false;

    // Fades: towards 1 when shown at this chapter (and its tone is switched on), towards 0 when not.
    const step = 1 - Math.exp(-dt / 110);
    const settle = (id: string, want: number) => {
      let f = fades.current.get(id);
      if (!f) fades.current.set(id, (f = { a: 0, from: 0 }));
      if (time < f.from) {
        moving = true;
        return 0;
      }
      if (Math.abs(want - f.a) > 0.004) {
        f.a += (want - f.a) * (dt ? step : 1);
        moving = true;
      } else f.a = want;
      return f.a;
    };

    sky(ctx, view, c);

    const sel = s.selected && s.now.byId.has(s.selected) ? s.selected : undefined;
    const near = sel ? s.now.around.get(sel) : undefined;
    const lit = (id: string) => !sel || id === sel || !!near?.has(id);

    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.k, view.k);

    // Groups as soft clouds behind their people.
    for (const n of s.web.nodes) {
      if (n.kind !== 'group' && !(n.kind === 'term' && n.degree >= 2)) continue;
      const a = fades.current.get(n.id)?.a ?? 0;
      if (a < 0.02 || !s.now.byId.has(n.id)) continue;
      const hue = c.clouds[Math.floor(hash01(n.id) * c.clouds.length)];
      const members = [n, ...[...(s.now.around.get(n.id) ?? [])].map((id) => s.web.byId.get(id)!).filter(Boolean)];
      ctx.globalAlpha = a * (lit(n.id) ? 1 : 0.35);
      const cloud = glow(hue);
      for (const m of members) {
        const r = m.r + 46;
        ctx.drawImage(cloud, m.x - r, m.y - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;

    // Lines.
    const labels: { x: number; y: number; text: string; colour: string }[] = [];
    for (const e of s.web.edges) {
      const live = s.now.byId.has(e.a) && s.now.byId.has(e.b) ? s.now.edgeById.get(e.id) : undefined;
      const tone = live?.tone ?? e.tone;
      const a = settle(e.id, live && s.tones.has(tone) ? 1 : 0);
      if (a < 0.02) continue;
      const A = s.web.byId.get(e.a)!;
      const B = s.web.byId.get(e.b)!;
      const strong = sel && (e.a === sel || e.b === sel);
      const colour = c.tone[tone];
      // A gentle bow, always the same way for the same pair.
      const mx = (A.x + B.x) / 2;
      const my = (A.y + B.y) / 2;
      const bow = (hash01(e.id) - 0.5) * 0.24;
      const cx = mx + (B.y - A.y) * bow;
      const cy = my - (B.x - A.x) * bow;
      ctx.globalAlpha = a * (strong ? 0.95 : sel ? 0.07 : c.line);
      ctx.strokeStyle = colour;
      ctx.lineWidth = (strong ? 2 : 1.1) / Math.max(0.6, Math.min(1.4, view.k));
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.quadraticCurveTo(cx, cy, B.x, B.y);
      ctx.stroke();
      if (strong && live) {
        // The label reads from → to: an arrowhead sits where the line meets "to".
        const tx = B.x - cx;
        const ty = B.y - cy;
        const tl = Math.hypot(tx, ty) || 1;
        const hx = B.x - (tx / tl) * (B.r + 3);
        const hy = B.y - (ty / tl) * (B.r + 3);
        const size = 6 / Math.max(0.7, Math.min(1.3, view.k));
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - (tx / tl) * size * 1.6 + (ty / tl) * size * 0.7, hy - (ty / tl) * size * 1.6 - (tx / tl) * size * 0.7);
        ctx.lineTo(hx - (tx / tl) * size * 1.6 - (ty / tl) * size * 0.7, hy - (ty / tl) * size * 1.6 + (tx / tl) * size * 0.7);
        ctx.closePath();
        ctx.fill();
        // The label sits two thirds of the way to the other face, so the labels of a busy face fan out around it
        // instead of piling up on top of it.
        const other = e.a === sel ? 0.66 : 0.34;
        const u = 1 - other;
        labels.push({ x: u * u * A.x + 2 * u * other * cx + other * other * B.x, y: u * u * A.y + 2 * u * other * cy + other * other * B.y, text: live.pair.current.label, colour });
      }
    }
    ctx.globalAlpha = 1;

    // Faces.
    const names: { n: WebNode; a: number; rank: number }[] = [];
    for (const n of s.web.nodes) {
      const a = settle(n.id, s.now.byId.has(n.id) ? 1 : 0);
      if (a < 0.02) continue;
      const on = lit(n.id);
      const alpha = a * (on ? 1 : 0.16);
      const pop = 0.55 + 0.45 * a;
      const r = Math.max(n.r, 3.5 / view.k) * pop;
      ctx.globalAlpha = alpha;
      face(ctx, n, r, c, s.faces.get(n.id), n.id === sel, view.k);
      const rank = (n.id === sel ? 1000 : 0) + (sel && near?.has(n.id) ? 500 : 0) + (n.main ? 200 : 0) + n.degree * 3 + (n.kind === 'god' ? 6 : 0) + r * view.k * 0.4;
      if (on) names.push({ n, a: alpha, rank });
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Names and line labels, in screen pixels so they stay sharp and the same size at any zoom.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const free = (box: { x0: number; y0: number; x1: number; y1: number }) => !taken.some((t) => box.x0 < t.x1 && box.x1 > t.x0 && box.y0 < t.y1 && box.y1 > t.y0);

    ctx.font = `600 11px ${c.font}`;
    for (const l of labels) {
      const x = view.x + l.x * view.k;
      const y = view.y + l.y * view.k;
      const w = widthOf(ctx, l.text) + 14;
      const box = { x0: x - w / 2, y0: y - 10, x1: x + w / 2, y1: y + 10 };
      if (!free(box)) continue;
      taken.push(box);
      ctx.fillStyle = c.pill;
      pillPath(ctx, box.x0, box.y0, w, 20, 10);
      ctx.fill();
      ctx.strokeStyle = l.colour;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = c.ink;
      ctx.fillText(l.text, x, y + 0.5);
    }

    names.sort((a, b) => b.rank - a.rank);
    for (const [place, { n, a }] of names.entries()) {
      const rs = Math.max(n.r * view.k, 3.5);
      // The best-connected are always named; smaller, quieter names appear as you zoom in (when they fit).
      if (place >= 18 && rs < 13 && !(sel && near?.has(n.id))) continue;
      const big = n.main || n.id === sel;
      ctx.font = `${big ? 800 : 600} ${big ? 13 : 11}px ${c.font}`;
      const text = n.entry.english;
      const w = widthOf(ctx, text);
      const x = view.x + n.x * view.k;
      const y = view.y + n.y * view.k + rs + (big ? 11 : 9);
      const box = { x0: x - w / 2 - 3, y0: y - 8, x1: x + w / 2 + 3, y1: y + 8 };
      if (!free(box)) continue;
      taken.push(box);
      ctx.globalAlpha = a;
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = c.halo;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = c.ink;
      ctx.fillText(text, x, y);
    }
    ctx.globalAlpha = 1;
    return moving;
  }

  return <Stage ref={stage} draw={draw} onTap={tap} minZoom={0.22} maxZoom={3.2} top={150} bottom={96} label="The people of the story and how they are linked" />;
}

/** The ground the web sits on: a deep field with drifting dust that moves a little slower than the web (depth). */
export function sky(ctx: CanvasRenderingContext2D, view: View, c: Palette): void {
  ctx.drawImage(ground(view.w, view.h, c.sky, c.glows), 0, 0, view.w, view.h);
  const tile = 420;
  ctx.fillStyle = c.dust;
  for (let i = 0; i < 70; i++) {
    const depth = 0.12 + hash01(`d${i}`) * 0.2;
    const px = (((hash01(`x${i}`) * tile + view.x * depth) % tile) + tile) % tile;
    const py = (((hash01(`y${i}`) * tile * 2 + view.y * depth) % (tile * 2)) + tile * 2) % (tile * 2);
    const size = 0.6 + hash01(`s${i}`) * 1.3;
    for (let ox = px - tile; ox < view.w; ox += tile) {
      if (ox < -4) continue;
      ctx.globalAlpha = 0.25 + hash01(`a${i}`) * 0.6;
      ctx.fillRect(ox, py, size, size);
    }
  }
  ctx.globalAlpha = 1;
}

function pillPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** One face: a picture when there is one, initials on the name's own colour when not. Each kind has its own shape. */
function face(ctx: CanvasRenderingContext2D, n: WebNode, r: number, c: Palette, picture: HTMLImageElement | undefined, selected: boolean, k: number): void {
  const { x, y } = n;
  const fill = n.kind === 'person' ? c.faces[Math.floor(hash01(n.entry.english) * c.faces.length)] : c.kind[n.kind];
  if (n.main || selected) {
    const halo = r * 2.3;
    ctx.drawImage(glow(selected ? c.glowSelected : c.glowMain), x - halo, y - halo, halo * 2, halo * 2);
  }
  ctx.beginPath();
  if (n.kind === 'group') pillPath(ctx, x - r, y - r, r * 2, r * 2, r * 0.42);
  else if (n.kind === 'term') {
    ctx.moveTo(x, y - r * 1.12);
    ctx.lineTo(x + r * 1.12, y);
    ctx.lineTo(x, y + r * 1.12);
    ctx.lineTo(x - r * 1.12, y);
    ctx.closePath();
  } else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (picture && n.kind !== 'term') {
    ctx.save();
    ctx.clip();
    const side = Math.min(picture.naturalWidth, picture.naturalHeight);
    ctx.drawImage(picture, (picture.naturalWidth - side) / 2, (picture.naturalHeight - side) / 2, side, side, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  } else if (r * k > 9) {
    ctx.fillStyle = c.onFace;
    ctx.font = `700 ${r * (n.kind === 'person' ? 0.82 : 0.74)}px ${c.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.kind === 'person' ? initials(n.entry.english) : GLYPH[n.kind], x, y + r * 0.05);
  }
  // The ring: red for the main cast, gold with rays for gods, quiet for the rest.
  ctx.lineWidth = (n.main || selected ? 2.4 : 1.2) / Math.max(0.7, Math.min(1.4, k));
  ctx.strokeStyle = selected ? c.ink : n.main ? c.accent : n.kind === 'god' ? c.gold : c.ring;
  ctx.stroke();
  if (n.kind === 'god' && r * k > 7) {
    ctx.strokeStyle = c.gold;
    ctx.lineWidth = 1.1 / Math.max(0.7, Math.min(1.4, k));
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const long = i % 3 === 0 ? 1.42 : 1.26;
      ctx.moveTo(x + Math.cos(a) * r * 1.14, y + Math.sin(a) * r * 1.14);
      ctx.lineTo(x + Math.cos(a) * r * long, y + Math.sin(a) * r * long);
    }
    ctx.stroke();
  }
}

const GLYPH: Record<string, string> = { god: '✦', group: '⚑', term: '◆', place: '⌂' };

export type { Web };
