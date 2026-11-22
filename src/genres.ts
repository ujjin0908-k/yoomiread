import type { Book, GenreId, GlossaryKind } from './types';

/**
 * Genre presets: how a book's world is named and what the story search looks for. The stored kinds never change
 * (person, place, god, group, term), so old books and backups keep working; a preset only renames them, says which
 * ones the genre uses, and explains each one to the model in the genre's own words.
 */
export interface Genre {
  id: GenreId;
  name: string;
  /** One line under the name in the picker. */
  blurb: string;
  /** The kinds this genre uses, in the order shown. A kind left out still shows when the book has entries of it. */
  kinds: GlossaryKind[];
  /** Singular and plural label for each kind. */
  label: Record<GlossaryKind, [string, string]>;
  /** What each kind means here, for the story search. One short line each. */
  scan: Record<GlossaryKind, string>;
  /** Example link labels, for the story search. */
  links: string;
  /** Example events a reader would want to be reminded of. */
  events: string;
}

const PERSON = 'a named character.';

export const GENRES: Genre[] = [
  {
    id: 'general',
    name: 'General',
    blurb: 'People, places, gods, groups and terms',
    kinds: ['person', 'place', 'god', 'group', 'term'],
    label: { person: ['Person', 'People'], place: ['Place', 'Places'], god: ['God', 'Gods'], group: ['Group', 'Groups'], term: ['Term', 'Terms'] },
    scan: {
      person: PERSON,
      place: 'a world, realm, country, city, region or named building.',
      god: 'a god, deity or divine power the story names (and the path or faith that follows it).',
      group: 'a faction, sect, guild, church, school, team or organisation.',
      term: 'a named power system, rank, class, title, skill, artifact, item or rule of the world that matters to the story.',
    },
    links: '"master of", "sister of", "enemy of", "member of", "follows", "betrayed", "in love with", "leader of"',
    events: 'a death, a betrayal, a reveal, a battle won or lost, a journey, a new power, a vow',
  },
  {
    id: 'fantasy',
    name: 'Fantasy',
    blurb: 'Kingdoms, magic, creatures, quests',
    kinds: ['person', 'place', 'group', 'god', 'term'],
    label: { person: ['Person', 'People'], place: ['Place', 'Places'], god: ['Power', 'Powers'], group: ['Faction', 'Factions'], term: ['Lore', 'Lore'] },
    scan: {
      person: PERSON,
      place: 'a world, land, kingdom, city, forest, mountain, river or named building.',
      god: 'a god, dark lord, spirit, ancient being or other great power the story names.',
      group: 'a kingdom\'s people, house, order, guild, army, fellowship or other faction.',
      term: 'a race or people (elves, dwarves), a creature, a kind of magic, a named weapon, ring or other item, a title or a prophecy.',
    },
    links: '"ally of", "enemy of", "serves", "heir of", "member of", "sworn to", "in love with", "betrayed"',
    events: 'a death, a betrayal, a battle won or lost, a quest begun, an item found or lost, a prophecy, a crowning',
  },
  {
    id: 'cultivation',
    name: 'Cultivation',
    blurb: 'Xianxia, wuxia, sects, realms, pathways',
    kinds: ['person', 'place', 'group', 'term', 'god'],
    label: { person: ['Person', 'People'], place: ['Place', 'Places & realms'], god: ['God', 'Gods & paths'], group: ['Sect', 'Sects & clans'], term: ['Cultivation', 'Cultivation'] },
    scan: {
      person: PERSON,
      place: 'a realm, continent, country, city, secret land, mountain or named building.',
      god: 'a god, immortal, deity, pathway or divine power the story names.',
      group: 'a sect, clan, family, church, academy, alliance or other organisation.',
      term: 'a cultivation stage or rank, a technique, a skill, a bloodline, a treasure, pill or artifact, a title or a rule of the world.',
    },
    links: '"master of", "disciple of", "elder of", "member of", "enemy of", "sworn brother of", "in love with", "betrayed"',
    events: 'a breakthrough to a new stage, a death, a betrayal, a duel won or lost, a treasure found, a sect joined or left',
  },
  {
    id: 'scifi',
    name: 'Science fiction',
    blurb: 'Ships, planets, empires, technology',
    kinds: ['person', 'place', 'group', 'term'],
    label: { person: ['Person', 'People'], place: ['Place', 'Places'], god: ['Power', 'Powers'], group: ['Faction', 'Factions'], term: ['Tech & lore', 'Tech & lore'] },
    scan: {
      person: PERSON,
      place: 'a planet, moon, station, ship, city, region or named building.',
      god: 'a god, AI or other great power the story names.',
      group: 'an empire, nation, corporation, military unit, crew, caste or other faction.',
      term: 'a technology, weapon, device, species, rank, class or rule of the world that matters to the story.',
    },
    links: '"commands", "serves", "ally of", "enemy of", "member of", "created", "in love with", "betrayed"',
    events: 'a death, a betrayal, a battle won or lost, a discovery, a launch or arrival, a rebellion, a new technology',
  },
  {
    id: 'romance',
    name: 'Romance & drama',
    blurb: 'Relationships, families, friends',
    kinds: ['person', 'place', 'group', 'term'],
    label: { person: ['Person', 'People'], place: ['Place', 'Places'], god: ['God', 'Gods'], group: ['Circle', 'Circles'], term: ['Detail', 'Details'] },
    scan: {
      person: PERSON,
      place: 'a city, home, school, workplace, café or other named place the story returns to.',
      god: 'a god or deity the story names.',
      group: 'a family, friend group, company, school, team or club.',
      term: 'a named event, nickname, shared item, secret or rule that matters between the characters.',
    },
    links: '"dating", "married to", "ex of", "crush on", "best friend of", "rival of", "parent of", "works for"',
    events: 'a first meeting, a confession, a kiss, a break-up, a secret revealed, a wedding, a move, a fight',
  },
  {
    id: 'mystery',
    name: 'Mystery & thriller',
    blurb: 'Cases, suspects, clues',
    kinds: ['person', 'place', 'group', 'term'],
    label: { person: ['Person', 'People'], place: ['Place', 'Places'], god: ['God', 'Gods'], group: ['Group', 'Groups'], term: ['Clue', 'Clues'] },
    scan: {
      person: PERSON,
      place: 'a city, house, crime scene, office or other named place.',
      god: 'a god or deity the story names.',
      group: 'a police unit, agency, family, gang, company or other organisation.',
      term: 'a clue, piece of evidence, weapon, document, alibi or named case.',
    },
    links: '"suspects", "works with", "employs", "married to", "hides from", "lied to", "victim of", "related to"',
    events: 'a crime, a body found, a clue found, a suspect questioned or cleared, an arrest, a twist revealed',
  },
];

