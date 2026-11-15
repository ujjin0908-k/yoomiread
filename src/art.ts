import type { GlossaryEntry, GlossaryKind } from './types';

/** Used when a book has no art style of its own. */
export const DEFAULT_ART_STYLE =
  'Dark high-fantasy painting: vast scale with tiny figures for size, painterly brushwork, atmospheric light, muted colours with one strong accent, highly detailed, cinematic wide composition, no text.';

const SUBJECT: Record<GlossaryKind, string> = {
  person: 'A character portrait',
  place: 'A landscape illustration of a place',
  god: 'An illustration of a god',
  group: 'An illustration of a faction',
  term: 'An illustration of',
};

/** The text to paste into an image app: what it is, how it looks, and the book's art style. Wide, for the reader. */
export function picturePrompt(entry: Pick<GlossaryEntry, 'english' | 'kind' | 'look'>, style?: string): string {
  return [
    entry.kind === 'term' ? `An illustration of ${entry.english}.` : `${SUBJECT[entry.kind]}: ${entry.english}.`,
    entry.look?.trim() ?? '',
    `Style: ${style?.trim() || DEFAULT_ART_STYLE}`,
    entry.kind === 'person' ? 'Portrait format.' : 'Wide landscape format (3:2).',
  ]
    .filter(Boolean)
    .join('\n\n');
}
