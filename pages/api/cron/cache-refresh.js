import { google } from 'googleapis';
import { Base64 } from 'js-base64';
import clientCache from '../../../utils/client-cache.js';

/**
 * Cron Job API Route: Automatic Cache Refresh
 *
 * This endpoint can be called by:
 * 1. Render Cron Jobs (recommended)
 * 2. External cron services (cron-job.org, EasyCron, etc.)
 * 3. GitHub Actions
 *
 * Set up a cron job to call this URL daily at 6 AM:
 * https://your-app.onrender.com/api/cron/cache-refresh
 */
export default async function handler(req, res) {
  // Security: Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Optional: Add authentication token for security
  const authToken = req.headers.authorization;
  const expectedToken = process.env.CRON_SECRET_TOKEN;

  if (expectedToken && authToken !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('Starting scheduled cache refresh...');

  try {
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

    console.log('Cache refresh completed successfully');

    return res.status(200).json({
      success: true,
      message: 'Cache refresh completed',
      timestamp: new Date().toISOString(),
      stats,
    });

  } catch (error) {
    console.error('Cache refresh failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to refresh cache',
      details: error.message,
      timestamp: new Date().toISOString(),
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

// Allow long execution time
export const config = {
  maxDuration: 300, // 5 minutes
};
