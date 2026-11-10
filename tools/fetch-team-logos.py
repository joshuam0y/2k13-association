#!/usr/bin/env python3
# Finds a logo for every older team identity (city + name, 1947 to 2003) on Wikipedia by exact file name ("Seattle SuperSonics logo.svg"),
# downloads a 128 px copy into assets/logos/hist/ and writes data/team-logos.js: window.TEAM_LOGOS = { "Seattle SuperSonics": "assets/logos/hist/....png" }.
# Anything it cannot match exactly is left out (the franchise fallback or the letter badge shows instead).
import json, os, re, subprocess, sys, time, urllib.parse
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ids = {}
for y in range(1947, 2004):
    s = open(os.path.join(ROOT, 'data', 'era-%d.js' % y), encoding='utf8').read()
    for m in re.finditer(r'\{"abbr":"([A-Z]+)","city":"([^"]+)","name":"([^"]+)","conf".*?"logo":(null|"[^"]*")', s):
        if m.group(4) == 'null': ids[(m.group(2) + ' ' + m.group(3))] = m.group(1)
print(len(ids), 'identities', flush=True)
UA = 'StartingFiveBot/1.0 (personal basketball sim; logos for old teams)'
def api(params):
    for attempt in range(8):
        r = subprocess.run(['curl', '-sL', '-m', '40', '-A', UA, '-G', 'https://en.wikipedia.org/w/api.php', '--data-urlencode', 'format=json'] + sum([['--data-urlencode', '%s=%s' % kv] for kv in params.items()], []), capture_output=True)
        try: return json.loads(r.stdout.decode('utf8', 'ignore'))
        except ValueError: time.sleep(90 * (attempt + 1))   # rate limited: wait longer each time
    return {}
EXTS = ['svg', 'png', 'gif', 'jpg']
def cands(n): return ['%s logo.%s' % (n, e) for e in EXTS] + ['%s.%s' % (n, e) for e in EXTS] + ['%s logo (alternate).%s' % (n, e) for e in EXTS[:2]]
found = {}
names = sorted(ids)
for k in range(0, len(names), 4):
    chunk = names[k:k + 4]
    titles = ['File:' + c for n in chunk for c in cands(n)]
    d = api({'action': 'query', 'titles': '|'.join(titles), 'prop': 'imageinfo', 'iiprop': 'url', 'redirects': '1'})
    ok = {}
    for p in (d.get('query') or {}).get('pages', {}).values():
        if 'imageinfo' in p: ok[p['title'].replace('_', ' ')] = True
    for n in chunk:
        for c in cands(n):
            if ('File:' + c) in ok: found[n] = c; break
    time.sleep(4)
print(len(found), 'matched', flush=True)
out = {}
for n, f in found.items():
    slug = re.sub(r'[^a-z0-9]+', '-', n.lower()).strip('-')
    dest = os.path.join(ROOT, 'assets', 'logos', 'hist', slug + '.png')
    url = 'https://en.wikipedia.org/wiki/Special:FilePath/' + urllib.parse.quote(f.replace(' ', '_')) + '?width=128'
    r = subprocess.run(['curl', '-sL', '-m', '40', '-A', UA, '-o', dest, '-w', '%{http_code} %{content_type}', url], capture_output=True)
    st = r.stdout.decode()
    if st.startswith('200') and 'image' in st and os.path.getsize(dest) > 400:
        out[n] = 'assets/logos/hist/' + slug + '.png'
    else:
        try: os.remove(dest)
        except OSError: pass
    time.sleep(3)
open(os.path.join(ROOT, 'data', 'team-logos.js'), 'w').write('/* Logos for older team identities (city + name), downloaded by tools/fetch-team-logos.py. */\nwindow.TEAM_LOGOS = ' + json.dumps(out, indent=0) + ';\n')
missing = [n for n in names if n not in out]
print(len(out), 'logos saved; missing:', ', '.join(missing), flush=True)
