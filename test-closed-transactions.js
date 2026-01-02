/**
 * Test script to verify if SISU API returns closed transactions
 *
 * Usage: node test-closed-transactions.js <email-address>
 *
 * This script will:
 * 1. Search for a client by email using SISU API
 * 2. Display all transactions returned (with their status codes)
 * 3. Help determine if closed transactions are accessible
 */

require('dotenv').config();
const axios = require('axios');

const SISU_BASE_URL = 'https://api.sisu.co';
const SISU_CLIENT_ID = process.env.SISU_CLIENT_ID;
const SISU_CLIENT_SECRET = process.env.SISU_CLIENT_SECRET;

async function testClosedTransactions(email) {
  console.log('\n=== Testing SISU API Closed Transaction Support ===\n');
  console.log(`Searching for email: ${email}\n`);

  try {
    // Step 1: Find client by email
    console.log('Step 1: Calling /client/find-client endpoint...');
    const response = await axios.post(
      `${SISU_BASE_URL}/client/find-client`,
      { email },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        auth: {
          username: SISU_CLIENT_ID,
          password: SISU_CLIENT_SECRET,
        },
      }
    );

    const clients = response.data;
    console.log(`✓ API returned ${clients.length} transaction(s)\n`);

    if (clients.length === 0) {
      console.log('No transactions found for this email.');
      console.log('\nPossible reasons:');
      console.log('  - Email not in SISU system');
      console.log('  - API filters out all transactions (including closed ones)');
      console.log('  - Typo in email address\n');
      return;
    }

    // Step 2: Analyze each transaction
    console.log('Transaction Details:\n');
    console.log('─'.repeat(80));

    const statusCounts = {};

    clients.forEach((client, index) => {
      const statusCode = client.status_code || 'unknown';
      const statusName = client.status_name || 'Unknown Status';
      const address = client.address_1 || 'N/A';
      const clientId = client.client_id;
      const role = client.type_id === 'b' ? 'Buyer' : client.type_id === 's' ? 'Seller' : 'Unknown';

      console.log(`Transaction ${index + 1}:`);
      console.log(`  Client ID:      ${clientId}`);
      console.log(`  Property:       ${address}`);
      console.log(`  Role:           ${role}`);
      console.log(`  Status Code:    ${statusCode}`);
      console.log(`  Status Name:    ${statusName}`);
      console.log('─'.repeat(80));

      statusCounts[statusName] = (statusCounts[statusName] || 0) + 1;
    });

    // Step 3: Summary
    console.log('\nSummary:');
    console.log(`  Total Transactions: ${clients.length}`);
    console.log('  Status Breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`    - ${status}: ${count}`);
    });

    // Step 4: Determine if closed transactions are present
    console.log('\n=== Analysis ===\n');

    const hasNonPending = clients.some(c => {
      const statusName = (c.status_name || '').toLowerCase();
      return !statusName.includes('pending') &&
             !statusName.includes('active') &&
             statusName !== 'unknown status';
    });

    if (hasNonPending) {
      console.log('✓ GOOD NEWS: API returns closed/completed transactions!');
      console.log('  Your application should be able to upload documents to these transactions.');
    } else {
      console.log('⚠ API appears to only return pending/active transactions.');
      console.log('  You may need to:');
      console.log('    1. Contact SISU support to enable closed transaction access');
      console.log('    2. Use a different API endpoint');
      console.log('    3. Request elevated API permissions');
    }

    // Step 5: Test upload possibility (without actually uploading)
    console.log('\n=== Upload Test (Simulation) ===\n');
    console.log('To test if uploads work for closed transactions:');
    console.log('  1. Choose a transaction from above');
    console.log('  2. Use test-single-upload.js with that client_id');
    console.log(`  3. Example: node test-single-upload.js ${clients[0]?.client_id} path/to/test.pdf\n`);

  } catch (error) {
    console.error('\n✗ Error testing SISU API:');
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Message: ${error.response.data?.message || error.response.statusText}`);
      console.error(`  Data:`, error.response.data);
    } else {
      console.error(`  ${error.message}`);
    }
    console.log('\nPlease check:');
    console.log('  - SISU_CLIENT_ID and SISU_CLIENT_SECRET in .env file');
    console.log('  - Internet connection');
    console.log('  - Email address is correct\n');
  }
}

// Main execution
const email = process.argv[2];

if (!email) {
  console.error('\nUsage: node test-closed-transactions.js <email-address>');
  console.error('Example: node test-closed-transactions.js client@example.com\n');
  process.exit(1);
}

if (!SISU_CLIENT_ID || !SISU_CLIENT_SECRET) {
  console.error('\n✗ Error: Missing SISU credentials');
  console.error('Please ensure SISU_CLIENT_ID and SISU_CLIENT_SECRET are set in .env file\n');
  process.exit(1);
}

testClosedTransactions(email);
