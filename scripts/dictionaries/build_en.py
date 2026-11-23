"""WordNet 3.0 (dict/ folder) + phonetics from the app's previous English file -> two gzipped JSON files of
{word: [pron, "(pos) definition"]}: common words (en) and the rest (en-more). Irregular forms from the .exc lists point to their base word as {"ran": ["=run", ""]}."""
import gzip, json, re, sys, os
wn, old_en, out, more_out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
POS = [('noun', 'n'), ('verb', 'v'), ('adj', 'a'), ('adv', 'r')]
LABEL = {'noun': 'noun', 'verb': 'verb', 'adj': 'adjective', 'adv': 'adverb'}

def definitions(pos):
    defs = {}
    with open(os.path.join(wn, f'data.{pos}'), encoding='latin-1') as f:
        for line in f:
            if line.startswith('  '): continue
            off, _, gloss = line.partition(' | ')
            # The definition only: examples start with a quotation mark.
            d = re.split(r';\s*"', gloss.strip(), maxsplit=1)[0].strip().rstrip(';').strip()
            defs[off.split(' ', 1)[0]] = d
    return defs

words = {}   # lemma -> list of (tagged count, pos, [definitions])
for pos, _ in POS:
    defs = definitions(pos)
    with open(os.path.join(wn, f'index.{pos}'), encoding='latin-1') as f:
        for line in f:
            if line.startswith('  '): continue
            parts = line.split()
            lemma = parts[0].replace('_', ' ')
            if len(lemma.split()) > 3: continue
            synset_cnt, p_cnt = int(parts[2]), int(parts[3])
            tagged = int(parts[5 + p_cnt])
            offsets = parts[6 + p_cnt:6 + p_cnt + synset_cnt]
            ds = [defs[o] for o in offsets[:2] if o in defs and defs[o]]
            if ds: words.setdefault(lemma, []).append((tagged, pos, ds))

old = json.load(gzip.open(old_en, 'rt', encoding='utf-8'))
d = {}
for lemma, items in words.items():
    items.sort(key=lambda x: -x[0])
    lines = []
    for _, pos, ds in items:
        for x in ds:
            if len(lines) < 3: lines.append(f'({LABEL[pos]}) {x if len(x) <= 140 else x[:137].rsplit(" ", 1)[0] + "…"}')
    pron = old.get(lemma, [''])[0] if lemma in old else ''
    d[lemma] = [pron, '\n'.join(lines)]

for pos, _ in POS:
    with open(os.path.join(wn, f'{pos}.exc'), encoding='latin-1') as f:
        for line in f:
            form, *bases = line.split()
            form = form.replace('_', ' ')
            base = bases[0].replace('_', ' ') if bases else ''
            if form not in d and base in d: d[form] = ['=' + base, '']

# Common words (those the earlier, shorter English file had) load first; the rest only on a miss.
core = {k: v for k, v in d.items() if k in old or (v[0].startswith('=') and v[0][1:] in old)}
more = {k: v for k, v in d.items() if k not in core}
for data, path in ((core, out), (more, more_out)):
    with gzip.open(path, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print('lemmas', len(words), 'core', len(core), 'more', len(more))
