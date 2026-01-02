#!/bin/bash

# Navigate to the project directory
cd "$(dirname "$0")"

echo "========================================"
echo "  Test Single Client Upload"
echo "========================================"
echo ""
echo "This will test uploading documents for a single client."
echo ""
echo -n "Enter client email address: "
read email

if [ -z "$email" ]; then
  echo ""
  echo "Error: No email address provided."
  echo "Press Enter to close this window..."
  read
  exit 1
fi

echo ""
echo "Testing upload for: $email"
echo ""

# Run the test script
node test-single-upload.js "$email"

echo ""
echo "========================================"
echo "Press Enter to close this window..."
read
