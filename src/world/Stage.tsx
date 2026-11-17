import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { motionOk } from '../motion';

/**
 * A canvas you can drag, pinch and tap, shared by the people web and the map.
 *
 * The owner draws in "world" units; the stage keeps the view (where the middle is, how far zoomed in) and turns
 * finger movements into view changes. It only redraws when something changed (a finger moved, a fly-to is under way,
 * or the drawing asked for another frame), so a still picture costs no battery.
 */

export interface View {
  /** Zoom: screen pixels per world unit. */
  k: number;
  /** Screen position of the world's origin, in CSS pixels. */
  x: number;
  y: number;
  /** Size of the canvas in CSS pixels. */
  w: number;
  h: number;
}

export interface StageHandle {
  /** Glide so that the box fills the view (with a margin), or so that a point sits in the middle at zoom `k`. */
  fit(box: { x: number; y: number; w: number; h: number }, margin?: number, instant?: boolean, clear?: { top: number; bottom: number }, keep?: { k: number; x: number; y: number }): void;
  centre(point: { x: number; y: number }, k?: number, lift?: number): void;
  redraw(): void;
  view(): View;
}

interface Props {
  /** Draws one frame. Return true to be called again on the next frame (an animation is running). */
  draw: (ctx: CanvasRenderingContext2D, view: View, now: number) => boolean | void;
  /** A tap, in world units. */
  onTap?: (x: number, y: number) => void;
  minZoom?: number;
  maxZoom?: number;
  label: string;
  /** Space at the top and bottom covered by controls. */
  top?: number;
  bottom?: number;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export const Stage = forwardRef<StageHandle, Props>(function Stage({ draw, onTap, minZoom = 0.25, maxZoom = 4, label, top = 0, bottom = 0 }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ k: 1, x: 0, y: 0, w: 1, h: 1 });
  const latest = useRef({ draw, onTap, minZoom, maxZoom });
  latest.current = { draw, onTap, minZoom, maxZoom };
  const frame = useRef(0);
  const fly = useRef<{ from: View; to: { k: number; x: number; y: number }; start: number; ms: number }>();
  const fling = useRef<{ vx: number; vy: number; last: number }>();
  const touching = useRef(false);
  const wasMoving = useRef(false);
  const insets = useRef({ top, bottom });
  insets.current = { top, bottom };

