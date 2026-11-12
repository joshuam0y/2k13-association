#!/usr/bin/env python3
# Downloads the real NBA draft lists (Basketball-Reference draft/NBA_YYYY.html): every pick, so classes include the players
# who never played in the NBA or arrived years later. -> tools/draft-cache.json
#   { "2003": [[pick, "CLE", "jamesle01" or null, "LeBron James", "college"], ...] }
import json, os, re, subprocess, sys, time
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'tools', 'draft-cache.json')
cache = json.load(open(OUT)) if os.path.exists(OUT) else {}
years = [int(a) for a in sys.argv[1:]] or list(range(2003, 1976, -1))
def get(url):
    for attempt in range(4):
        r = subprocess.run(['curl', '-sL', '-m', '40', '-A', 'Mozilla/5.0', '-w', '\n%{http_code}', url], capture_output=True)
        body, code = r.stdout.decode('utf8', 'ignore').rsplit('\n', 1)
        if code == '200': return body
        time.sleep(60 * (attempt + 1))
    return None
for y in years:
    if str(y) in cache: continue
    body = get('https://www.basketball-reference.com/draft/%s_%d.html' % ('BAA' if y <= 1949 else 'NBA', y))
    if not body: print('gave up', y, flush=True); continue
    i = body.find('id="stats"')
    seg = body[i:]
    rows = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', seg, re.S):
        pk = re.search(r'data-stat="pick_overall"[^>]*>(?:<a[^>]*>)?(\d+)', tr) or re.search(r'data-stat="ranker"[^>]*>(\d+)', tr)   # the early drafts leave late picks without a number: use the order on the page
        if not pk: continue
        tm = re.search(r'data-stat="team_id"[^>]*>(?:<a[^>]*>)?([A-Z]{3})', tr)
        pl = re.search(r"data-stat=\"player\"[^>]*>(?:<a href='/players/[a-z]/([a-z]+[0-9]{2})\.html'>)?([^<]+)", tr)
        co = re.search(r'data-stat="college_name"[^>]*>(?:<a[^>]*>)?([^<]*)', tr)
        rows.append([int(pk.group(1)), tm.group(1) if tm else '', pl.group(1) if pl and pl.group(1) else None, pl.group(2).strip() if pl else '', co.group(1).strip() if co else ''])
    cache[str(y)] = rows
    json.dump(cache, open(OUT, 'w'), separators=(',', ':'))
    print(y, len(rows), rows[:2], flush=True)
    time.sleep(5)
print('done', flush=True)
