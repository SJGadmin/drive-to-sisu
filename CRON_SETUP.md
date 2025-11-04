# Vercel Cron Job Setup Guide

## What is a Cron Job?
A cron job is an automated task that runs on a schedule (like daily at 9am) or can be triggered manually via a URL. This solves the 504 timeout error by running the upload process in the background without time limits.

## Setup Steps

### 1. Add Environment Variable to Vercel

Go to your Vercel project settings and add this environment variable:

**Variable Name:** `CRON_SECRET`
**Value:** Create a random secret string (like a password)
**Example:** `my-super-secret-cron-key-12345`

You can generate a random secret here: https://randomkeygen.com/

### 2. Add Public Environment Variable (Optional - for manual triggers from UI)

If you want to trigger uploads from the web UI:

**Variable Name:** `NEXT_PUBLIC_CRON_SECRET`
**Value:** (same as CRON_SECRET above)

### 3. Deploy to Vercel

Push your code to GitHub - Vercel will automatically detect the `vercel.json` file and set up the cron job.

```bash
git add .
git commit -m "Add cron job for uploads"
git push
```

### 4. How It Works

#### Automatic Schedule
The upload process will run automatically **every day at 9:00 AM UTC** (configured in vercel.json).

To change the schedule, edit `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/upload",
      "schedule": "0 9 * * *"  // Every day at 9 AM UTC
    }
  ]
}
```

Common schedules:
- `0 9 * * *` - Every day at 9 AM
- `0 */6 * * *` - Every 6 hours
- `0 9 * * 1` - Every Monday at 9 AM
- `0 0 * * *` - Every day at midnight

#### Manual Trigger from UI
Click the "Upload Documents" button in your web app - it will use the cron endpoint.

#### Manual Trigger via URL
You can also trigger it by visiting this URL (replace with your actual deployment URL and secret):

```
https://your-app.vercel.app/api/cron/upload
```

With this header:
```
Authorization: Bearer your-cron-secret-here
```

Or use curl:
```bash
curl -X POST https://your-app.vercel.app/api/cron/upload \
  -H "Authorization: Bearer your-cron-secret-here"
```

## Benefits

✅ **No more timeouts** - Runs without the 10-second/5-minute limits
✅ **Automatic uploads** - Runs on schedule without manual intervention
✅ **Manual control** - Can still trigger from the UI when needed
✅ **Reliable** - Background processing continues even if you close your browser

## Monitoring

Check your Vercel deployment logs to see when the cron job runs and view the upload results.

## Troubleshooting

**Error: Unauthorized**
- Make sure you added the `CRON_SECRET` environment variable in Vercel
- Redeploy after adding environment variables

**Cron job not running**
- Check Vercel logs for errors
- Verify the schedule in vercel.json is correct
- Make sure you're on a Vercel plan that supports cron jobs (Hobby plan supports it!)

**Still timing out**
- The cron job has a 5-minute max on Pro plan, 10 seconds on Hobby plan
- If uploads take longer than 5 minutes, consider breaking them into smaller batches
