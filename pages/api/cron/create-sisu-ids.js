// Vercel Cron Job endpoint for automated SISU_ID file creation
// Runs daily at 8:30 AM UTC to create blank SISU_ID Google Docs in new folders

export default async function handler(req, res) {
  try {
    // Verify authorization
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;
    const isLocalhost = req.headers.host?.includes('localhost') || req.headers.host?.includes('127.0.0.1');

    const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
    const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isLocalhost && !isVercelCron && !hasValidSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[CRON] Starting SISU_ID file creation at', new Date().toISOString());

    // Call the create-sisu-id-files endpoint internally
    const baseUrl = req.headers.host?.includes('localhost')
      ? 'http://localhost:3000'
      : `https://${req.headers.host}`;

    const response = await fetch(`${baseUrl}/api/create-sisu-id-files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[CRON] SISU_ID creation failed:', data);
      return res.status(response.status).json({ error: data });
    }

    console.log('[CRON] SISU_ID creation completed:', `${data.created} created, ${data.skipped} skipped, ${data.errors} errors`);
    return res.status(200).json({
      success: true,
      message: 'SISU_ID file creation completed',
      result: data,
    });

  } catch (error) {
    console.error('[CRON] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Vercel configuration to allow longer execution time
export const config = {
  maxDuration: 300, // 5 minutes for Pro plan
};
