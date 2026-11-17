import { useEffect, useRef, useState } from 'react';
import { pictureBlob } from '../picture';
import type { GlossaryEntry, GlossaryKind } from '../types';
import type { Tone } from './graph';

/** Colours for the canvases of the Living Book, for the light and the dark look (the phone decides which). */
export interface Palette {
  sky: [string, string];
  glows: string[];
  dust: string;
  ink: string;
  /** Behind a name, so it reads on top of lines. */
  halo: string;
  pill: string;
  ring: string;
  accent: string;
  gold: string;
  onFace: string;
  glowMain: string;
  glowSelected: string;
  /** How strong a line is when nothing is selected. */
  line: number;
  tone: Record<Tone, string>;
  faces: string[];
  kind: Record<GlossaryKind, string>;
  clouds: string[];
  font: string;
  italic: string;
  // The map.
  sea: [string, string];
  land: [string, string];
  coast: string;
  contour: string;
  route: string;
}

const FONT = "'Bricolage Grotesque', 'Inter', system-ui, sans-serif";
const ITALIC = "'Instrument Serif', Georgia, serif";

const DARK: Palette = {
  sky: ['#0c0a18', '#171230'],
  glows: ['rgb(232 50 14 / 0.16)', 'rgb(107 77 255 / 0.2)'],
  dust: '#ffffff',
  ink: '#ffffff',
  halo: 'rgb(12 10 24 / 0.85)',
  pill: 'rgb(20 17 38 / 0.92)',
  ring: 'rgb(255 255 255 / 0.4)',
  accent: '#ff5a36',
  gold: '#f5c451',
  onFace: '#ffffff',
  glowMain: 'rgb(255 90 54 / 0.4)',
  glowSelected: 'rgb(255 255 255 / 0.4)',
  line: 0.42,
  tone: { bond: '#ffc46b', faith: '#a58bff', conflict: '#ff5a36', other: '#9d98b8' },
  faces: ['#5b4bc4', '#4a63c9', '#3b7db8', '#2c8794', '#7350c2', '#8a4fb0'],
  kind: { person: '#5b4bc4', god: '#3a2d12', group: '#2b2550', place: '#17413a', term: '#33304a' },
  clouds: ['rgb(165 139 255 / 0.13)', 'rgb(255 122 92 / 0.12)', 'rgb(110 220 170 / 0.1)', 'rgb(255 196 107 / 0.11)', 'rgb(110 170 255 / 0.12)'],
  font: FONT,
  italic: ITALIC,
  sea: ['#0b1020', '#131a36'],
  land: ['#3a3357', '#241f3d'],
  coast: 'rgb(214 206 255 / 0.75)',
  contour: 'rgb(170 160 255 / 0.13)',
  route: '#ff7a5c',
};

const LIGHT: Palette = {
  sky: ['#f6f2ff', '#ebe4fb'],
  glows: ['rgb(255 138 92 / 0.28)', 'rgb(183 156 255 / 0.4)'],
  dust: '#14121f',
  ink: '#14121f',
  halo: 'rgb(246 242 255 / 0.9)',
  pill: 'rgb(255 255 255 / 0.95)',
  ring: 'rgb(20 18 31 / 0.35)',
  accent: '#e8320e',
  gold: '#b8860b',
  onFace: '#ffffff',
  glowMain: 'rgb(232 50 14 / 0.26)',
  glowSelected: 'rgb(20 18 31 / 0.22)',
  line: 0.5,
  tone: { bond: '#c77a00', faith: '#6b4dff', conflict: '#e8320e', other: '#77728f' },
  faces: ['#5b4bc4', '#4a63c9', '#3b7db8', '#2c8794', '#7350c2', '#8a4fb0'],
  kind: { person: '#5b4bc4', god: '#14121f', group: '#3d3566', place: '#1e5d52', term: '#5d5876' },
  clouds: ['rgb(107 77 255 / 0.13)', 'rgb(232 50 14 / 0.1)', 'rgb(30 123 91 / 0.12)', 'rgb(199 122 0 / 0.12)', 'rgb(59 111 184 / 0.13)'],
  font: FONT,
  italic: ITALIC,
  sea: ['#e6e3f6', '#d3cff0'],
  land: ['#f6efdc', '#e4d8b9'],
  coast: 'rgb(20 18 31 / 0.78)',
  contour: 'rgb(60 50 120 / 0.13)',
  route: '#e8320e',
};

