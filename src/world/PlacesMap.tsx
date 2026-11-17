import { useEffect, useMemo, useRef } from 'react';
import { motionOk } from '../motion';
import { bounds } from './graph';
import { buildMap, type MapPlace } from './map';
import { ground, palette, useDark, useFaces, widthOf, type Palette } from './paint';
import { Stage, type StageHandle, type View } from './Stage';
import type { WorldAt } from './visible';

/**
 * The map: every place the story has reached, as islands on a dark sea, with the route the story took between them.
 * A place appears from the chapter it is first named in; places not reached yet are not drawn at all.
 */
interface Props {
  full: WorldAt;
  world: WorldAt;
  selected?: string;
  onSelect: (id: string | undefined) => void;
  refit: number;
}

export function PlacesMap({ full, world, selected, onSelect, refit }: Props) {
  const stage = useRef<StageHandle>(null);
  const dark = useDark();
  const colours = palette(dark);
  const map = useMemo(() => buildMap(full), [full]);
  const shown = useMemo(() => new Set(world.entries.filter((e) => e.kind === 'place').map((e) => e.id)), [world]);
  const pictures = useFaces(map.places.map((p) => p.entry), () => stage.current?.redraw());
  const fades = useRef(new Map<string, { a: number; from: number }>());
  const state = useRef({ map, shown, selected, colours, pictures, last: 0 });
  state.current = { ...state.current, map, shown, selected, colours, pictures };

  const box = () => bounds(map.places.filter((p) => shown.has(p.id)).map((p) => ({ x: p.x, y: p.y, r: p.r + 30 })));

  useEffect(() => {
    const t0 = performance.now() + 100;
    const still = !motionOk();
    fades.current = new Map();
    map.route.forEach((id, i) => fades.current.set(id, { a: still ? 1 : 0, from: t0 + i * 70 }));
    for (const p of map.places) if (!fades.current.has(p.id)) fades.current.set(p.id, { a: still ? 1 : 0, from: t0 + map.route.length * 70 });
    stage.current?.fit(box(), 14, true);
    stage.current?.redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    stage.current?.redraw();
  }, [shown, selected, dark]);

  useEffect(() => {
    if (refit) stage.current?.fit(box(), 14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refit]);

  // Selecting a place brings it into view, clear of the card below.
  useEffect(() => {
    const place = selected ? map.byId.get(selected) : undefined;
    const view = stage.current?.view();
    if (!place || !view) return;
    stage.current!.fit({ x: place.x - place.r - 90, y: place.y - place.r - 70, w: place.r * 2 + 180, h: place.r * 2 + 150 }, 10, false, { top: 150, bottom: Math.min(view.h * 0.5, 330) + 40 }, { k: 0.7, x: place.x, y: place.y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function tap(x: number, y: number) {
    // A place on an island wins over the island under it.
    const hit = [...map.places]
      .filter((p) => shown.has(p.id))
      .sort((a, b) => a.r - b.r)
      .find((p) => Math.hypot(p.x - x, p.y - y) < p.r + (p.on ? 10 : 0));
    onSelect(hit?.id);
  }

  function draw(ctx: CanvasRenderingContext2D, view: View, time: number): boolean {
    const s = state.current;
    const c = s.colours;
    const dt = Math.min(64, time - (s.last || time));
    s.last = time;
    let moving = false;
    const step = 1 - Math.exp(-dt / 140);
    const alphaOf = (id: string) => {
      let f = fades.current.get(id);
      if (!f) fades.current.set(id, (f = { a: 0, from: 0 }));
      if (time < f.from) {
        moving = true;
        return 0;
      }
      const want = s.shown.has(id) ? 1 : 0;
      if (Math.abs(want - f.a) > 0.004) {
        f.a += (want - f.a) * (dt ? step : 1);
        moving = true;
      } else f.a = want;
      return f.a;
    };

    // The sea, with the faint lines of a chart.
    ctx.drawImage(ground(view.w, view.h, c.sea, []), 0, 0, view.w, view.h);
    const grid = 140 * view.k;
    if (grid > 24) {
      ctx.strokeStyle = c.contour;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = ((view.x % grid) + grid) % grid; x < view.w; x += grid) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, view.h);
      }
      for (let y = ((view.y % grid) + grid) % grid; y < view.h; y += grid) {
        ctx.moveTo(0, y);
        ctx.lineTo(view.w, y);
      }
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.k, view.k);
    const thin = 1 / Math.max(0.6, Math.min(1.5, view.k));
    const alpha = new Map<string, number>();
    for (const p of s.map.places) alpha.set(p.id, alphaOf(p.id));

    // Islands: rings of shallow water, then the land.
    for (const p of s.map.places) {
      const a = alpha.get(p.id)!;
      if (!p.shore || a < 0.02) continue;
      const grow = 0.86 + 0.14 * a;
      for (const [i, scale] of [1.62, 1.4, 1.2].entries()) {
        ctx.globalAlpha = a * (0.5 + i * 0.25);
        shore(ctx, p, scale * grow);
        ctx.strokeStyle = c.contour;
        ctx.lineWidth = 1.2 * thin;
        ctx.stroke();
      }
      // A shadow on the water: the same shape, a little lower (a blurred shadow costs far more to draw).
      ctx.globalAlpha = a * 0.28;
      ctx.save();
      ctx.translate(0, 7);
      shore(ctx, p, grow * 1.02);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = a;
      shore(ctx, p, grow);
      const land = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.4, p.r * 0.1, p.x, p.y, p.r * 1.25);
      land.addColorStop(0, c.land[0]);
      land.addColorStop(1, c.land[1]);
      ctx.fillStyle = land;
      ctx.fill();
      ctx.strokeStyle = p.id === s.selected ? c.accent : c.coast;
      ctx.lineWidth = (p.id === s.selected ? 2.6 : 1.4) * thin;
      ctx.stroke();
      // A second, finer shoreline just inside the first, as on engraved maps.
      ctx.globalAlpha = a * 0.3;
      shore(ctx, p, grow * 0.93);
      ctx.lineWidth = 0.8 * thin;
      ctx.strokeStyle = c.coast;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // The route the story took, place to place, in the order they were first reached.
    const stops = s.map.route.map((id) => s.map.byId.get(id)!).filter((p) => (alpha.get(p.id) ?? 0) > 0.5);
    if (stops.length > 1) {
      ctx.strokeStyle = c.route;
      ctx.lineWidth = 1.8 * thin;
      ctx.setLineDash([2 * thin, 7 * thin]);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(stops[0].x, stops[0].y);
      for (let i = 1; i < stops.length; i++) {
        const a = stops[i - 1];
        const b = stops[i];
        const bow = i % 2 ? 0.18 : -0.18;
        ctx.quadraticCurveTo((a.x + b.x) / 2 + (b.y - a.y) * bow, (a.y + b.y) / 2 - (b.x - a.x) * bow, b.x, b.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // A medallion for each place: its picture when it has one.
    const newest = stops[stops.length - 1];
    for (const p of s.map.places) {
      const a = alpha.get(p.id)!;
      if (a < 0.02) continue;
      ctx.globalAlpha = a;
      const r = p.on ? p.r : Math.min(26, p.r * 0.4);
      if (p === newest) {
        // Where the story has most lately arrived.
        ctx.strokeStyle = c.route;
        ctx.lineWidth = 1.5 * thin;
        for (const ring of [1.45, 1.9]) {
          ctx.globalAlpha = a * (ring > 1.5 ? 0.35 : 0.75);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * ring, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = a;
      }
      const picture = s.pictures.get(p.id);
      if (picture) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.save();
        ctx.clip();
        const side = Math.min(picture.naturalWidth, picture.naturalHeight);
        ctx.drawImage(picture, (picture.naturalWidth - side) / 2, (picture.naturalHeight - side) / 2, side, side, p.x - r, p.y - r, r * 2, r * 2);
        ctx.restore();
        ctx.lineWidth = (p.id === s.selected ? 2.4 : 1.3) * thin;
        ctx.strokeStyle = p.id === s.selected ? c.accent : c.gold;
        ctx.stroke();
      } else mark(ctx, p.x, p.y, p.on ? r : r * 0.8, p.id === s.selected ? c.accent : c.coast, c.land[0], thin);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Names, in screen pixels: islands in the italic of old maps, places on them smaller.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const ordered = [...s.map.places].sort((a, b) => Number(!!a.on) - Number(!!b.on) || (a.entry.firstChapter ?? 1e9) - (b.entry.firstChapter ?? 1e9));
    for (const p of ordered) {
      const a = alpha.get(p.id)!;
      if (a < 0.3) continue;
      const island = !p.on;
      const r = (island ? Math.min(26, p.r * 0.4) : p.r) * view.k;
      if (!island && r < 7 && p.id !== s.selected) continue;
      const size = island ? Math.max(13, Math.min(21, 17 * Math.sqrt(view.k))) : 11.5;
      ctx.font = island ? `italic 400 ${size}px ${c.italic}` : `600 ${size}px ${c.font}`;
      const text = p.entry.english;
      const w = widthOf(ctx, text);
      const x = view.x + p.x * view.k;
      const y = view.y + p.y * view.k + r + size * 0.75 + 3;
      const boxed = { x0: x - w / 2 - 4, y0: y - size / 2 - 2, x1: x + w / 2 + 4, y1: y + size / 2 + (island ? 15 : 2) };
      if (taken.some((t) => boxed.x0 < t.x1 && boxed.x1 > t.x0 && boxed.y0 < t.y1 && boxed.y1 > t.y0)) continue;
      taken.push(boxed);
      ctx.globalAlpha = a;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = c.halo;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = c.ink;
      ctx.fillText(text, x, y);
      if (island && p.entry.firstChapter !== undefined) {
        ctx.font = `700 9.5px ${c.font}`;
        const tag = `CH. ${p.entry.firstChapter}`;
        ctx.globalAlpha = a * 0.7;
        ctx.strokeText(tag, x, y + size * 0.5 + 8);
        ctx.fillText(tag, x, y + size * 0.5 + 8);
      }
    }
    ctx.globalAlpha = 1;
    compass(ctx, view.w - 44, view.h - 150, c);
    return moving;
  }

  return <Stage ref={stage} draw={draw} onTap={tap} minZoom={0.2} maxZoom={3} top={150} bottom={96} label="A map of the places the story has reached" />;
}

/** An island's outline as a smooth closed path, scaled about its middle. */
function shore(ctx: CanvasRenderingContext2D, p: MapPlace, scale: number): void {
  const pts = p.shore!;
  const at = (i: number) => {
    const q = pts[(i + pts.length) % pts.length];
    return { x: p.x + q.x * scale, y: p.y + q.y * scale };
  };
  ctx.beginPath();
  const start = at(0);
  const next = at(1);
  ctx.moveTo((start.x + next.x) / 2, (start.y + next.y) / 2);
  for (let i = 1; i <= pts.length; i++) {
    const a = at(i);
    const b = at(i + 1);
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  ctx.closePath();
}

/** The mark for a place with no picture: a small keep with a flag, drawn in ink as towns are on old maps. */
function mark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string, paper: string, thin: number): void {
  const u = r * 0.5;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.5 * thin;
  ctx.strokeStyle = ink;
  ctx.fillStyle = paper;
  // The keep: a body with a notched top.
  ctx.beginPath();
  ctx.moveTo(x - u, y + u);
  ctx.lineTo(x - u, y - u * 0.35);
  ctx.lineTo(x - u * 0.5, y - u * 0.35);
  ctx.lineTo(x - u * 0.5, y - u * 0.05);
  ctx.lineTo(x + u * 0.5, y - u * 0.05);
  ctx.lineTo(x + u * 0.5, y - u * 0.35);
  ctx.lineTo(x + u, y - u * 0.35);
  ctx.lineTo(x + u, y + u);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The door, and a flag on a pole.
  ctx.beginPath();
  ctx.moveTo(x - u * 0.22, y + u);
  ctx.lineTo(x - u * 0.22, y + u * 0.45);
  ctx.arc(x, y + u * 0.45, u * 0.22, Math.PI, 0);
  ctx.lineTo(x + u * 0.22, y + u);
  ctx.moveTo(x, y - u * 0.05);
  ctx.lineTo(x, y - u * 1.25);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(x, y - u * 1.25);
  ctx.lineTo(x + u * 0.62, y - u * 1.02);
  ctx.lineTo(x, y - u * 0.78);
  ctx.closePath();
  ctx.fill();
}

/** A small compass in the corner. It does not turn (the map has no north); it says "this is a map". */
function compass(ctx: CanvasRenderingContext2D, x: number, y: number, c: Palette): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = c.ink;
  ctx.fillStyle = c.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const long = i % 2 === 0 ? 15 : 8;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * long, Math.sin(a) * long);
    ctx.lineTo(Math.cos(a + Math.PI / 2) * 2.6, Math.sin(a + Math.PI / 2) * 2.6);
    ctx.lineTo(Math.cos(a - Math.PI / 2) * 2.6, Math.sin(a - Math.PI / 2) * 2.6);
    ctx.closePath();
    if (i % 2 === 0) ctx.fill();
    else ctx.stroke();
  }
  ctx.font = `700 9px ${c.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', 0, -25);
  ctx.restore();
}
