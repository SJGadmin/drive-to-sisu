/**
 * CLI Script: Refresh Client Cache
 *
 * Usage: node scripts/refresh-cache.js
 *
 * This script builds the in-memory email-to-folder cache for fast lookups.
 * Run this periodically (e.g., daily via cron) or whenever new clients are added.
 */

require('dotenv').config();
const { google } = require('googleapis');
const clientCache = require('../utils/client-cache.js');

async function main() {
  console.log('=== Client Cache Refresh ===\n');

  try {
    // Authenticate with Google Drive
    console.log('Step 1: Authenticating with Google Drive...');
    const credentialsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;

    if (!credentialsBase64) {
      throw new Error('GOOGLE_CREDENTIALS_BASE64 environment variable not set');
    }

    const credentialsJson = Buffer.from(credentialsBase64, 'base64').toString('utf-8');
    const credentials = JSON.parse(credentialsJson);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const authClient = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient });
    console.log('✓ Authenticated\n');

    // Get shared drive ID
    const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;

    if (!driveId) {
      throw new Error('GOOGLE_SHARED_DRIVE_ID environment variable not set');
    }

    console.log('Step 2: Building cache from Google Drive...');
    console.log(`Shared Drive ID: ${driveId}\n`);

    // Refresh cache with progress callback
    const stats = await clientCache.refresh(
      drive,
      driveId,
      (current, total, email) => {
        if (email) {
          console.log(`  [${current}/${total}] Cached: ${email}`);
        } else if (current % 10 === 0) {
          console.log(`  Progress: ${current}/${total} folders processed`);
        }
      }
    );

    // Display results
    console.log('\n=== Cache Refresh Complete ===\n');
    console.log(`Total folders scanned:  ${stats.totalFolders}`);
    console.log(`Successfully cached:    ${stats.successCount} clients`);
    console.log(`Errors:                 ${stats.errorCount}`);
    console.log(`Cache size:             ${stats.cacheSize} entries`);
    console.log(`Duration:               ${stats.durationSeconds}s`);

    console.log('\n✓ Cache is ready for fast lookups!');
    console.log('\nCache Statistics:');
    const cacheStats = clientCache.getStats();
    console.log(`  Size: ${cacheStats.size} clients`);
    console.log(`  Last refresh: ${new Date(cacheStats.lastRefreshTime).toISOString()}`);

  } catch (error) {
    console.error('\n✗ Cache refresh failed:');
    console.error(`  ${error.message}`);
    console.error('\nPlease check:');
    console.error('  - GOOGLE_CREDENTIALS_BASE64 is set in .env file');
    console.error('  - GOOGLE_SHARED_DRIVE_ID is set in .env file');
    console.error('  - Service account has access to the shared drive');
    process.exit(1);
  }
}

main();
