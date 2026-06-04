#!/usr/bin/env bash
# Prints a crontab line for local daily posting.
# Usage: ./scripts/install-cron.sh

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || echo "/usr/local/bin/node")"
NPM="$(command -v npm || echo "/usr/local/bin/npm")"
HOUR="${COGNIPOST_HOUR:-9}"
MINUTE="${COGNIPOST_MINUTE:-0}"

mkdir -p "$PROJECT_DIR/logs"

echo "# Add this line to your crontab (crontab -e):"
echo ""
echo "$MINUTE $HOUR * * * cd $PROJECT_DIR && $NPM run build && $NPM run post >> $PROJECT_DIR/logs/cron.log 2>&1"
echo ""
echo "# Tips:"
echo "# - Set COGNIPOST_HOUR=9 (default) to match schedule.preferredHourLocal in config"
echo "# - Ensure .env exists with X and LLM credentials"
echo "# - Test first: cd $PROJECT_DIR && npm run dry-run"
