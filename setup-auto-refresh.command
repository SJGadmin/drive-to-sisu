#!/bin/bash

# Navigate to the project directory
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========================================"
echo "  Setup Automatic Cache Refresh"
echo "========================================"
echo ""
echo "This will set up automatic cache refresh at 6:00 AM daily."
echo ""
echo "Project directory: $PROJECT_DIR"
echo ""
echo "Press Ctrl+C to cancel, or press Enter to continue..."
read

# Create the Launch Agent plist file
PLIST_FILE="$HOME/Library/LaunchAgents/com.sisu.cache-refresh.plist"

echo "Creating Launch Agent configuration..."

cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.sisu.cache-refresh</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>${PROJECT_DIR}/scripts/refresh-cache.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>6</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>${PROJECT_DIR}/logs/cache-refresh.log</string>

    <key>StandardErrorPath</key>
    <string>${PROJECT_DIR}/logs/cache-refresh-error.log</string>

    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"

# Find the correct node path
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo ""
    echo "⚠️  Warning: Could not find node installation."
    echo "Please install Node.js from https://nodejs.org"
    echo ""
    echo "Press Enter to close this window..."
    read
    exit 1
fi

# Update the plist file with the correct node path
sed -i '' "s|/usr/local/bin/node|$NODE_PATH|g" "$PLIST_FILE"

# Load the Launch Agent
echo "Loading Launch Agent..."
launchctl unload "$PLIST_FILE" 2>/dev/null
launchctl load "$PLIST_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Success! Automatic cache refresh is now set up."
    echo ""
    echo "Details:"
    echo "  - Runs every day at 6:00 AM"
    echo "  - Logs saved to: ${PROJECT_DIR}/logs/"
    echo "  - Configuration: ${PLIST_FILE}"
    echo ""
    echo "To disable automatic refresh, run:"
    echo "  launchctl unload ${PLIST_FILE}"
    echo ""
else
    echo ""
    echo "❌ Error: Failed to load Launch Agent."
    echo "You may need to grant permissions in System Preferences > Security & Privacy."
    echo ""
fi

echo "========================================"
echo "Press Enter to close this window..."
read