export const palette = (dark: boolean): Palette => (dark ? DARK : LIGHT);

/** True when the phone is in its dark look. Follows changes while the page is open. */
export function useDark(): boolean {
  const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
  const [dark, setDark] = useState(() => !!query?.matches);
  useEffect(() => {
    if (!query) return;
    const change = () => setDark(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return dark;
}

/**
 * The pictures of these entries, ready to draw on a canvas. They load in the background; `onReady` is called as each
 * arrives so the canvas can draw again. Addresses are released when the page closes.
 */
export function useFaces(entries: GlossaryEntry[], onReady: () => void): Map<string, HTMLImageElement> {
  const faces = useRef(new Map<string, HTMLImageElement>());
  const ready = useRef(onReady);
  ready.current = onReady;
  const key = entries.map((e) => `${e.id}:${e.picture ? e.updatedAt : ''}`).join('|');
  useEffect(() => {
    const urls: string[] = [];
    // The same map throughout, so a canvas that holds on to it sees pictures as they arrive.
    const next = faces.current;
    next.clear();
    for (const e of entries) {
      const blob = pictureBlob(e.picture);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const img = new Image();
      img.onload = () => {
        next.set(e.id, img);
        ready.current();
      };
      img.src = url;
    }
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return faces.current;
}

/** A soft round glow of one colour, drawn once and then stamped wherever it is needed (much cheaper than a new gradient per frame). */
const sprites = new Map<string, HTMLCanvasElement>();
export function glow(colour: string): HTMLCanvasElement {
  let sprite = sprites.get(colour);
  if (!sprite) {
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = 96;
    const ctx = sprite.getContext('2d')!;
    const g = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
    g.addColorStop(0, colour);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    sprites.set(colour, sprite);
  }
  return sprite;
}

/** A still backdrop (a gradient with soft lights), painted once per size and look, then copied each frame. */
const grounds = new Map<string, HTMLCanvasElement>();
export function ground(w: number, h: number, colours: [string, string], lights: string[]): HTMLCanvasElement {
  const key = `${Math.round(w)}x${Math.round(h)}|${colours.join()}|${lights.join()}`;
  let canvas = grounds.get(key);
  if (!canvas) {
    if (grounds.size > 6) grounds.clear();
    canvas = document.createElement('canvas');
    // Half size: a gradient loses nothing when scaled up.
    canvas.width = Math.max(1, Math.round(w / 2));
    canvas.height = Math.max(1, Math.round(h / 2));
    const ctx = canvas.getContext('2d')!;
    ctx.scale(0.5, 0.5);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, colours[0]);
    g.addColorStop(1, colours[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    lights.forEach((light, i) => {
      const x = w * (i ? 0.85 : 0.1);
      const y = h * (i ? 0.75 : 0.12);
      const r = Math.max(w, h) * 0.6;
      const halo = ctx.createRadialGradient(x, y, 0, x, y, r);
      halo.addColorStop(0, light);
      halo.addColorStop(1, 'transparent');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
    });
    grounds.set(key, canvas);
  }
  return canvas;
}

/** Text widths, remembered: measuring the same name on every frame is wasted work. */
const widths = new Map<string, number>();
export function widthOf(ctx: CanvasRenderingContext2D, text: string): number {
  const key = `${ctx.font}|${text}`;
  let w = widths.get(key);
  if (w === undefined) {
    if (widths.size > 4000) widths.clear();
    w = ctx.measureText(text).width;
    widths.set(key, w);
  }
  return w;
}