  const schedule = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(paint);
  };

  function paint(now: number) {
    frame.current = 0;
    const el = canvas.current;
    if (!el) return;
    const v = view.current;
    let more = false;
    const f = fly.current;
    if (f) {
      const t = Math.min(1, (now - f.start) / f.ms);
      const e = ease(t);
      v.k = f.from.k + (f.to.k - f.from.k) * e;
      v.x = f.from.x + (f.to.x - f.from.x) * e;
      v.y = f.from.y + (f.to.y - f.from.y) * e;
      if (t < 1) more = true;
      else fly.current = undefined;
    }
    const g = fling.current;
    if (g) {
      const dt = Math.min(40, now - g.last);
      g.last = now;
      v.x += g.vx * dt;
      v.y += g.vy * dt;
      const slow = Math.pow(0.994, dt);
      g.vx *= slow;
      g.vy *= slow;
      if (Math.hypot(g.vx, g.vy) > 0.02) more = true;
      else fling.current = undefined;
    }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    // Full sharpness when still; while a finger is down or something is moving, a little less (far fewer pixels to
    // fill on every frame, and nobody can tell at speed). The last frame of any movement is drawn sharp again.
    const full = Math.min(3, window.devicePixelRatio || 1);
    const dpr = more || touching.current || wasMoving.current ? Math.min(full, 2) : full;
    if (Math.round(v.w * dpr) !== el.width) {
      el.width = Math.round(v.w * dpr);
      el.height = Math.round(v.h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, v.w, v.h);
    if (latest.current.draw(ctx, v, now)) more = true;
    const moving = more || touching.current;
    // One more frame after the movement ends, to draw it at full sharpness.
    if (moving || (wasMoving.current && dpr !== full)) schedule();
    wasMoving.current = moving;
  }

  useImperativeHandle(ref, () => ({
    fit(box, margin = 36, instant = false, clear, keep) {
      const v = view.current;
      const { top, bottom } = clear ?? insets.current;
      const room = Math.max(120, v.h - top - bottom);
      const k = Math.max(latest.current.minZoom, Math.min(latest.current.maxZoom, Math.min((v.w - margin * 2) / Math.max(1, box.w), (room - margin * 2) / Math.max(1, box.h))));
      // When the box would make things too small to read, hold a readable zoom and keep `keep`'s point in view instead.
      const small = keep && k < keep.k;
      const zoom = small ? Math.min(latest.current.maxZoom, keep.k) : k;
      const to = small
        ? { k: zoom, x: v.w / 2 - keep.x * zoom, y: top + room / 2 - keep.y * zoom }
        : { k, x: v.w / 2 - (box.x + box.w / 2) * k, y: top + room / 2 - (box.y + box.h / 2) * k };
      fling.current = undefined;
      if (instant || !motionOk()) {
        Object.assign(v, to);
        fly.current = undefined;
      } else fly.current = { from: { ...v }, to, start: performance.now(), ms: 650 };
      schedule();
    },
    centre(point, k, lift = 0) {
      const v = view.current;
      const zoom = Math.max(latest.current.minZoom, Math.min(latest.current.maxZoom, k ?? v.k));
      const to = { k: zoom, x: v.w / 2 - point.x * zoom, y: v.h / 2 - lift - point.y * zoom };
      fling.current = undefined;
      if (!motionOk()) {
        Object.assign(v, to);
        fly.current = undefined;
      } else fly.current = { from: { ...v }, to, start: performance.now(), ms: 520 };
      schedule();
    },
    redraw: schedule,
    view: () => view.current,
  }));

  // Size: follow the element, at the screen's sharpness.
  useEffect(() => {
    const el = canvas.current!;
    const size = () => {
      const box = el.getBoundingClientRect();
      const v = view.current;
      // Keep the same world point in the middle when the size changes.
      const cx = (v.w / 2 - v.x) / v.k;
      const cy = (v.h / 2 - v.y) / v.k;
      const first = v.w <= 1;
      v.w = Math.max(1, box.width);
      v.h = Math.max(1, box.height);
      if (first) {
        v.x = v.w / 2;
        v.y = v.h / 2;
      } else {
        v.x = v.w / 2 - cx * v.k;
        v.y = v.h / 2 - cy * v.k;
      }
      schedule();
    };
    size();
    const watch = new ResizeObserver(size);
    watch.observe(el);
    return () => {
      watch.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fingers: one drags, two pinch; a short still touch is a tap.
  useEffect(() => {
    const el = canvas.current!;
    const fingers = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; at: number; moved: boolean } | undefined;
    let pinch: { d: number; k: number } | undefined;
    let track: { x: number; y: number; t: number }[] = [];
    const at = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const zoomAt = (px: number, py: number, k: number) => {
      const v = view.current;
      const next = Math.max(latest.current.minZoom, Math.min(latest.current.maxZoom, k));
      v.x = px - ((px - v.x) / v.k) * next;
      v.y = py - ((py - v.y) / v.k) * next;
      v.k = next;
    };
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const p = at(e);
      fingers.set(e.pointerId, p);
      touching.current = true;
      fly.current = undefined;
      fling.current = undefined;
      if (fingers.size === 1) {
        start = { ...p, at: performance.now(), moved: false };
        track = [{ ...p, t: performance.now() }];
      } else if (fingers.size === 2) {
        const [a, b] = [...fingers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: view.current.k };
        if (start) start.moved = true;
      }
    };
    const move = (e: PointerEvent) => {
      const before = fingers.get(e.pointerId);
      if (!before) return;
      const p = at(e);
      fingers.set(e.pointerId, p);
      const v = view.current;
      if (fingers.size >= 2 && pinch) {
        const [a, b] = [...fingers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        // Half of this finger's movement shifts the view, so the point between the fingers stays under them.
        v.x += (p.x - before.x) / 2;
        v.y += (p.y - before.y) / 2;
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.k * (d / pinch.d));
        pinch = { d, k: v.k };
      } else {
        v.x += p.x - before.x;
        v.y += p.y - before.y;
        if (start && Math.hypot(p.x - start.x, p.y - start.y) > 8) start.moved = true;
        track.push({ ...p, t: performance.now() });
        if (track.length > 6) track.shift();
      }
      schedule();
    };
    const up = (e: PointerEvent) => {
      if (!fingers.has(e.pointerId)) return;
      const p = at(e);
      fingers.delete(e.pointerId);
      if (fingers.size < 2) pinch = undefined;
      if (fingers.size > 0) return;
      touching.current = false;
      schedule();
      const s = start;
      start = undefined;
      if (s && !s.moved && performance.now() - s.at < 500 && e.type === 'pointerup') {
        const v = view.current;
        latest.current.onTap?.((p.x - v.x) / v.k, (p.y - v.y) / v.k);
        return;
      }
      // Let go while moving: the view glides on and slows.
      const first = track[0];
      const last = track[track.length - 1];
      if (first && last && last.t - first.t > 10 && performance.now() - last.t < 60 && motionOk()) {
        const vx = (last.x - first.x) / (last.t - first.t);
        const vy = (last.y - first.y) / (last.t - first.t);
        if (Math.hypot(vx, vy) > 0.15) {
          fling.current = { vx, vy, last: performance.now() };
          schedule();
        }
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      zoomAt(e.clientX - box.left, e.clientY - box.top, view.current.k * Math.exp(-e.deltaY * 0.0015));
      schedule();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, []);

  return <canvas ref={canvas} className="world-stage" role="img" aria-label={label} />;
});
