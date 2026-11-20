/**
 * How the places, gods and groups of "Foolish Game of the Gods" could look, as picture descriptions to paste into an
 * image tool. Built on what the encyclopedia sources say (Death's skull, War's eyes, Decay's rotting giant…); the rest
 * is an interpretation, written for this app on 2026-11-15. The shared art style is added when a prompt is copied.
 */
export const FOOLISH_GAME_LOOKS: Record<string, string> = {
  // The six paths.
  'Path of the Void':
    'The Void: an endless dark beyond the edge of everything, not black but a deep shifting indigo, full of slow spirals like the whites of divine eyes and scattered with tiny cold stars. Broken fragments of the world drift into it and quietly dissolve. Two vast twin silhouettes face away from each other at its heart, one veiled and smiling (Deceit), one cold and still (Fate), joined by a single glowing thread and a turning die of light. A tiny lone figure stands at the edge on a floating shard, looking in. Indigo, violet, silver starlight, a faint gold thread.',
  'Path of Existence':
    'Existence: an infinite archive under a frozen sky, where every moment that ever happened hangs in the air as a glass pane of amber light, and between them stand colossal clock mechanisms stopped mid-tick. Two twin figures, one made of inscribed stone (Memory) and one of brass and sand with black-hole eyes (Time), watch over it. Sepia, amber and bronze, perfectly still.',
  'Path of Civilization':
    'Civilization: a single mountain of human history seen from below, from the first torch at its foot, through white cities of law and towers of knowledge, to a summit wreathed in war smoke and banners. Three colossal figures stand along it: an armoured sovereign with a torch (Order), a being of diagrams and light (Truth), a scarred warrior with eyes of flame and blood (War). Gold, marble white and ember red.',
  'Path of Chaos':
    'Chaos: a world turned inside out, staircases leading into the sky, cities folding over themselves, broken law-books and chains swirling in a storm. Three gods stand within it: a shapeless laughing storm (Chaos), a scornful scholar on a throne of books (Folly), and a silent hooded monk who sees everything (Silence). Clashing purple, sickly green, ash grey.',
  'Path of Life':
    'Life: a single colossal tree of all living things rising from a dawn sea, its roots a womb of pearl light where new life begins (Birth), its crown an overwhelming eruption of blossoms and fruit (Prosperity), and its far side bare branches ending in a giant calm skull that receives the falling souls (Death). Dawn pink, emerald and bone white.',
  'Path of Descent':
    'Descent: a vast downward spiral into the earth, beginning at a red sea of desire where chains break (Corruption), sinking through an endless necropolis of rot and moths around a corpse-giant (Decay), and ending in a black nothing where everything crumbles to ash (Annihilation). Wine red, rot grey and black.',

  // The sixteen gods.
  Deceit:
    'A towering goddess half-turned away, wrapped in layered veils of shifting silk that never show the same face twice. Her eyes are warm and almost human, with slow spirals in the whites and tiny stars in the pupils; a sly smile under jade-pale hands raised to her lips as if keeping a secret. Behind her, a hall of broken mirrors reflects a dozen versions of her, none matching. Masks of comedy hang from silver threads around her. Violet and gold light.',
  Fate:
    'A colossal, still goddess seated among the stars, twin of Deceit but colder: the same face without warmth. Her eyes are blank and spiral, flecked with star-points, and looking into them pulls the soul toward nothing. A great die of pale bone and gold turns slowly above her open palm, its faces showing constellations. Thousands of glowing threads fan out from her fingers into the dark, each one a possible future. Deep indigo night, cold silver light.',
  Memory:
    'An ancient, serene god made of stacked pages and carved stone, eyes like weathered tablets inscribed with the history of ages. Around it drift countless floating fragments: faces, rooms, moments, frozen in amber light. Some fragments are subtly wrong, recorded faithfully but not truthfully. A vast library with no ceiling stretches behind it into dusk. Sepia, amber and dust motes.',
  Time:
    'A vast, motionless figure made of brass gears and hourglass sand, its face calm and unchanging, its eyes two black holes that swallow light. A crack runs through the sky behind it like a split in glass, and wind pours through it. Clock hands the size of bridges hang around it, every one perfectly on time. Cold bronze, grey light, sand frozen mid-fall.',
  Order:
    'A colossal armoured sovereign of white stone and gold, standing at the head of a city of perfect geometric walls, holding a great torch whose flame lights the whole civilisation below. Its face is a calm, featureless helm. Chains of light run from it down to every gate and street, binding everything in rule. In the far shadows, the faint cracks of a great split run down its armour. Pale gold, marble white, harsh noon light.',
  Truth:
    'A towering figure of pure law: a body made of interlocking diagrams, equations and turning astrolabes, its eyes blazing with the light of knowledge and endless intricate patterns. Books open and close by themselves in orbit around it. Below, scholars kneel in a vast domed observatory. Cool white and electric blue light, fine golden linework.',
  War:
    'A titanic warrior god in blackened, battle-scarred armour, standing on a hill of broken banners. Its left eye is a burning flame, its right a flowing stream of fresh blood. When its eyes open, the air itself seems to sound a march: war drums and horns rising out of the smoke. Armies clash in the red haze below. Crimson, ember orange and black smoke.',
  Chaos:
    'A shapeless god of unbound madness: a storm of shattered rules, torn law-books, broken chains and laughing faces, constantly rearranging itself. Elemental judges of fire, ice and lightning circle it like moons. Where it passes, straight lines bend and buildings melt into impossible angles. Clashing purple, sickly green and flame orange.',
  Folly:
    'A tall, lofty god lounging on a throne of discarded books, looking down at the viewer with pale eyes full of scorn. It wears the robes of a scholar, torn and worn with pride, and holds a cracked crown of knowledge askew. Tiny kneeling figures below are drawn as fools in caps. Sickly ivory and faded gold, a mocking cold light.',
  Silence:
    'A hooded monk-like god of immense size, sitting cross-legged in a hall of ashes, a finger never quite touching its closed lips. It has no visible mouth. Around it, sound itself seems frozen: falling leaves hang still, bells hang without ringing. Its many hidden eyes, half closed, see every secret. Muted grey, soft white fog, absolute stillness.',
  Birth:
    'A vast, serene mother goddess at the dawn of the world, cradled in a great blooming womb-flower of pearl and rose, with countless newborn lights rising from her open hands like seeds on the wind. She records each birth and each departure on a ribbon of light that spirals around her. Both gentle and indifferent. Dawn pink, cream and warm gold.',
  Prosperity:
    'The Mother of Prosperity: a colossal goddess overgrown with endless blossoms, fruit and vines, her body merging into a forest that keeps growing even as you look. Under her branches lies the Divine Shade, a green twilight full of bloom. Some of the vines hold the faces of her absorbed children. Beautiful and suffocating, too much life. Deep emerald, gold pollen light, heavy fragrance-haze.',
  Death:
    'A giant skull the size of a mountain, its eye sockets black holes that hold cold flames deep inside. It speaks in a voice like cold fire from the abyss, yet it is the kindest of the gods. Behind it rises the Fishbone Hall, a cathedral built from the spine and ribs of a colossal fish. Souls drift past it like pale lanterns. Bone white, deep blue-black, cold teal flames.',
  Corruption:
    'Something half-hidden beneath a dark rose-coloured sea: only the suggestion of a gigantic, beautiful, many-armed shape under the surface, beckoning. Chains break and fall into the water all around. Figures on the shore wade in, smiling, to answer their deepest desires. Wine red, rose pink and black water, heavy perfumed mist.',
  Decay:
    'A rotting corpse-giant of unimaginable age, seated on the shores of the end of the universe like the final tomb itself. Its flesh is grey stone and fungus, ribs open like the doors of a crypt, moss and moths spilling out. Pilgrims around it harm themselves to decay faster. Its home, the Mausoleum, spreads behind it. Ash grey, sickly yellow, rust and mould green.',
  Annihilation:
    'A god of ending: a tall, thin silhouette of absolute black, eyes like empty voids, standing at the edge of the world as everything around it crumbles to dust and drifts upward. Its followers kneel in rows, waiting for the final judgment, already turning to ash. Black, ash grey, and a thin white rim of dying light.',
  'Primordial Origin':
    'An unseen power beyond the sixteen gods: a vast spiral of countless sliced universes, like stacked panes of glass, each holding a slightly different world, all turning around a single blinding point of white light at the bottom of a sea of desire. Tiny divine figures look up at it in fear. Cosmic scale, black, white and faint gold.',

  // Heralds.
  Garuda:
    "The Bone Butcher: a tall, gaunt herald of Death in a butcher's leather apron over armour of fitted bones, carrying a great cleaver of bone. Its face is a bird-like skull. Loyal and grim, with a grief it hides. Fishbone Hall behind it. Bone white, dark leather, cold blue light.",
  Leleer:
    'The Mother Tree of Fear: once the youngest flower-daughter of Prosperity, now a vast black tree rising from the Sea of Desire, its branches hung with trembling blossoms shaped like frightened faces. She still looks young and curious at its heart. Guards the gate of the Sea of Desire. Black bark, pale pink blossoms, red water.',
  Dizell:
    "The Unshadowed Crown: a proud, handsome divine prince with a radiant crown that casts no shadow, half his body flourishing with Prosperity's blossoms and half withered by Decay. A traitor's cold smile. Gold, green and grey, strong rim light.",
  Epuska:
    'The Wasteland Walker: a hollow, wandering giant body of the fallen prince Dizell, half-dead, half-overgrown, trudging forever through the grey Forest of Sighs, trailing dust and dry leaves. Mist, grey-green, melancholy.',
  Fulazhuoer:
    "Prosperity's eldest daughter: a radiant young goddess in a gown of living petals, half merged into her mother's endless vines, her face calm as she is absorbed. Emerald and gold.",
  Helazuer:
    "Prosperity's eldest son: a strong, noble young god with antlers of flowering branches, sinking into a great wall of vines and blossoms that is his mother's body. Green, bark brown, gold light.",
  Gelisi:
    "The Broodmother of Sin, Birth's first child and 'her whip': a terrible maternal figure seated on a nest of eggs and cradles, with a long whip of braided umbilical cords. One face of a two-faced being. Pink flesh tones, pearl and dark red.",
  Afuluosi:
    "The Gate of Joyous Desire, herald of Corruption: a towering arched gateway of flesh, roses and gold, with a seductive face carved into its keystone, opening onto a red sea. The other face of the Broodmother of Sin. Rose, wine red and gold.",
  'Wrath of Abomination':
    "A giant burning sun with a face of pure fury, chained inside a vast prison of stone and law-runes built by Order. When the prison opens for a moment, a pillar of fire pours down onto the land. Blinding orange and white, black chains.",
  Thunderclap:
    'A herald of Order: a knight of storm clouds and lightning with a war-horn, shown falling in the First Divine War, its thunder breaking apart across a sky of gold. Storm grey, white lightning, gold.',

  Herobos:
    "The Hand of the Purifying Worm: a gaunt, armoured destroyer in pale bone plate, one enormous gauntleted hand raised, worms of white light pouring from its palm to devour a ruined world below. Contempt in its hollow eyes. Ash white, black, sickly green.",
  Yogg:
    'The Last King of Vultures: a decaying monarch on a throne of carrion and gold, a crown of black feathers, vultures perched on his shoulders and the broken spires of the Rosna Empire behind him. Rust, faded gold, grey sky.',
  Teliya:
    "The Lord of Compassion: a serene woman rising from a pyre, her body made of soft rose-red flame, arms open in an embrace that is both kind and consuming; robed priests kneel around the fire. Rose, ember orange, wine red.",
  Delaxierke:
    'The Sin of Desirelessness: a tall hunter in tattered crimson, faceless under a hood, stalking through a monastery of ascetics with a hook-bladed spear, the candles going out where he passes. Crimson, black, cold stone grey.',
  Lucia:
    "The Holy Voice of Birth: a gentle young midwife-saint in white and rose robes, a halo of soft dawn light, cradling a newborn glow in her hands; behind her, a white tower's hospital hall. Pearl white, dawn pink, warm gold.",
  'Fire of Hope':
    'The Fire of Hope: a small, steady flame held in cupped invisible hands, floating in an endless indigo dark, its warm light falling on a group of weary torchbearers below. Gold flame, deep indigo, soft warm glow.',

  // Places.
  'Faith Game world':
    'A modern city after the gods came: the world cut into floating shards by invisible air walls that shimmer like heat, rooftops and streets ending in sheer edges over a void, broken skyscrapers drifting at different heights. A lone survivor stands on a rooftop shard at dusk, a giant divine eye watching through the clouds. Overgrown concrete, red dusk, a strange golden sky.',
  'Continent of Hope':
    'A vast western-fantasy continent seen from a cliff: above ground, white towers of reason and great tribunal halls under a clear sky; below, through a gaping volcanic chasm, a glowing underworld of desire and disorder lit by lava. The Abyssal Volcano joins the two. Epic scale, golden light above, red glow below.',
  'Sea of Desire':
    'A still, endless sea of dark rose-red water under a low sky, warm mist rising from it. Shapes of drowned beauty move under the surface; a black tree of fear stands at its gate. Figures walk into it smiling. Wine red, rose and black.',
  'Divine Shade':
    "Prosperity's divine kingdom: an endless forest canopy so thick the light comes through green and gold, flowers the size of houses, roots like cathedrals, everything growing and choking at once. Beautiful and overwhelming. Emerald, gold pollen haze.",
  'Fishbone Hall':
    "Death's divine kingdom: a vast cathedral built from the spine and ribs of an impossibly large fish, its bones arching into a dark sky, pale soul-lanterns floating down the nave toward a Throne of Bones. Quiet and solemn. Bone white, deep blue, cold teal light.",
  Mausoleum:
    "Decay's divine kingdom: an endless necropolis of crumbling tombs and sarcophagi stretching to the horizon, moss and fungus over everything, a rotting giant's silhouette at the centre like a mountain. Dust, ash grey, sickly yellow light.",
  'Forest of Sighs':
    'A grey, leafless forest under constant fog, trees bent like weeping figures, a soft moaning wind; a hollow giant wanders far off between the trunks. Muted greens and greys, cold mist.',
  'Far Dusk Town':
    'A small fantasy town of crooked timber and stone houses at the edge of the world, lit by an endless sunset that never ends, long shadows on the cobbles, a quiet watchful air. Amber and violet dusk.',
  Montelani:
    'A colossal stone deathmatch arena and execution ground, tiers of jeering spectators, blood-stained sand, iron gallows and giant gates, banners snapping in the wind. Dust gold, iron grey, dried red.',
  'Tomb of Tainted Blood':
    'The final tomb of decayed blood: a sunken crypt flooded with black, half-dried blood, rotting coffins floating, red mould glowing faintly on the walls. Dark red, black and bone.',
  'Fog Gate':
    'A monumental ancient stone gate standing alone on a plain, its archway filled with a wall of thick, slowly swirling white fog that hides what lies beyond. Grey stone, white fog, faint blue light.',
  Rosna:
    'A nation of Decay: grand gothic cities slowly crumbling by choice, citizens proudly wearing rot and rust, cathedrals sinking into marsh, moths filling the sky. Rust, grey, faded purple.',
  'Sliced universes':
    'Countless versions of the same world stacked like panes of glass in an endless void, each pane showing a slightly different outcome of the same moment. Cosmic, cool blue and silver.',

  // Groups.
  Torchbearers:
    'A band of grim travellers in worn cloaks, each carrying a burning torch through a dark, ruined land, the last fires of civilisation. Firewood bundles on their backs, soot on their faces, determination in their eyes. Warm firelight against blue-black darkness.',
  'Society of the Mediocre':
    'A secret gathering of Clowns in a candlelit underground theatre: members in identical plain masks and dull grey coats, each with a small painted number, seated in a circle around an empty stage; one figure, No. 15, smiling under his mask. Sepia, candle gold, deep shadow.',
  'The Fated':
    "A small group of companions standing on a hill under a sky of fate-threads, a great die of light above them, their shadows tangled with glowing strings. Indigo night, silver and gold threads.",
  'Tower of Logic':
    'A colossal white tower of reason rising above a western-fantasy city, its sides covered in carved formulas and turning brass instruments, a crown of observatories at the top lit by cold blue light. Scholars in robes stream through its gates. Marble white, brass, clear sky.',
  'Council of Scholars':
    'A round chamber at the top of a white tower: learned chairs in high-backed seats around a glowing table of floating diagrams, ancient books and astrolabes, cold daylight through tall windows. Ivory, brass, blue.',
  'Grand Tribunal':
    'A gigantic courthouse cathedral of black and white stone, a vast set of scales hanging from its central dome, robed judges in tall seats looking down on a tiny accused figure; chains and law-runes carved on every pillar. Stark black, white and gold, shafts of hard light.',
  'Natural Alliance':
    'A loose gathering of forest villages and wild settlements linked by rope bridges and living trees, banners of many different clans side by side. Green, wood brown, soft light.',
  'Nature Cult':
    'A hidden grove where robed cultists with flower crowns dance barefoot around a great twisted tree; half the blossoms are healthy, half are rotting into something darker and more tempting. Smiling, too-serene faces. Deep green fading into wine red and shadow.',
  'Logic Association':
    'Ambitious scholars and players in sharp formal coats gathered openly under a great banner of a geometric eye, building a staircase of books and machines toward a god-shaped silhouette in the sky. Cold white light, black and silver.',
  'Afterglow Church':
    'A chaotic underground crowd in mismatched robes, gathering suddenly in a ruined plaza at sunset, smashing statues of order and scattering into the shadows before anyone can stop them. Fading orange afterglow, purple shadows.',
  'Extreme Desire Brotherhood':
    'An underground brotherhood in dark leather and rose-red masks, running glowing metal foundries deep below the earth, molten ore and red smoke, a sense of indulgence and greed. Red, copper and black.',
  'Agency Hand':
    'Hard-faced crews with picks, lanterns and wagons, plundering a vast underground cavern of glowing ores and crystals, hauling them up rope lifts to the surface. Lantern gold, cave blue, dark rock.',
  'Sanwu Tribe':
    'An ancient tribe in a primordial landscape, people in hides and bone ornaments gathered around a fertility totem at dawn; three paths lead away north, into a valley, and into a red ritual ground. Earth tones, dawn pink.',
  'Undead Salvation Society':
    'A solemn order in grey robes tending rows of the restless dead in a candlelit crypt, offering them comfort and rest. Grey, candle gold, pale blue spirits.',
  'Historical School':
    'Archivists and record-keepers in a vast hall of scrolls and stone tablets, carefully writing history while their own reflections in the ink look different. Sepia and amber.',
  'Worship-the-Gods Society':
    'A crowd of zealous players in white robes kneeling before sixteen colossal divine statues in a ruined modern square, offerings piled at their feet. White, gold, overcast light.',
  'Advent Faction':
    'Prophets and followers on a hilltop raising their arms toward a crack in the sky through which divine light and giant eyes are breaking through, welcoming the descent of the gods. Gold light, dark clouds.',
  'Tribunal of Evil Infants':
    'A disturbing dark courtroom where the judges are pale, cherub-faced infants in black robes and tiny gold crowns, seated high above the accused, their eyes old and cruel. Black, ivory and gold, candlelight.',
  Scavengers:
    'Masked raiders in scrap armour and gas masks, moving through a ruined city with hooks and blades, picking clean what others left behind. Rust, grey, dirty orange.',
  // People. Very little in the sources says how anyone looks: these are portraits imagined from each character's
  // role, path and class. Change any of them freely.
  'Cheng Shi':
    'A slender young man in a sharp black suit and waistcoat, dark hair swept back, pale elegant hands with silver rings pulling the strings of a puppet theatre of chess pieces, dice and masks. A charming, knowing half-smile; eyes that never quite tell the truth. A comedy mask and a die of fate float near him. Black, deep red and gold.',
  'Chen Chong': 'A broad-shouldered warrior of Order in battered white-and-steel plate, carrying a massive tower shield with a glowing surface, jaw set, standing in front of his team like a wall. Steel grey, white, gold light.',
  'Song Yawen': 'A lean young assassin of Death in a dark hooded jacket and light leathers, twin short blades, pale and alert, half-stepping into shadow and smoke as if about to vanish. Black, bone white, cold teal.',
  'Xia Wan': 'A focused hunter of Birth with a longbow, practical green-and-cream gear, hair tied back, a calm and protective gaze, small blossoms woven into the bowstring. Green, cream, soft gold.',
  'Cao Sansui': 'A thin, nervous-looking mage of Time in a long brown coat covered in pockets, a brass pocket watch on a chain, faint clock hands and sand glowing around his fingers. Bronze, grey, amber.',
  Nangong: 'A quiet priest with a dark high-collared shirt, a faint aura of decay turning into starlight around him, a torch on his back like the Torchbearers. Grey, indigo, ember light.',
  'Zhang Jizu': 'A cemetery keeper turned priest of Death: a lanky young man with permanently squinting, smiling eyes, a black mourning coat, a lantern and grave keys at his belt, a clown’s secret tucked behind his grin. Black, bone white, cold blue lanterns.',
  'Zhen Xin': 'A Bard of Deceit with a gentle, earnest face that hides another self, a worn coat dusted with snow, a lute held close; half their shadow wears a different expression. Snow white, violet, grey.',
  'Zhen Yi': 'The second self of Zhen Xin: the same face with a wild, mocking grin, a mage’s coat torn and chaotic, sparks of violet and green madness around the hands. Violet, sickly green, black.',
  'Hong Lin': 'A big, bald, good-natured warrior called Big Cat, broad as a door, a heavy blade on his shoulder, blossoms of Prosperity growing along his armour and fate-threads around his wrists. Emerald, gold, warm light.',
  'Hu Xuan': 'A warm, radiant mage of Birth, the Eternal Sun: a gentle smile, robes of cream and rose, a halo like a rising sun behind her, life-lights drifting from her open hands. Dawn gold, pearl, rose.',
  'An Mingyu': 'The Blind One: a young seer of Fate with a dark cloth bound over the eyes, star-points glowing faintly through it, a calm head tilted as if seeing everything. Indigo, silver stars.',
  'Li Jingming': 'A scholarly young man of Memory who broke his oath for Deceit: neat clothes, a cracked notebook, one half of his face lit by amber memory light and the other by violet. Sepia, violet.',
  'Hu Wei': 'The Grand Marshal: a commanding warrior in a black military greatcoat with red trim, medals and war banners behind him, eyes like embers. Black, crimson, smoke.',
  'Mo Li': 'The Chief Minister of Order: a composed figure in formal white-and-gold robes, a ledger of laws and a seal in hand, every hair in place. White, gold, marble.',
  'Chen Shu': 'A silent follower of Silence in plain grey monk-like clothes, hood up, finger near closed lips, watchful eyes. Grey, white fog.',
  'Lin Xi': 'A follower of Decay with a pale, tired beauty, grey hair, moths resting on her shoulders, her clothes slowly weathering like old wood. Ash grey, faded violet.',
  'Lao Deng': 'A young man of Time who goes by “old fogey”: a sly grin, an old-fashioned coat too big for him, a pocket watch and a cane he doesn’t need. Bronze, grey.',
  Duyao: 'Poison, Chosen of Corruption: a seductive, dangerous figure in dark red silk, a vial of glowing poison between the fingers, eyes half-lidded. Wine red, black, rose.',
  'Mo Shu': 'A pale, deathly calm follower of Annihilation in black, ash drifting off the edges of his coat, eyes empty like the void, who later becomes its god. Black, ash grey.',
  '0221': 'A Mage of Truth who is a slice that devoured its master: a cold, clinical figure in a lab coat over mage robes, a number tag 0221, eyes glowing with formulae, faint copies of itself behind it. White, cold blue.',
  'Cures Infertility': 'A former top Chosen of Birth hidden behind a ridiculous ID: a confident figure in rose and white robes, a mischievous smile, a halo of tiny cradles. Rose, cream.',
  'Fang Shiqing': 'A Bard of Truth and Torchbearer: a young woman with a determined gaze, a lute on her back, a bundle of firewood and a torch, a city wall behind her. Warm firelight, blue.',
  'Huang Bo': 'A Bard of Chaos with a wild grin and messy hair, a battered guitar, sparks of disorder around him. Purple, orange.',
  'Gou Feng': 'A Warrior of Birth, sturdy and earnest, a simple greatsword, cream-and-green armour.',
  'A Ming': 'An Assassin of Order in neat dark clothes with white trim, a slim blade held perfectly straight, disciplined and watchful.',
  Bailing: 'A beast-tamer Hunter of Deceit, with a pack of shadowy beasts at their side, by the shore of a red sea. Red, black, grey.',
  'Xu Lu': 'A Bard of Fate with a star-patterned cloak and a harp whose strings glow like fate-threads. Indigo, silver.',
  'Tao Yi': 'A Mage of Prosperity fused with Fate, robes overgrown with blossoms and threaded with silver fate-strings, a gentle, steady face. Emerald, silver.',
  'Su Yida': 'A Mage of Deceit with a sly smile and a mask held half over the face, violet mist around the hands.',
  'Cui Dingtian': 'A grizzled Warrior of Decay and Torchbearer, a scarred father with a rusted greatsword and a torch, steadfast. Rust, ember, grey.',
  'Cui Qiushi': 'A young Warrior of Order and city guardian, clean white armour and a spear, a serious face like their father’s. White, steel, gold.',
  'Gao Yu': 'A Mage of Truth of the Historical School, spectacles, armfuls of scrolls, ink-stained fingers. Sepia, white.',
  'Zhao Qian': 'A Warrior of War, loyal to the end, standing in front of Cheng Shi with a broken sword in a field of fire. Crimson, ember.',
  'Qin Chaoge': 'A Bard of War who fights like a warrior: a war-drum on the back, a spear in hand, a fierce singing grin. Crimson, gold.',
  'Ji Yue': 'A Mage of Truth turned to War, founder of the Undead Salvation Society: grey robes, a candle and a war-scarred hand. Grey, candle gold, red.',
  'Li Bola': 'A Hunter of Time with a crossbow and a brass scope, a precise, punctual manner. Bronze, grey.',
  'He Lu': 'A silent Warrior of Silence in grey armour, a two-handed sword, never speaking. Grey, white.',
  'Du Xiguang': 'A Mage of Memory with amber glowing fragments of memory orbiting an old book. Sepia, amber.',
  'Yun Ni': 'An Assassin of Annihilation, slim and dark, blades trailing ash. Black, ash grey.',
  'Wei Guan': 'A Hunter of Folly with a scornful look, an elegant bow, the air of someone sure everyone else is a fool. Ivory, faded gold.',
  'President Gong': 'The leader of the Society of the Mediocre: an unremarkable middle-aged man in a grey suit and a plain mask, seated at the head of a candlelit table of Clowns. Grey, candle gold.',
  'Qin Xin': 'A Hunter of Memory and founder of the Torchbearers, a quiet, resolute gaze, a bow and a torch; beside him a second self in War’s armour, cheerful and blazing. Amber, ember red.',
  'Long Jing': 'A show-off acrobat of Deceit and Time, balancing on a tightrope over a void, coat-tails flying, a clown’s grin, clock hands spinning around them. Violet, bronze.',
  'Wang Weijin': 'An Assassin of Truth fused with Deceit, a scientist’s coat over dark gear, a scalpel-like blade, a wry smile under a clown’s secret. White, violet.',
  'Xiao Qi': 'Cheng Shi’s childhood friend from the orphanage: a clever boy grown up, a hunter with a sly grin and a well-worn disguise kit, red of Corruption fading into Deceit’s violet. Red, violet.',
  'Wei Mu': 'The Chosen of Folly: a figure that has turned itself into a puppet, porcelain skin with joints, strings running up into a cloud of thoughts, scornful pale eyes. Ivory, faded gold.',
  Zayinjier: 'A mad scholar of the Tower of Logic: wild hair, cracked spectacles, robes covered in diagrams, holding a glowing star-dagger over an experiment. White, cold blue, gold.',
  'Lao Jia': 'A lucky gambler of the Fated: a rumpled jacket, a lottery ticket between two fingers, dice in the other hand, a crooked confident grin. Green felt, gold.',
  'Li Wufang': 'A Hunter of Order who becomes its god: plain clothes, a bow, an honest face, with a pillar of golden order rising behind. White, gold.',
  Chun: 'A quiet assassin and woodcarver, a small exquisite wooden figure in his hands, grief in his eyes, blossoms and rot both on his sleeves. Wood brown, green, grey.',
  'Meng Youfang': 'A Bard of Time who believes he is a forgotten god: a theatrical man speaking to his own reflection in a tall mirror, a crown he made himself. Bronze, mirror silver.',
  'Xie Yang': 'An Assassin of War and Torchbearer, Cheng Shi’s neighbour: a lean figure in a hoodie with molten-gold glowing blades. Gold, ember.',
  'An Jing': 'A quiet orphanage teacher of Silence and a Puppet Master: neat grey clothes, gentle eyes, fine strings from her fingers to silent puppets. Grey, soft white.',
  'Yan Chun': 'A Warrior of Folly with a blank, used stare, a test subject’s tag on the wrist, heavy armour. Ivory, grey.',
  'Bai Fei': 'A Hunter of Annihilation, called Little White Stripe, with a single white streak through dark hair, a bow of black wood. Black, white.',
  'Zhang Ruyu': 'A Bard of Corruption who loves pain: a flamboyant outfit, bandages worn like fashion, a lute, a blissful grin. Rose, wine red.',
  'Gongyang Jiao': 'A Warrior of Corruption in a disguise that hides what they really are, a cloak over hidden armour. Red, black.',
  'Da Yi': 'An Assassin of Chaos with a frustrated grimace, mismatched gear, mid “Darn it!”. Purple, orange.',
  'Qu Yan': 'A Hunter of Silence and Decay who sticks close behind Cheng Shi, half-hidden, a bow and grey moth-dusted cloak. Grey, yellow.',
  'Yu Mu': 'A follower of Decay, second on its ranking, weathered and patient, moss on the shoulders. Grey, moss green.',
  'Li Zhi': 'A Priest of Truth with a gentle face, white robes marked with experiment tags, a book of light. White, blue.',
  'Fang Yuan': 'A Mage of Order and founder of the Order Alliance, a formal white coat, a staff topped with a golden torch. White, gold.',
  'Ji Ran': 'A Warrior of Fate with a star-marked blade and a calm, doomed look. Indigo, silver.',
  // Added 2026-11-20 with the names from the Chinese text (imagined from role; the text barely describes looks).
  Peraya: 'A tall woman scholar in layered grey-and-gold robes of the Tower of Logic, hair pinned with brass instruments, cool appraising eyes, glass vials and diagrams floating around her. Cold blue light, brass, parchment.',
  'Sun Miao': 'A quiet young woman in dark travelling clothes who speaks by typing on a cracked glowing screen, her mouth pressed shut, a faint brand of Decay at her lips. Muted greens, screen glow.',
  Ais: 'A watchful young player in a hooded coat, light on her feet, a lantern at her belt, half her face in shadow in a stone corridor. Amber lantern light, deep shadow.',
  'Old Gallon': 'A weathered old man in patched robes kneeling at a broken teleportation circle, scooping yellow earth into its cracks, fear and hope in his tired eyes. Dusty ochre, faded runes.',
  'Dragon King': 'A broad, swaggering player in heavy scaled armour with a dragon-crest helm under his arm, a scar across his grin, ruins behind him. Bronze, storm grey.',
  'Dagger of the Stars': 'A vast sealed laboratory in the Tower of Logic shaped like a star-forged blade driven into the earth, its doors carved with constellations, a captive sun burning inside. Starlight, white-gold, black stone.',
};

/** The art style added to every picture prompt for this book. */
export const FOOLISH_GAME_STYLE =
  'Dark high-fantasy painting in the spirit of Elden Ring: vast ruined grandeur, colossal scale with tiny figures for size, painterly brushwork, hazy golden and ashen light, muted earthy colours with one strong accent, melancholy and awe, highly detailed, cinematic wide composition, no text.';
