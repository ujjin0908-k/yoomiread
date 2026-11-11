import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/** Motion for the whole app: page changes, counting numbers, a small celebration. All of it can be turned off. */

const KEY = 'yoomiread.motion';

export function motionSetting(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setMotionSetting(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
  applyMotionSetting(on);
}

function applyMotionSetting(on = motionSetting()): void {
  if (on) delete document.documentElement.dataset.motion;
  else document.documentElement.dataset.motion = 'off';
}

/** False when the phone asks for less motion, or animations are turned off in Settings. */
export function motionOk(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.dataset.motion === 'off') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

type Doc = Document & { startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> } };

// A page change is animated only when it follows a tap. A swipe back on iPhone already shows its own
// animation, so that one is left alone.
let lastIntent = -Infinity;

/** The page change in progress, if any: work that can wait is done after it. */
let changing: Promise<void> | undefined;
export function afterPageChange(fn: () => void): void {
  if (changing) void changing.then(fn);
  else fn();
}

/**
 * Pages already shown in this visit. Entrance effects (lists rising in, bars filling, numbers counting up) play the
 * first time only; after that the page simply arrives with the page change, instead of a second wave of movement.
 */
const seen = new Set<string>();
export function firstVisit(): boolean {
  return document.documentElement.dataset.first === '1';
}
function markVisit(to: string[]): void {
  const page = to[0] ?? '';
  if (seen.has(page)) delete document.documentElement.dataset.first;
  else document.documentElement.dataset.first = '1';
  seen.add(page);
}
export function markIntent(): void {
  lastIntent = performance.now();
}

export function initMotion(): void {
  applyMotionSetting();
  document.addEventListener('click', markIntent, true);
  document.addEventListener('keydown', markIntent, true);
}

const TABS = ['', 'library', 'quotes', 'stats'];

function depth(parts: string[]): number {
  const page = parts[0] ?? '';
  if (TABS.includes(page)) return 0;
  if (page === 'character') return 3;
  return page === 'chapter' || page === 'glossary' || page === 'quote' ? 2 : 1;
}

/** Which way the new page should arrive, from where it sits compared with the old one. */
export function navKind(from: string[], to: string[]): string {
  const a = depth(from);
  const b = depth(to);
  if (a === 0 && b === 0) return TABS.indexOf(to[0] ?? '') >= TABS.indexOf(from[0] ?? '') ? 'tab-right' : 'tab-left';
  // Into a chapter the old page swings open like a cover; out of it, the cover closes again.
  if (to[0] === 'chapter' && from[0] !== 'chapter') return 'open-book';
  if (from[0] === 'chapter' && to[0] !== 'chapter') return 'close-book';
  if (b > a) return 'forward';
  if (b < a) return 'back';
  return 'fade';
}

function waitFor(selector: string, ms: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el || performance.now() - start > ms) resolve(el);
      else window.setTimeout(check, 16);
    };
    check();
  });
}

const COVER = 'book-cover';

/**
 * Changes the page with an animation. `update` must change the React state.
 * Opening a book, or going back from one, carries its cover across to its new place.
 */
