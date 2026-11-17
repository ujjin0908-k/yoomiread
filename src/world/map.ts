import { hash01 } from './graph';
import type { WorldAt, WorldEntry } from './visible';

/**
 * The map of the story's places. These books give no real geography, so the map is drawn the way an old atlas shows
 * far-off lands: each top-level place is an island, the places inside it are marked on it, and a route joins the
 * places in the order the story first reached them. Laid out once for my reading line; earlier chapters show part of it.
 */

export interface MapPlace {
  id: string;
  entry: WorldEntry;
  x: number;
  y: number;
  /** Radius of the island, or of the mark for a place inside another. */
  r: number;
  /** The island it stands on, when it is inside another place. */
  on?: string;
  /** The island's outline, as points around its middle (islands only). */
  shore?: { x: number; y: number }[];
}

export interface StoryMap {
  places: MapPlace[];
  byId: Map<string, MapPlace>;
  /** Place ids in the order the story first reached them. */
  route: string[];
}

/** Every place under this one, however deep. */
function inside(id: string, within: Map<string, string[]>, seen = new Set<string>()): string[] {
  const out: string[] = [];
  for (const child of within.get(id) ?? []) {
    if (seen.has(child)) continue;
    seen.add(child);
    out.push(child, ...inside(child, within, seen));
  }
  return out;
}

/** A coastline: a circle bent by a few slow waves, always the same for the same place. */
function shoreOf(id: string, r: number): { x: number; y: number }[] {
  const p = [hash01(`${id}a`), hash01(`${id}b`), hash01(`${id}c`)].map((v) => v * Math.PI * 2);
  const points = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const bend = 1 + 0.12 * Math.sin(a * 3 + p[0]) + 0.07 * Math.sin(a * 5 + p[1]) + 0.035 * Math.sin(a * 9 + p[2]);
    points.push({ x: Math.cos(a) * r * bend, y: Math.sin(a) * r * bend });
  }
  return points;
}

export function buildMap(world: WorldAt): StoryMap {
  const entry = new Map(world.entries.filter((e) => e.kind === 'place').map((e) => [e.id, e]));
  const first = (id: string) => entry.get(id)?.firstChapter ?? Number.MAX_SAFE_INTEGER;
  const tops = [...(world.placesWithin.get('') ?? [])].filter((id) => entry.has(id)).sort((a, b) => first(a) - first(b) || a.localeCompare(b));

  const places: MapPlace[] = [];
  const islands: MapPlace[] = tops.map((id, i) => {
    const kids = inside(id, world.placesWithin).filter((k) => entry.has(k));
    const r = 58 + 26 * Math.sqrt(kids.length);
    // A winding road down the page, three places across and back again: the route between them then reads as a
    // journey instead of a tangle. Each place is nudged off the line so it does not look ruled.
    const row = Math.floor(i / 3);
    const col = row % 2 ? 2 - (i % 3) : i % 3;
    return {
      id,
      entry: entry.get(id)!,
      x: (col - 1) * 190 + (hash01(`${id}x`) - 0.5) * 70,
      y: row * 215 + (col === 1 ? 46 : 0) + (hash01(`${id}y`) - 0.5) * 60,
      r,
    };
  });
  // Ease islands apart until none crowd each other.
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        const a = islands[i];
        const b = islands[j];
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const d = Math.hypot(dx, dy);
        const want = a.r + b.r + 64;
        if (d >= want) continue;
        const push = (want - d) / d / 2;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const island of islands) {
    island.shore = shoreOf(island.id, island.r);
    places.push(island);
    const kids = inside(island.id, world.placesWithin).filter((k) => entry.has(k)).sort((a, b) => first(a) - first(b));
    kids.forEach((id, i) => {
      const angle = (i / kids.length) * Math.PI * 2 + hash01(island.id) * 6;
      const ring = kids.length === 1 ? island.r * 0.42 : island.r * 0.56;
      places.push({ id, entry: entry.get(id)!, x: island.x + Math.cos(angle) * ring, y: island.y + Math.sin(angle) * ring + (kids.length === 1 ? island.r * 0.1 : 0), r: 13, on: island.id });
    });
  }
  const byId = new Map(places.map((p) => [p.id, p]));
  const route = places
    .filter((p) => p.entry.firstChapter !== undefined)
    .sort((a, b) => a.entry.firstChapter! - b.entry.firstChapter! || a.id.localeCompare(b.id))
    .map((p) => p.id);
  return { places, byId, route };
}
