"""JMdict_e.gz -> two gzipped JSON dictionaries in the app's shape {word: [reading, "line per sense"]}:
core (common words, loaded first) and more (everything else that is not archaic or obscure, loaded only on a miss)."""
import gzip, json, re, sys
import xml.etree.ElementTree as ET

src, core_out, more_out = sys.argv[1], sys.argv[2], sys.argv[3]
raw = gzip.open(src, 'rt', encoding='utf-8').read()
raw = re.sub(r'<!DOCTYPE.*?\]>', '', raw, flags=re.S)
raw = re.sub(r'&([a-zA-Z0-9_-]+);', lambda m: m.group(0) if m.group(1) in {'amp', 'lt', 'gt', 'quot', 'apos'} else m.group(1), raw)
root = ET.fromstring(raw)

POS = [('adj-i', 'adjective'), ('adj-na', 'na-adjective'), ('adj-no', 'no-adjective'), ('adv', 'adverb'), ('n', 'noun'),
       ('exp', 'expression'), ('prt', 'particle'), ('int', 'interjection'), ('pn', 'pronoun'), ('ctr', 'counter'),
       ('suf', 'suffix'), ('pref', 'prefix'), ('conj', 'conjunction')]
def pos_name(tags):
    for t in tags:
        if re.match(r'v[15kszi]|vs', t): return 'verb'
        for p, name in POS:
            if t == p or t.startswith(p + '-'): return name
    return ''

core, more = {}, {}
for e in root.iter('entry'):
    kebs = [k.findtext('keb') for k in e.findall('k_ele') if k.findtext('keb')]
    rebs = [r.findtext('reb') for r in e.findall('r_ele') if r.findtext('reb')]
    if not rebs: continue
    common = any(x.text for x in e.iter() if x.tag in ('ke_pri', 're_pri'))
    misc = {m.text for m in e.iter('misc')}
    if not common and misc & {'arch', 'obs', 'obsc', 'rare'}: continue
    lines, last = [], ''
    for s in e.findall('sense')[:3]:
        pos = pos_name([p.text for p in s.findall('pos')]) or last
        last = pos
        gl = [g.text for g in s.findall('gloss') if g.text][:3]
        if gl: lines.append((f'({pos}) ' if pos else '') + '; '.join(gl))
    if not lines: continue
    text = '\n'.join(lines)
    target = core if common else more
    # Kana spellings are keys for common words and for words written only in kana; rare kanji words by kanji only.
    keys = kebs + (rebs if common or not kebs else [])
    for w in keys:
        reading = '' if w in rebs else rebs[0]
        if w in target:
            if text not in target[w][1] and len(target[w][1]) < 300: target[w][1] += '\n' + text
        else:
            target[w] = [reading, text]

for d, out in ((core, core_out), (more, more_out)):
    for w in d: d[w][1] = d[w][1][:400]
    with gzip.open(out, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
print('core', len(core), 'more', len(more))
