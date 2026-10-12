#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "$0")"

if [[ "${1:-}" == *.json ]]; then
  RESULT_FILE="$1"
  shift
else
  RESULT_FILE="result.json"
fi

SUMMARY_FILE="/tmp/promo-page-load-test-summary.json"

rm -f "$SUMMARY_FILE"

set +e
k6 run promo-page-load-test.js --summary-export="$SUMMARY_FILE" "$@"
EXIT_CODE=$?
set -e

python3 - "$RESULT_FILE" "$SUMMARY_FILE" "$EXIT_CODE" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

result_path, summary_path, exit_code = sys.argv[1], sys.argv[2], int(sys.argv[3])

history = []
if os.path.exists(result_path) and os.path.getsize(result_path) > 0:
    try:
        with open(result_path, 'r', encoding='utf-8') as fh:
            history = json.load(fh)
        if not isinstance(history, list):
            history = []
    except Exception:
        history = []

summary = {}
if os.path.exists(summary_path) and os.path.getsize(summary_path) > 0:
    try:
        with open(summary_path, 'r', encoding='utf-8') as fh:
            summary = json.load(fh)
    except Exception:
        summary = {}

entry = {
    "timestamp": datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    "exit_code": exit_code,
    "status": "success" if exit_code == 0 else "failed",
    "summary": summary,
}

history.append(entry)

with open(result_path, 'w', encoding='utf-8') as fh:
    json.dump(history, fh, ensure_ascii=False, indent=2)
    fh.write('\n')
PY

exit "$EXIT_CODE"