export function animatePage(kind: string, update: () => void, from: string[] = [], to: string[] = []): void {
  const doc = document as Doc;
  const recent = performance.now() - lastIntent < 900;
  // Stays until the next page change, so a page you return to is not replayed (see motion.css).
  document.documentElement.dataset.arrive = kind;
  markVisit(to);
  // Into a chapter: a real book opens over the page. It does not need the browser's page transitions,
  // so it also plays on older iPhones.
  if (kind === 'open-book' && motionOk() && recent) {
    openBook(update);
    return;
  }
  if (!doc.startViewTransition || !motionOk() || !recent) {
    // No browser page change: the page's own entrance effects are the movement.
    delete document.documentElement.dataset.vt;
    update();
    return;
  }
  document.documentElement.dataset.vt = '1';

  const named: HTMLElement[] = [];
  const name = (el: Element | null | undefined) => {
    if (!(el instanceof HTMLElement) || named.length >= 2 || named.includes(el)) return;
    el.style.setProperty('view-transition-name', COVER);
    named.push(el);
  };
  const linkTo = (id: string) => `a[href="#/book/${id}"] .cover`;
  const opening = to[0] === 'book' && depth(from) === 0 ? to[1] : undefined;
  const closing = from[0] === 'book' && depth(to) === 0 ? from[1] : undefined;

  if (opening) {
    const active = document.activeElement?.closest?.(`a[href="#/book/${opening}"]`);
    name(active?.querySelector('.cover') ?? document.querySelector(linkTo(opening)));
  }
  if (closing) name(document.querySelector('.book-hero .cover'));
  const before = named.length;

  document.documentElement.dataset.nav = kind;
  const done = () => {
    delete document.documentElement.dataset.nav;
    for (const el of named) el.style.removeProperty('view-transition-name');
  };
  try {
    const t = doc.startViewTransition(async () => {
      flushSync(update);
      // The old page's cover is gone now; give its name to the cover on the new page once that page has loaded.
      for (const el of named.splice(0)) el.style.removeProperty('view-transition-name');
      if (before && opening) name(await waitFor('.book-hero .cover', 160));
      else if (before && closing) name(await waitFor(linkTo(closing), 160));
      else await waitFor('.page > :nth-child(2), .welcome', 80);
    });
    const ended = t.finished.then(done, done);
    changing = ended;
    void ended.then(() => {
      if (changing === ended) changing = undefined;
    });
  } catch {
    done();
    update();
  }
}

/** Counts from 0 up to `target` when a number first shows, then follows it. */
export function useCountUp(target: number, ms = 900): number {
  // Counts up the first time a page is shown; when coming back, the number is simply there.
  const [value, setValue] = useState(() => (motionOk() && firstVisit() ? 0 : target));
  useEffect(() => {
    if (!motionOk() || !firstVisit()) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}

/** For finishing a book: "Finished." drops in, a READ stamp lands, and paper squares and stars fly. */
export function celebrate(): void {
  if (!motionOk()) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  const word = document.createElement('b');
  word.className = 'finish-word';
  word.textContent = 'Finished.';
  const stamp = document.createElement('b');
  stamp.className = 'finish-stamp';
  stamp.textContent = 'READ';
  layer.append(word, stamp);
  const colors = ['#ffd23f', '#e8320e', '#2f48e8', '#ff9ecb', '#c8f560', '#b79cff'];
  for (let i = 0; i < 48; i++) {
    const bit = document.createElement('i');
    const angle = (i / 48) * Math.PI * 2 + Math.random() * 0.4;
    const reach = 110 + Math.random() * 200;
    bit.style.setProperty('--x', `${Math.cos(angle) * reach}px`);
    bit.style.setProperty('--y', `${Math.sin(angle) * reach - 80}px`);
    bit.style.setProperty('--r', `${Math.random() * 540 - 270}deg`);
    bit.style.setProperty('--d', `${Math.random() * 0.12}s`);
    bit.style.background = colors[i % colors.length];
    if (i % 3 === 0) bit.className = 'star-bit';
    layer.appendChild(bit);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 2600);
}

/**
 * A book opens over the whole screen: the cover swings open, three pages turn, and the page grows until
 * it is the chapter. The cover is the one on the page you came from. `update` shows the chapter underneath
 * while the cover is opening. A tap anywhere skips to the chapter.
 */
function openBook(update: () => void): void {
  const layer = document.createElement('div');
  layer.className = 'book-open';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML =
    '<div class="bo-book"><div class="bo-back"></div><div class="bo-page"><i></i><i></i><i></i><i></i><i></i></div>' +
    '<div class="bo-leaf bo-leaf3"></div><div class="bo-leaf bo-leaf2"></div><div class="bo-leaf bo-leaf1"></div>' +
    '<div class="bo-cover"><div class="bo-front"></div><div class="bo-inside"></div></div></div>';
  // The real cover of the book being opened, copied from the page.
  const cover = document.querySelector('.book3d .cover, .book-hero .cover, .now .cover');
  if (cover) layer.querySelector('.bo-front')!.appendChild(cover.cloneNode(true));
  document.body.appendChild(layer);

  let shown = false;
  const show = () => {
    if (shown) return;
    shown = true;
    update();
  };
  const end = () => {
    show();
    layer.remove();
  };
  layer.addEventListener('click', end);
  // The chapter is put in place once the overlay fully covers the page; the overlay leaves when the page has grown.
  window.setTimeout(show, 450);
  window.setTimeout(end, 1900);
}
