import type { Guide } from './types';

/**
 * A reader's guide to "Foolish Game of the Gods" (诸神愚戏, by 一月九十秋), written for this app from encyclopedia
 * summaries of the novel (Baidu Baike in Chinese and English) and the English fan translation's chapter titles,
 * 2026-11-13. It has spoilers: the owner asked for them. Names the translation may use are given as other names.
 * Sources disagree in places; those lines say so.
 */
const p = (english: string, original: string, about: string[], extra: Partial<Guide['entries'][number]> = {}) => ({ english, original, kind: 'person' as const, about, ...extra });
const god = (english: string, original: string, aliases: string[], note: string, about: string[] = []) => ({ english, original, kind: 'god' as const, aliases, note, about });
const place = (english: string, original: string, aliases: string[], note: string, about: string[] = []) => ({ english, original, kind: 'place' as const, aliases, note, about });
const group = (english: string, original: string, aliases: string[], note: string, about: string[] = []) => ({ english, original, kind: 'group' as const, aliases, note, about });
const term = (english: string, original: string, aliases: string[], note: string, about: string[] = []) => ({ english, original, kind: 'term' as const, aliases, note, about });

export const FOOLISH_GAME: Guide = {
  book: 'Foolish Game of the Gods',
  titles: ['foolish game of the gods', 'the foolish game of gods', 'foolish game of gods', "gods' foolish play", '诸神愚戏', '諸神愚戲', 'zhu shen yu xi'],
  // Corrections to what an earlier version of this guide added (2026-11-14): the Nature Cult was filed under the
  // Natural Alliance. Applied before filling in, so filling in again gives each its own entry.
  fixes: [{ english: 'Natural Alliance', kind: 'group', original: 'Natural Alliance', removeAliases: ['Nature Sect', 'Naturalist Sect'] }],
  entries: [
    // The six paths. Each has its gods; opposing gods share a leaderboard.
    term('Path of the Void', '虚无', ['Void path', 'Void'], 'Path of two gods: Deceit (its appearance) and Fate (its essence)', ['The main story takes place in the Void Era']),
    term('Path of Existence', '存在', ['Existence path', 'Existence'], 'Path of two gods: Memory (its appearance) and Time (its essence)'),
    term('Path of Civilization', '文明', ['Civilization path', 'Civilization'], 'Path of three gods: Order (prelude), Truth (climax), War (epilogue)'),
    term('Path of Chaos', '混沌', ['Chaos path'], 'Path of three gods: Chaos/Disorder (prelude), Folly (climax), Silence (epilogue)'),
    term('Path of Life', '生命', ['Life path', 'Life'], 'Path of three gods: Birth (prelude), Prosperity (climax), Death (epilogue)'),
    term('Path of Descent', '沉沦', ['Descent path', 'Path of the Fall', 'the Fall', 'Descent'], 'Path of three gods: Corruption (prelude), Decay (climax), Annihilation (epilogue)'),

    // The sixteen true gods.
    god('Deceit', '欺诈', ['Deception', 'God of Deceit'], 'God of the Void path, its appearance; elder twin sister of Fate', [
      'Her rite is lying and trickery; her prayer says not to tell true from false',
      'Opposed to Memory; shares a leaderboard with it',
      'Started the Covenant among the gods; fears the Primordial Origin',
      'Cheng Shi follows her; she pushes him toward becoming the new Primordial Origin',
      'Later gains the authority of Chaos (Disorder)',
    ]),
    god('Fate', '命运', ['God of Fate'], 'God of the Void path, its essence; younger twin sister of Deceit', [
      'Knows the past and countless futures; holds chance, change and destiny',
      'Her rite is divination by rolling the Die of Fate',
      'Her gaze pulls a soul toward nothingness',
      'Opposed to Time',
      'Prophesied against the Primordial Origin to protect Deceit, and was erased for it',
    ]),
    god('Memory', '记忆', ['God of Memory'], 'God of the Existence path, its appearance', [
      'Records the past faithfully but not always truthfully, without joy or grief',
      'Her rite is offering a memory, anyone’s',
      'Opposed to Deceit',
    ]),
    god('Time', '时间', ['God of Time'], 'God of the Existence path, its essence', [
      'Watches the present and never changes; its rite is precise punctuality',
      'Opposed to Fate',
      'Drawn by Deceit into the "Fear Faction" of gods',
    ]),
    god('Order', '秩序', ['God of Order'], 'First god of the Civilization path', [
      'Once the strongest being in the cosmos; won the First Divine War',
      'Followers must seek out rules and obey the order they find',
      'Mortal enemy of Chaos (Disorder); once imprisoned the Wrath of Abomination',
      'Later split apart after entering the Sea of Desire',
    ]),
    god('Truth', '真理', ['God of Truth'], 'Second god of the Civilization path', [
      'The sum of the cosmos’s laws',
      'Support classes gain by learning knowledge, fighters by spreading it',
      'Opposed to Folly',
      'Dies after an experiment on a sliced universe',
    ]),
    god('War', '战争', ['God of War'], 'Third god of the Civilization path', [
      'Its rite is strife: survival only through blood and fire',
      'One eye a burning flame, the other a stream of blood; a war march sounds when they open',
      'Opposed to Silence; planned to challenge the Primordial Origin',
    ]),
    god('Chaos', '混乱', ['Disorder', 'God of Chaos'], 'First god of the Chaos path; mortal enemy of Order', [
      'Holds that no true rule exists and the cosmos should end in disorder',
      'Its servants include the elemental judges',
      'Took the Paranoia authority from Order; its temple is impersonated by Deceit',
    ]),
    god('Folly', '痴愚', ['Foolishness', 'God of Folly'], 'Second god of the Chaos path', [
      'Calls itself the first fool of the universe and thinks everyone else a fool',
      'Its rite is contempt; its followers look down on others',
      'Opposed to Truth',
    ]),
    god('Silence', '沉默', ['God of Silence'], 'Third god of the Chaos path', [
      'Its rite is silence: watch, listen and think, never speak, like a lone monk',
      'Knows the most secrets of all the gods',
      'Opposed to War',
    ]),
    god('Birth', '诞育', ['Fertility', 'Nurture', 'Procreation', 'Goddess of Fertility'], 'First god of the Life path, the origin of all things', [
      'Her rite is embracing procreation and making new life',
      'Records every birth and death; cares only for birth and the Primordial Origin',
      'Opposed to Corruption',
      'Her first child is the Broodmother of Sin, "her whip"',
    ]),
    god('Prosperity', '繁荣', ['Mother of Prosperity'], 'Second god of the Life path, its peak', [
      'Called the Mother of Prosperity; her realm is the Divine Shade',
      'Her rite is piling up nourishment; her powers are breeding, purity, assimilation, abundance and vitality',
      'Wanted to absorb the other gods into her prosperity; absorbed some of her own children',
      'Opposed to Decay',
      'In the end she takes her own life and hands out her authorities',
    ], ),
    god('Death', '死亡', ['God of Death'], 'Third god of the Life path, its end', [
      'A giant skull with black-hole eyes; its realm is the Fishbone Hall',
      'Called the friendliest and most reliable of the gods',
      'Inspired by Cheng Shi’s faked death; stole part of the powers of Deceit and Memory',
      'Opposed to Annihilation; its closest herald is the Bone Butcher, Garuda',
    ]),
    god('Corruption', '污堕', ['Depravity', 'Defilement', 'God of Corruption'], 'First god of the Descent path', [
      'Urges people to break their chains and release their deepest desires',
      'Hides in the Sea of Desire, which it rules',
      'Opposed to Birth; whether it truly exists is never confirmed',
    ]),
    god('Decay', '腐朽', ['Rot', 'God of Decay'], 'Second god of the Descent path, "the final tomb of the universe"', [
      'A rotting corpse-giant; its realm is the Mausoleum',
      'Its rite is speeding up decay, often by self-harm: the faster you rot, the more power you get',
      'Opposed to Prosperity; gives Cheng Shi part of its authority',
    ]),
    god('Annihilation', '湮灭', ['God of Annihilation'], 'Third god of the Descent path, its end', [
      'Believes all life ends in destruction; its followers await the final judgment',
      'Black eyes like the Void',
      'Opposed to Death',
      'Outschemed by Cheng Shi, who takes its divine throne; it destroys itself',
    ]),
    god('Primordial Origin', 'Primordial Origin', ['the Origin'], 'The power above the sixteen gods', [
      'Watches the sliced universes and grants true-god status at the end of each era',
      'Said to hide in the Sea of Desire; Deceit fears it',
    ]),

    // Heralds: the gods' subordinate deities.
    god('Garuda', '迦楼罗', ['Bone Butcher', 'the Bone Butcher'], "Death's herald, the Bone Butcher", [
      "Death's oldest and most trusted servant",
      'Loved Leleer; after she jumped into the Sea of Desire, chose to merge with Prosperity in her place',
    ]),
    god('Leleer', '乐乐尔', ['Mother Tree of Fear', 'Flourishing Branch', 'Lele’er'], "Prosperity's youngest daughter, later Corruption's herald", [
      'Born without fear; asked Death what fear was',
      'Jumped into the Sea of Desire and became the Mother Tree of Fear; guards its gate',
    ]),
    god('Dizell', '狄泽尔', ['Unshadowed Crown', 'the Unshadowed Crown', 'Dizer'], "Prosperity's second son, who betrayed her for Decay", [
      'Executed for trying to take Decay’s throne',
      'His body became the Wasteland Walker Epuska; his soul was sealed in the dagger Gift of Wounds',
    ]),
    god('Epuska', '厄浦斯卡', ['Wasteland Walker'], "The wandering body of Dizell, in the Forest of Sighs"),
    god('Fulazhuoer', '芙拉卓尔', ['Flazhuo’er'], "Prosperity's eldest daughter and herald", ['Absorbed into Prosperity; her identity and fate pass to Hong Lin']),
    god('Helazuer', '赫拉祖尔', [], "Prosperity's eldest son and herald, absorbed into her"),
    god('Gelisi', '歌莉丝', ['Broodmother of Sin', 'Gelba'], "Birth's herald and first child, the Broodmother of Sin", ['Two faces of one being with the Gate of Joyous Desire']),
    god('Afuluosi', '阿夫洛斯', ['Gate of Joyous Desire', 'Tulading', 'Tula'], "Corruption's herald, the Gate of Joyous Desire", ['Two faces of one being with the Broodmother of Sin']),
    god('Wrath of Abomination', '憎恶之怒', ['Blazing Sun'], "Chaos's herald, looks like a giant sun", ['Imprisoned by Order; its fire is the strongest power Chaos gives its elemental judges']),
    god('Thunderclap', '鸣雷', [], 'A herald of Order, killed in the First Divine War'),

    // Places.
    place('Faith Game world', 'Faith Game world', ['the shards', 'fragments'], 'Earth after the gods came, cut into shards walled off by air walls', [
      'Players start on a shard (Cheng Shi on a rooftop) and widen it by clearing trials',
    ]),
    place('Continent of Hope', 'Continent of Hope', [], 'A western-fantasy world: Truth and Order above ground, Corruption and Chaos below', ['The two halves are joined by the Abyssal Volcano']),
    place('Sea of Desire', '欲海', [], "Corruption's domain, where it hides", ['Leleer jumped into it; Order later split apart there']),
    place('Divine Shade', '神荫', [], "Prosperity's divine kingdom"),
    place('Fishbone Hall', '鱼骨殿堂', ['Fishbone Palace'], "Death's divine kingdom", ['Holds the Throne of Bones']),
    place('Mausoleum', '陵墓', ['the Tomb'], "Decay's divine kingdom"),
    place('Forest of Sighs', '叹息森林', [], 'Where the Wasteland Walker Epuska wanders'),
    place('Far Dusk Town', '远暮镇', ['Far Dusk', 'Yuanmu Town'], 'A town in a trial (around chapter 115)'),
    place('Montelani', '蒙特拉尼死斗刑场', ['Montelani Deathmatch Arena'], 'A deathmatch execution arena (around chapter 205)'),
    place('Tomb of Tainted Blood', '败血终墓', ['Final Tomb of Decayed Blood'], 'A trial location (around chapters 315–316)'),
    place('Fog Gate', '雾门', [], 'A trial location (around chapter 272)'),
    place('Rosna', 'Rosna', [], 'A nation of Decay (around chapter 480)'),
    place('Sliced universes', 'Sliced universes', ['slices', 'Slice Universe'], 'Other versions of reality where events turn out differently'),

    // Groups.
    group('Torchbearers', '传火者', ['Firebearers', 'Fire-carriers'], 'A group carrying the fire of civilization', ['Nangong, Fang Shiqing and Cui Dingtian are among them']),
    group('Society of the Mediocre', '庸人会', ['Mediocre Society', "Commoners' Society"], 'A secret society of Clowns; members go by numbers', ['Cheng Shi is No. 15; Zhen Xin was No. 1', 'Led by President Gong']),
    group('The Fated', 'The Fated', [], 'Group founded by Cheng Shi', ['Members include Hong Lin and Tao Yi']),
    group('Tower of Logic', '理质之塔', ['Tower of Rationality'], 'A great power on the Continent of Hope, ruled by a council of scholars', ['Works with the Agency Hand on underground resources']),
    group('Council of Scholars', '博学主席会', ['Council of Learned Chairmen'], 'The ruling council of the Tower of Logic'),
    group('Grand Tribunal', 'Grand Tribunal', [], 'One of the two great powers above ground on the Continent of Hope'),
    group('Natural Alliance', 'Natural Alliance', [], 'A looser alliance, behind the Tribunal and the Tower, with shared-rule agreements'),
    group('Nature Cult', '自然教派', ['Nature Sect', 'Naturalist Sect'], 'A faction of players that claims to seek "true nature"', [
      'Began in the early Faith Game as a legitimate faction of mostly Life path players',
      'As players of other paths joined, its teachings drifted; it now stands between Life and Descent',
      'Walks a line between "embracing one’s nature" and indulging in corruption',
      'Seeks godhood like the Logic Association, but quietly',
    ]),
    group('Logic Association', 'Logic Association', ['Rationalist Association'], 'A faction of players that seeks godhood openly', ['More brazen about it than the Nature Cult']),
    group('Afterglow Church', 'Afterglow Church', [], 'Underground followers of Chaos with no leaders', ['Gather, cause chaos and scatter; want to tear apart the afterglow of Order']),
    group('Extreme Desire Brotherhood', 'Extreme Desire Brotherhood', [], 'Underground followers of Corruption who run the metal trade'),
    group('Agency Hand', 'Agency Hand', [], 'Plunders underground resources for the surface powers'),
    group('Sanwu Tribe', '三乌部', [], 'The earliest human tribe of the Life era, worshipping Birth', ['Split into the Wulun, the Wuda and the Wuma (Uma sinners)']),
    group('Undead Salvation Society', 'Undead Salvation Society', [], 'Founded by Ji Yue'),
    group('Historical School', 'Historical School', [], 'A faction once led by Zhen Yi (and Zhen Xin); Gao Yu is a member'),
    group('Worship-the-Gods Society', '崇神会', ['God-Worship Society'], 'A faction of players who worship the gods (around chapter 292)'),
    group('Advent Faction', '降临派', ['Descent Faction'], 'A faction tied to the gods’ descent (around chapter 292)'),
    group('Tribunal of Evil Infants', '恶婴裁判所', [], 'A tribunal met around chapters 346–400'),
    group('Scavengers', '清道夫', ['Cleaners'], 'Attack Cheng Shi’s group (around chapter 361)'),

    // How the game works.
    term('Faith Game', '信仰游戏', ['Game of Faith'], 'The game the gods made of the world: pick a path and a god, or die', [
      'Dying in the game is dying for real; two-thirds of people died in the first six months',
      'Players are also called divine believers',
    ]),
    term('Trial', 'Trial', [], 'A round of the game: clear it for resources, or to break an air wall'),
    term('Wishing Trial', '祈愿试炼', ['Wish Trial'], 'Make a wish and the gods build a trial for it; clear it and the wish is granted', [
      'Food, shelter, transport, even divine power come from wishes',
      'Bigger wishes mean harder trials; solo trials give no points and little reward',
    ]),
    term('Special Divine Trial', 'Special Divine Trial', [], 'A hard trial given every seven days', ['Fail it and you cannot make wishes for the next cycle']),
    term('Ladder of Ascent', '登神之路', ['Path to Godhood', 'Ladder', 'Ladder Rank', 'Heavenly Ladder', 'Road to Divinity'], 'The global score ranking every player', [
      'Everyone starts at 1000; below 1000 at a settlement means death',
      'Above 1200 unlocks B-grade talents and items, 1600 A, 2000 S, 2400 SS',
      'Extra settlement at the end of each month; new talent slots open at 1200, 1600, 2000 and 2400',
    ]),
    term('Ladder of Audience', '觐见之梯', [], 'Rankings by path and god; opposing gods share one board (Deceit and Memory)'),
    term('Chosen One', '神选', ['Chosen Ones', 'Chosen'], 'A player a god has picked out; each has a public ID'),
    term('Divine Mandate', '谕行', ['rite'], 'The act each god asks of its followers (lying for Deceit, rolling dice for Fate…)'),
    term('Herald', '令使', ['Envoy', 'Subordinate God', 'Attendant God'], 'A lesser god serving a true god'),
    term('Divine Kingdom', '神国', ['Divine Realm'], 'A god’s own realm: Divine Shade, Fishbone Hall, Mausoleum…'),
    term('Authority', 'Authority', ['Authorities'], 'A god’s powers; can be taken, split or fused'),
    term('Divinity', '神性', [], 'Godly nature; it can sprout in people, and is said to sprout from fear'),
    term('Divine War', '神战', ['First Divine War', 'God War'], 'A war among the gods; Order won the first one'),
    term('Talent', 'Talent', ['S-Rank Talent'], 'An ability graded up to SSS; each player starts with a faith talent and a class talent'),
    term('Oathbreaker', '弃誓者', [], 'Someone who broke their faith oath; it unlocks other talents and curses (like Honest Clown)'),
    term('Fusion', 'Fusion', [], 'Following two gods at once (Cheng Shi: Deceit with Chaos, Fate with Time)'),
    term('Semi-Divine Artifact', '半神器', ['Demigod artifact'], 'A relic with a god’s power in it, like the dagger Gift of Wounds'),
    term('Chat Channels', '聊天频道', ['chat channel'], 'Regional, faith and class channels players talk in'),
    term('Die of Fate', 'Die of Fate', ['Dice of Fate'], 'Fate’s die; rolling it is her rite and guides Cheng Shi'),
    term('Mask of Mortals', 'Mask of Mortals', ['Mask of All Beings'], 'A mask from Fate’s trials that lets Cheng Shi switch class'),
    term('Gift of Wounds', '疮痍之赐', ['Wound-Gift'], 'A demigod dagger holding the soul of Dizell'),
    term('Warrior', 'Warrior', [], 'One of the six base classes'),
    term('Mage', 'Mage', [], 'One of the six base classes'),
    term('Priest', '牧师', [], 'One of the six base classes; Cheng Shi’s class'),
    term('Assassin', 'Assassin', [], 'One of the six base classes'),
    term('Hunter', 'Hunter', [], 'One of the six base classes'),
    term('Bard', 'Bard', ['Singer'], 'One of the six base classes'),
    term('Clown', '小丑', ['Clowns', 'Honest Clown'], 'Cheng Shi’s hidden identity; members of the Society of the Mediocre are Clowns'),

    // People. Path / god / class, and who they are.
    p('Cheng Shi', '程实', [
      'Protagonist; says he never lies and never believes anyone, himself included',
      'Follows Deceit (fused with Chaos) and Fate (fused with Time); class Priest, secretly a Clown',
      'No. 15 of the Society of the Mediocre; founder of the Fated',
      'Fakes his own death, which inspires Death',
      'Has "slice" personalities named Li Yi, Ji Er, Gao San, Zhao Si and Su Wu',
    ], {
      gender: 'he',
      role: 'main',
      powers: ['Reflection of the Void (SSS)', 'Lies Like Yesterday (SS)', 'Loom of Fate (SS)', 'Time Deduction (SS)', 'Shared Divine Grace (S): passes healing on', 'Master of Deception (S)', 'Die of Fate'],
      status: ['Void path; Deceit and Fate', 'Priest; Clown', 'ID: "I Never Deceive Anyone"'],
    }),
    p('Chen Chong', 'Chen Chong', ['Order Warrior of the Civilization path'], { status: ['Civilization / Order, Warrior'] }),
    p('Song Yawen', 'Song Yawen', ['Life Assassin who follows Death'], { gender: 'he', status: ['Life / Death, Assassin'] }),
    p('Xia Wan', 'Xia Wan', ['Life Hunter who follows Birth'], { status: ['Life / Birth, Hunter'] }),
    p('Cao Sansui', 'Cao Sansui', ['Existence Mage who follows Time (a Time Walker)'], { status: ['Existence / Time, Mage'] }),
    p('Nangong', 'Nangong', ['Priest who moves from Descent (Decay) to the Void (Fate)', 'One of the Torchbearers'], { status: ['Descent → Void; Decay → Fate, Priest'] }),
    p('Zhang Jizu', '张祭祖', ["Death's Chosen One, later fused with Deceit", 'A Clown and one of Cheng Shi’s most trusted friends; nicknamed Squinty Eyes'], { status: ['Life / Death with Deceit, Priest', 'ID: "Cemetery Keeper"'] }),
    p('Zhen Xin', '甄欣', ["Former Chosen of Deceit; No. 1 of the Society of the Mediocre", 'Revived by Deceit after dying in the snow', 'Fused with Chaos and became the new god of Chaos'], { status: ['Void / Deceit, Bard', 'ID: "True Sincerity"'] }),
    p('Zhen Yi', '甄奕', ["Zhen Xin's second personality", 'Became the new god of Deceit'], { status: ['Void / Chaos; Deceit with Chaos, Mage'] }),
    p('Hong Lin', '红霖', ["Prosperity's Chosen One; nicknamed Big Cat", 'Member of the Fated; inherits Fulazhuoer’s identity', 'Becomes the new god of Prosperity, then leaves with the Primordial Origin’s power'], { status: ['Life / Prosperity with Fate, Warrior'] }),
    p('Hu Xuan', '胡璇', ["Birth's Chosen One, the Eternal Sun", 'Top of the Birth ranking; becomes the new god of Birth'], { status: ['Life / Birth, Mage', 'ID: "Eternal Sun"'] }),
    p('An Mingyu', '安铭瑜', ["Fate's Chosen One, called the Blind One"], { status: ['Void / Fate', 'ID: "I See You"'] }),
    p('Li Jingming', '李景明', ["Memory's Chosen One who broke his oath and later became Deceit's Chosen"]),
    p('Hu Wei', '胡为', ["War's Chosen One, called the Grand Marshal"], { status: ['Chaos / Chaos, Warrior (sources differ)'] }),
    p('Mo Li', '莫离', ["Order's Chosen One, called the Chief Minister"]),
    p('Chen Shu', '陈述', ["Silence's Chosen One"]),
    p('Lin Xi', '林稀', ["Decay's Chosen One"], { status: ['ID: "Rotten Wood"'] }),
    p('Lao Deng', '老登', ["Time's Chosen One; real name unknown"]),
    p('Duyao', '毒药', ["Corruption's Chosen One, ID Poison; real name unknown"], { aliases: ['Poison'] }),
    p('Mo Shu', '墨殊', ["Annihilation's Chosen One; fakes a death"]),
    p('Cures Infertility', '专治不孕', ["Birth's former top Chosen One, overtaken by Hu Xuan; real name unknown"]),
    p('Fang Shiqing', '方诗晴', ['Truth Bard; a Torchbearer who seeks firewood and guards the city'], { status: ['Civilization / Truth, Bard'] }),
    p('Huang Bo', '黄波', ['Chaos Bard; dies early'], { status: ['Chaos / Chaos, Bard'] }),
    p('Gou Feng', '苟峰', ['Birth Warrior; dies'], { status: ['Life / Birth, Warrior'] }),
    p('A Ming', 'A Ming', ['Order Assassin'], { status: ['Civilization / Order, Assassin'] }),
    p('Bailing', 'Bailing', ['Hunter who moves from Corruption to Deceit; becomes a beast tamer and dies in the Sea of Desire']),
    p('Xu Lu', 'Xu Lu', ['Fate Bard'], { status: ['Void / Fate, Bard'] }),
    p('Tao Yi', 'Tao Yi', ['Prosperity Mage fused with Fate; joins the Fated', 'Takes Prosperity’s divine seat after Hong Lin leaves']),
    p('Su Yida', 'Su Yida', ['Deceit Mage, killed by Death’s power']),
    p('Cui Dingtian', 'Cui Dingtian', ['Decay Warrior who joins the Torchbearers; father of Cui Qiushi']),
    p('Cui Qiushi', 'Cui Qiushi', ['Order Warrior, one of the city guardians; child of Cui Dingtian']),
    p('Gao Yu', 'Gao Yu', ['Truth Mage of the Historical School']),
    p('Zhao Qian', 'Zhao Qian', ['War Warrior who kills himself to protect Cheng Shi']),
    p('Qin Chaoge', 'Qin Chaoge', ['War Bard who fights like a Warrior']),
    p('Ji Yue', 'Ji Yue', ['Truth Mage, later fused with War; founds the Undead Salvation Society']),
    p('Li Bola', 'Li Bola', ['Time Hunter']),
    p('He Lu', 'He Lu', ['Silence Warrior']),
    p('Du Xiguang', 'Du Xiguang', ['Memory Mage']),
    p('Yun Ni', 'Yun Ni', ['Annihilation Assassin']),
    p('Wei Guan', 'Wei Guan', ['Folly Hunter']),
    p('President Gong', '龚会长', ['Leader of the Society of the Mediocre'], { aliases: ['Gong'] }),
  ],
};
