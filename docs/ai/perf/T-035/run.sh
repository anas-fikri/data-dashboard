#!/bin/sh
# Jalankan Playwright dengan browser di folder scratch. Argumen diteruskan apa adanya.
cd "$(dirname "$0")" || exit 1
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.pw-browsers"
npx playwright test "$@" 2>&1 | grep -E "✓|✘|passed|failed|skipped|Error:|Expected|Received" | grep -v "^\s*at "
