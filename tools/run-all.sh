#!/bin/bash
# Runs every node test in tools/ and the full-season integration run. Prints only failures and a total.
#   bash tools/run-all.sh
cd "$(dirname "$0")/.." || exit 1
pass=0; fail=0; failed=()
for f in tools/test-*.js tools/integration.js tools/engine-test.js; do
  out=$(node "$f" 2>&1); code=$?
  last=$(echo "$out" | tail -1 | cut -c1-100)
  if [ $code -eq 0 ]; then pass=$((pass+1)); else fail=$((fail+1)); failed+=("$f"); echo "FAIL $f (exit $code) | $last"; fi
done
for f in js/*.js sw.js; do
  node -e "new Function(require('fs').readFileSync('$f','utf8'))" 2>/dev/null || { fail=$((fail+1)); failed+=("$f"); echo "FAIL syntax $f"; }
done
echo "scripts ok: $pass | failed: $fail"
[ $fail -eq 0 ]
