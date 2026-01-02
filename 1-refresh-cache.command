#!/bin/bash

# Navigate to the project directory
cd "$(dirname "$0")"

echo "========================================"
echo "  SISU Cache Refresh Tool"
echo "========================================"
echo ""
echo "This will build the cache for faster lookups."
echo "Press Ctrl+C to cancel, or press Enter to continue..."
read

# Run the cache refresh script
node scripts/refresh-cache.js

echo ""
echo "========================================"
echo "Press Enter to close this window..."
read