const BY_ID = new Map(GENRES.map((g) => [g.id, g]));

/** The book's preset. A book that never chose one is "General", which is how every book worked before presets. */
export function genreOf(book: Pick<Book, 'genre'> | undefined | null): Genre {
  return BY_ID.get(book?.genre ?? 'general') ?? GENRES[0];
}

/** The label for a kind in this genre: singular by default, plural when `many`. */
export function kindLabel(genre: Genre, kind: GlossaryKind, many = false): string {
  return genre.label[kind][many ? 1 : 0];
}

/** The kinds to show for a book: the genre's own, plus any other kind the book already has entries of. */
export function kindsShown(genre: Genre, have: Iterable<GlossaryKind>): GlossaryKind[] {
  const extra = new Set(have);
  const all: GlossaryKind[] = ['person', 'place', 'god', 'group', 'term'];
  return [...genre.kinds, ...all.filter((k) => !genre.kinds.includes(k) && extra.has(k))];
}

/** Words that point to a genre. Scored on the phone; nothing is sent anywhere. */
const SIGNS: Record<Exclude<GenreId, 'general'>, RegExp> = {
  cultivation:
    /\b(cultivat\w*|qi|dantian|meridians?|sect|elders?|disciples?|dao|immortals?|foundation establishment|core formation|nascent soul|martial arts?|young master|beyonders?|sequence \d)\b|修炼|修仙|宗门|灵气|丹田|筑基|金丹|元婴|弟子|长老|师尊|师兄|武功|序列/gi,
  fantasy:
    /\b(magic|mage|wizards?|sorcer\w+|spells?|dragons?|elves|elf|dwarves|dwarf|orcs?|goblins?|kingdoms?|knights?|swords?|quest|prophecy|enchant\w*|castle|realm)\b|魔法|巨龙|精灵|骑士|王国/gi,
  scifi:
    /\b(spaceships?|starships?|planets?|galaxy|galactic|space station|orbit|lasers?|androids?|robots?|cyborgs?|hyperspace|warp|colony|alien|fleet|plasma)\b|星舰|飞船|星球|机甲|星际/gi,
  romance:
    /\b(kiss\w*|boyfriend|girlfriend|crush|date|dating|blush\w*|wedding|husband|wife|fiancée?|heartbeat|in love)\b|恋爱|喜欢你|男朋友|女朋友|婚礼|老公|老婆/gi,
  mystery:
    /\b(detective|murder\w*|inspector|suspects?|evidence|alibi|crime scene|victim|corpse|culprit|investigat\w*|forensic|case)\b|侦探|凶手|嫌疑|证据|命案|尸体/gi,
};

/**
 * A guess at the genre from the book's own words (the first chapters are enough). Undefined when nothing stands out,
 * so the reader is never pushed into a wrong preset. Counts are per 10,000 characters so short and long samples compare.
 */
export function guessGenre(text: string): GenreId | undefined {
  const sample = text.slice(0, 60000);
  if (sample.length < 500) return undefined;
  const per = 10000 / sample.length;
  const scores = (Object.keys(SIGNS) as (keyof typeof SIGNS)[])
    .map((id) => ({ id, score: (sample.match(SIGNS[id]) ?? []).length * per }))
    .sort((a, b) => b.score - a.score);
  const [best, next] = scores;
  // Clear enough: a real count, and well ahead of the next genre.
  if (best.score < 3 || best.score < next.score * 1.4) return undefined;
  return best.id;
}
