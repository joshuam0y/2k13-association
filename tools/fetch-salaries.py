#!/usr/bin/env python3
# Downloads each player's real salary history from Basketball-Reference (one page per player, every 3.5 s) for the
# players on the data/era-YYYY.js rosters of 1990 to 2003, newest seasons first, into tools/salary-cache.json:
#   { "garneke01": [["1995-96", "MIN", 1622000], ...], ... }   (no rows: a player BR lists no salaries for)
# Safe to stop and start again: it resumes from the cache. Used by tools/build-start.js for real contracts.
import json, os, re, subprocess, sys, time
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CACHE = os.path.join(ROOT, 'tools', 'salary-cache.json')
ACACHE = os.path.join(ROOT, 'tools', 'awards-cache.json')
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
acache = json.load(open(ACACHE)) if os.path.exists(ACACHE) else {}   # { id: [[season-ending year, 'MVP-1,AS,NBA1'], ...] }
ids, seen = [], set()
YEARS = [int(a) for a in sys.argv[1:]] or list(range(2003, 1989, -1))   # e.g. python3 tools/fetch-salaries.py 2003
for y in YEARS:
    s = open(os.path.join(ROOT, 'data', 'era-%d.js' % y), encoding='utf8').read()
    for m in re.finditer(r'\["([a-z]+[0-9]{2})","[^"]*","[A-Za-z]{2,3}","[A-Za-z/-]*",\d+,\d+,\d+,(\d+)', s):
        if m.group(1) not in seen:
            seen.add(m.group(1)); ids.append((int(m.group(2)), m.group(1)))
ids = [i for _, i in sorted(set(ids), key=lambda x: (-x[0], x[1]))]   # the best players first, so a partial run still covers the stars
todo = [i for i in ids if i not in cache or i not in acache]
print('players', len(ids), 'to fetch', len(todo), flush=True)
ROW = re.compile(r'data-stat="season"[^>]*>(\d{4}-\d{2})</th>.*?href="/teams/([A-Z]{3})/.*?data-stat="salary" csk="(\d+)"', re.S)
def fetch(pid):
    url = 'https://www.basketball-reference.com/players/%s/%s.html' % (pid[0], pid)
    for attempt in range(4):
        r = subprocess.run(['curl', '-sL', '-m', '40', '-A', 'Mozilla/5.0', '-w', '\n%{http_code}', url], capture_output=True)
        body, code = r.stdout.decode('utf8', 'ignore').rsplit('\n', 1)
        if code == '200': return body
        if code == '404': return ''
        time.sleep(60 * (attempt + 1))
    return None
done = 0
for pid in todo:
    body = fetch(pid)
    if body is None:
        print('gave up on', pid, flush=True); continue
    rows = []
    i = body.find('id="all_salaries"')
    if i >= 0:
        seg = body[i:i + 40000]
        j, k = seg.find('<tbody>'), seg.find('</tbody>')
        for tr in seg[j:k].split('</tr>'):
            m = ROW.search(tr)
            if m: rows.append([m.group(1), m.group(2), int(m.group(3))])
    cache[pid] = rows
    arows = []
    for m in re.finditer(r'<tr id="per_game_stats\.(\d{4})"(.*?)</tr>', body, re.S):
        a = re.search(r'data-stat="awards"[^>]*>(.*?)</td>', m.group(2), re.S)
        t = re.sub(r'<[^>]+>', '', a.group(1)).strip() if a else ''
        if t: arows.append([int(m.group(1)), t])
    acache[pid] = arows
    done += 1
    if done % 10 == 0:
        json.dump(cache, open(CACHE, 'w'), separators=(',', ':')); json.dump(acache, open(ACACHE, 'w'), separators=(',', ':')); print(done, '/', len(todo), pid, len(rows), flush=True)
    time.sleep(3.1)
json.dump(cache, open(CACHE, 'w'), separators=(',', ':'))
json.dump(acache, open(ACACHE, 'w'), separators=(',', ':'))
print('done', len(cache), flush=True)
