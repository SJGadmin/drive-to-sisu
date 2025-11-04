// Vercel Cron Job endpoint for automated uploads
// This runs the upload process without the 10-second timeout limit

export default async function handler(req, res) {
  try {
    // Verify authorization
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;
    const isLocalhost = req.headers.host?.includes('localhost') || req.headers.host?.includes('127.0.0.1');

    // Allow requests from:
    // 1. Localhost (development)
    // 2. Vercel Cron
    // 3. Requests with correct secret
    const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
    const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isLocalhost && !isVercelCron && !hasValidSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[CRON] Starting upload process at', new Date().toISOString());

    // Call the upload endpoint internally
    const baseUrl = req.headers.host?.includes('localhost')
      ? 'http://localhost:3000'
      : `https://${req.headers.host}`;

    const uploadResponse = await fetch(`${baseUrl}/api/run-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const uploadData = await uploadResponse.json();

    if (!uploadResponse.ok) {
      console.error('[CRON] Upload failed:', uploadData);
      return res.status(uploadResponse.status).json({ error: uploadData });
    }

    console.log('[CRON] Upload completed successfully');
    return res.status(200).json({
      success: true,
      message: 'Upload process completed',
      result: uploadData,
    });

  } catch (error) {
    console.error('[CRON] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Vercel configuration to allow longer execution time
export const config = {
  maxDuration: 300, // 5 minutes for Pro plan, 10 seconds for Hobby
};
