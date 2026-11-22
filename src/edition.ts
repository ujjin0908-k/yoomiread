/**
 * Which build this is. The owner's own app (the default, yoomiread.pages.dev) keeps every feature. A public build
 * (`VITE_EDITION=public` at build time) leaves out what must not ship to strangers:
 * - the link reader (reads other sites' chapters through our server; a legal risk once the app is public),
 * - built-in guides written about other people's novels (the Foolish Game guide),
 * - the Novel Updates field.
 * The public build keeps file import (PDF, ePub), paste, the free sample book and guides the reader adds themselves.
 */
export const PUBLIC: boolean = import.meta.env.VITE_EDITION === 'public';

export const features = {
  /** "From a web link", "Add chapters from links", and covers from a link. */
  links: !PUBLIC,
  /** Guides that ship with the app for books we do not own. */
  ownerGuides: !PUBLIC,
  /** The Novel Updates link on the book page. */
  novelUpdates: !PUBLIC,
};
