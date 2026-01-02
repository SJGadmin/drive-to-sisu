#!/bin/bash

# Navigate to the project directory
cd "$(dirname "$0")"

echo "========================================"
echo "  Test SISU Closed Transactions"
echo "========================================"
echo ""
echo "This will check if your SISU API returns closed transactions."
echo ""
echo -n "Enter a client email address: "
read email

if [ -z "$email" ]; then
  echo ""
  echo "Error: No email address provided."
  echo "Press Enter to close this window..."
  read
  exit 1
fi

echo ""
echo "Testing SISU API with email: $email"
echo ""

# Run the test script
node test-closed-transactions.js "$email"

echo ""
echo "========================================"
echo "Press Enter to close this window..."
read
