# Starting Five

Vanilla JS basketball draft and sim site (no build step). GitHub Pages deploys on every push to `main`.

## Rules
- Push straight to `main`; keep changes small and fast.
- Bump the service worker cache in `sw.js` (`var CACHE = '2k13-vNNN'`) on EVERY push, or phones keep the old copy. The version shown on the menu is that number / 100.
- No em dashes or en dashes anywhere: code, UI text, commit messages, replies. Use "|", commas or periods.
- Less words, more meaningful words in the UI.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Quick syntax check before pushing: `node -e "new Function(require('fs').readFileSync('js/FILE.js','utf8'))"`.

## Map
- `js/ui-ranked.js`: ranked, tiers, daily auction, themes, profiles, share (text + link copied, no picture).
- `js/ui-versus.js`: Head to Head, ranked lobby, rejoin, forfeit.
- `js/ui-hub.js`: main menu tiles. `js/ui.js`: top bar and MENU dropdown.
- `js/challenge.js`: auction engine. `css/ui-challenge.css`: most UI CSS.
- `supabase/community.sql`: whole backend (safe to run twice). After changing it, the owner pastes it into the Supabase SQL editor and runs it.

## Daily
- The daily day turns over at midnight Pacific. Daily #1 is 2026-11-12 (`DAILY_START`).
- Today's theme stays hidden in the practice archive until tomorrow.
