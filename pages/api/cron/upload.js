// Vercel Cron Job endpoint for automated uploads
// This runs the upload process without the 10-second timeout limit

export default async function handler(req, res) {
  try {
    // Verify authorization
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;

    // Allow requests from Vercel Cron or with correct secret
    const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
    const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isVercelCron && !hasValidSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[CRON] Starting upload process at', new Date().toISOString());

    // Dynamically import the upload handler to avoid circular dependencies
    const uploadHandler = require('../run-upload').default;

    // Create a mock request object for the upload handler
    const mockReq = {
      method: 'POST',
      headers: req.headers,
    };

    // Create a custom response object to capture the result
    let uploadResult = null;
    let uploadError = null;

    const mockRes = {
      status: (code) => ({
        json: (data) => {
          if (code === 200) {
            uploadResult = data;
          } else {
            uploadError = data;
          }
          return mockRes;
        },
        send: (data) => {
          uploadResult = data;
          return mockRes;
        },
      }),
      json: (data) => {
        uploadResult = data;
        return mockRes;
      },
    };

    // Run the upload
    await uploadHandler(mockReq, mockRes);

    if (uploadError) {
      console.error('[CRON] Upload failed:', uploadError);
      return res.status(500).json({ error: uploadError });
    }

    console.log('[CRON] Upload completed successfully');
    return res.status(200).json({
      success: true,
      message: 'Upload process completed',
      result: uploadResult,
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
