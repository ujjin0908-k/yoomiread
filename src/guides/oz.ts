import type { Guide } from './types';

/**
 * A reader's guide to "The Wonderful Wizard of Oz" (L. Frank Baum, 1900; public domain), the free sample book.
 * Written for this app from the book itself, 2026-11-22. Every link and event carries the chapter it happens in, so the
 * Living Book only shows what the reader has reached.
 */
const p = (english: string, about: string[], extra: Partial<Guide['entries'][number]> = {}) => ({ english, original: english, kind: 'person' as const, about, ...extra });
const place = (english: string, note: string, extra: Partial<Guide['entries'][number]> = {}) => ({ english, original: english, kind: 'place' as const, note, ...extra });
const group = (english: string, note: string, aliases: string[] = []) => ({ english, original: english, kind: 'group' as const, note, aliases });
const lore = (english: string, note: string, aliases: string[] = []) => ({ english, original: english, kind: 'term' as const, note, aliases });

const YELLOW = 'The Yellow Brick Road';
const WITCH = 'The Wicked Witch';
const HUMBUG = 'The Great Humbug';
const SOUTH = 'The Journey South';

export const OZ: Guide = {
  book: 'The Wonderful Wizard of Oz',
  titles: ['the wonderful wizard of oz', 'wonderful wizard of oz', 'the wizard of oz', 'wizard of oz'],
  genre: 'fantasy',
  style: 'Storybook watercolour in the style of early 1900s children’s book plates, soft outlines, warm paper texture',
  entries: [
    p('Dorothy', ['A girl who lives on a Kansas farm with her aunt and uncle'], { gender: 'she', role: 'main' }),
    p('Toto', ['Dorothy’s little black dog'], { gender: 'he', role: 'main' }),
    p('Scarecrow', ['A scarecrow who wants brains'], { gender: 'he', role: 'main', aliases: ['the Scarecrow'] }),
    p('Tin Woodman', ['A man made of tin who wants a heart'], { gender: 'he', role: 'main', aliases: ['the Tin Woodman', 'Woodman'] }),
    p('Cowardly Lion', ['A lion who is afraid, and wants courage'], { gender: 'he', role: 'main', aliases: ['the Lion', 'Lion'] }),
    p('Oz', ['The Great Wizard who rules the Emerald City'], { gender: 'he', role: 'main', aliases: ['the Wizard', 'the Great Oz', 'Oz, the Great and Terrible'] }),
    p('Aunt Em', ['Dorothy’s aunt, a farmer’s wife'], { gender: 'she' }),
    p('Uncle Henry', ['Dorothy’s uncle, a farmer'], { gender: 'he' }),
    p('Good Witch of the North', ['A kind witch who greets Dorothy in the land of the Munchkins'], { gender: 'she', aliases: ['Witch of the North'] }),
    p('Wicked Witch of the East', ['A wicked witch who kept the Munchkins in bondage'], { gender: 'she', aliases: ['Witch of the East'] }),
    p('Wicked Witch of the West', ['A wicked witch who rules the Winkies'], { gender: 'she', aliases: ['Witch of the West', 'the Wicked Witch'] }),
    p('Glinda', ['The Good Witch of the South, most powerful of the witches'], { gender: 'she', aliases: ['Good Witch of the South', 'Witch of the South'] }),
    p('Guardian of the Gates', ['The green man who keeps the gates of the Emerald City'], { gender: 'he', aliases: ['the Guardian'] }),
    p('Queen of the Field Mice', ['Queen of all the field mice'], { gender: 'she', aliases: ['Queen of the Mice'] }),
    p('Soldier with the green whiskers', ['A soldier who guards the palace of Oz'], { gender: 'he', aliases: ['the soldier'] }),

    place('Kansas', 'The grey prairie where Dorothy lives'),
    place('Land of Oz', 'The land Dorothy is carried to by the cyclone'),
    place('Munchkin Country', 'The blue country of the East, home of the Munchkins', { aliases: ['land of the Munchkins'], within: 'Land of Oz' }),
    place('Emerald City', 'The green city at the centre of the land, ruled by Oz', { within: 'Land of Oz' }),
    place('Winkie Country', 'The yellow country of the West, home of the Winkies', { aliases: ['land of the Winkies', 'Yellow Land of the West'], within: 'Land of Oz' }),
    place('Quadling Country', 'The red country of the South, home of the Quadlings', { aliases: ['country of the Quadlings', 'South Country'], within: 'Land of Oz' }),
    place('Dainty China Country', 'A walled land where everyone is made of china', { aliases: ['China Country'], within: 'Land of Oz' }),

    group('Munchkins', 'The small people of the East, who dress in blue'),
    group('Winkies', 'The people of the West, who dress in yellow'),
    group('Quadlings', 'The people of the South, who dress in red'),
    group('Winged Monkeys', 'A band of flying monkeys who must obey whoever holds the Golden Cap'),
    group('Field Mice', 'The mice of the fields, ruled by their queen', ['field mice']),

    lore('Silver Shoes', 'The shoes of the Wicked Witch of the East, with a charm no one yet knows', ['silver shoes']),
    lore('Golden Cap', 'A cap whose owner can call the Winged Monkeys three times'),
    lore('Yellow brick road', 'The road paved with yellow brick that leads to the Emerald City', ['road of yellow brick']),
    lore('Kalidahs', 'Beasts with bodies like bears and heads like tigers'),
    lore('Deadly poppy field', 'A field of poppies whose scent puts anyone who breathes it to sleep', ['poppy field', 'poppies']),
    lore('Hammer-Heads', 'Armless men on a hill who strike with their heads', ['Hammer-Head']),
  ],
  links: [
    { from: 'Toto', to: 'Dorothy', label: 'dog of', safe: true },
    { from: 'Aunt Em', to: 'Dorothy', label: 'aunt of', safe: true },
    { from: 'Uncle Henry', to: 'Dorothy', label: 'uncle of', safe: true },
    { from: 'Aunt Em', to: 'Uncle Henry', label: 'married to', safe: true },
    { from: 'Wicked Witch of the East', to: 'Munchkins', label: 'ruled', chapter: 2 },
    { from: 'Wicked Witch of the West', to: 'Winkies', label: 'rules', chapter: 2 },
    { from: 'Oz', to: 'Emerald City', label: 'rules', chapter: 2 },
    { from: 'Good Witch of the North', to: 'Dorothy', label: 'protects', chapter: 2 },
    { from: 'Scarecrow', to: 'Dorothy', label: 'friend of', chapter: 3 },
    { from: 'Tin Woodman', to: 'Dorothy', label: 'friend of', chapter: 5 },
    { from: 'Cowardly Lion', to: 'Dorothy', label: 'friend of', chapter: 6 },
    { from: 'Queen of the Field Mice', to: 'Field Mice', label: 'queen of', chapter: 9 },
    { from: 'Queen of the Field Mice', to: 'Tin Woodman', label: 'owes her life to', chapter: 9 },
    { from: 'Wicked Witch of the West', to: 'Winged Monkeys', label: 'commands', chapter: 12 },
    { from: 'Dorothy', to: 'Winged Monkeys', label: 'commands', chapter: 14 },
    { from: 'Scarecrow', to: 'Emerald City', label: 'rules', chapter: 17 },
    { from: 'Glinda', to: 'Quadlings', label: 'rules', chapter: 18 },
    { from: 'Tin Woodman', to: 'Winkies', label: 'rules', chapter: 23 },
  ],
  events: [
    { chapter: 1, arc: YELLOW, title: 'A cyclone carries Dorothy and Toto away in the farmhouse', who: ['Dorothy', 'Toto'], where: 'Kansas' },
    { chapter: 2, arc: YELLOW, title: 'The house falls on the Wicked Witch of the East and kills her', who: ['Dorothy', 'Wicked Witch of the East'], where: 'Munchkin Country' },
    { chapter: 2, arc: YELLOW, title: 'Dorothy is given the Silver Shoes and sent to find Oz', who: ['Dorothy', 'Good Witch of the North'], where: 'Munchkin Country' },
    { chapter: 3, arc: YELLOW, title: 'Dorothy lifts the Scarecrow down from his pole', who: ['Dorothy', 'Scarecrow'] },
    { chapter: 5, arc: YELLOW, title: 'Dorothy oils the rusted Tin Woodman so he can move again', who: ['Dorothy', 'Tin Woodman'] },
    { chapter: 6, arc: YELLOW, title: 'The Cowardly Lion joins the travellers', who: ['Cowardly Lion', 'Dorothy'] },
    { chapter: 7, arc: YELLOW, title: 'The travellers escape the Kalidahs across a chasm', who: ['Scarecrow', 'Tin Woodman', 'Cowardly Lion'] },
    { chapter: 8, arc: YELLOW, title: 'Dorothy and the Lion fall asleep in the deadly poppy field', who: ['Dorothy', 'Cowardly Lion'] },
    { chapter: 9, arc: YELLOW, title: 'The field mice pull the sleeping Lion out of the poppies', who: ['Queen of the Field Mice', 'Cowardly Lion'] },
    { chapter: 11, arc: WITCH, title: 'Oz says he will help only if they kill the Wicked Witch of the West', who: ['Oz', 'Dorothy'], where: 'Emerald City' },
    { chapter: 12, arc: WITCH, title: 'Dorothy throws water on the Wicked Witch of the West, who melts away', who: ['Dorothy', 'Wicked Witch of the West'], where: 'Winkie Country' },
    { chapter: 13, arc: WITCH, title: 'The Winkies help mend the Scarecrow and the Tin Woodman', who: ['Scarecrow', 'Tin Woodman'], where: 'Winkie Country' },
    { chapter: 14, arc: WITCH, title: 'Dorothy uses the Golden Cap to call the Winged Monkeys', who: ['Dorothy'] },
    { chapter: 15, arc: HUMBUG, title: 'Toto knocks over a screen: Oz is an ordinary man, a humbug', who: ['Oz', 'Toto'], where: 'Emerald City' },
    { chapter: 16, arc: HUMBUG, title: 'Oz gives the Scarecrow brains, the Woodman a heart, the Lion courage', who: ['Oz', 'Scarecrow', 'Tin Woodman', 'Cowardly Lion'], where: 'Emerald City' },
    { chapter: 17, arc: HUMBUG, title: 'Oz leaves in his balloon without Dorothy', who: ['Oz', 'Dorothy'], where: 'Emerald City' },
    { chapter: 19, arc: SOUTH, title: 'The Fighting Trees attack; the Woodman cuts a way through', who: ['Tin Woodman'] },
    { chapter: 20, arc: SOUTH, title: 'The travellers cross the Dainty China Country', who: ['Dorothy'], where: 'Dainty China Country' },
    { chapter: 21, arc: SOUTH, title: 'The Lion kills a giant spider and becomes King of the Forest', who: ['Cowardly Lion'] },
    { chapter: 23, arc: SOUTH, title: 'Glinda tells Dorothy the Silver Shoes can carry her home', who: ['Glinda', 'Dorothy'], where: 'Quadling Country' },
    { chapter: 24, arc: SOUTH, title: 'Dorothy and Toto return to Kansas', who: ['Dorothy', 'Toto'], where: 'Kansas' },
  ],
};
