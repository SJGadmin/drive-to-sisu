import { google } from 'googleapis';
import { Base64 } from 'js-base64';
import clientCache from '../../utils/client-cache.js';

/**
 * Next.js API Route: Cache Refresh
 * Rebuilds the email-to-folder cache for fast single client lookups
 *
 * Can be called manually or via cron job
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    console.log('Starting cache refresh...');

    // Authenticate with Google Drive
    const drive = await authenticateGoogleDrive();
    const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;

    if (!driveId) {
      throw new Error('GOOGLE_SHARED_DRIVE_ID environment variable not set');
    }

    // Refresh the cache
    const stats = await clientCache.refresh(
      drive,
      driveId,
      (current, total, email) => {
        if (current % 10 === 0 || current === total) {
          console.log(`Progress: ${current}/${total} folders processed`);
        }
      }
    );

    return res.status(200).json({
      message: 'Cache refresh completed',
      stats,
    });

  } catch (error) {
    console.error('Error refreshing cache:', error);
    return res.status(500).json({
      error: 'Failed to refresh cache',
      details: error.message,
    });
  }
}

/**
 * Authenticates with Google Drive using service account credentials
 */
async function authenticateGoogleDrive() {
  const credentialsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;

  if (!credentialsBase64) {
    throw new Error('GOOGLE_CREDENTIALS_BASE64 environment variable not set');
  }

  const credentialsJson = Base64.decode(credentialsBase64);
  const credentials = JSON.parse(credentialsJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const authClient = await auth.getClient();
  return google.drive({ version: 'v3', auth: authClient });
}

// Allow long execution time for cache refresh
export const config = {
  maxDuration: 300, // 5 minutes
};
