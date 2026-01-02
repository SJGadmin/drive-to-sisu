# Automatic Cache Refresh Setup

This guide shows you how to set up automatic cache refresh at 6 AM daily, even when your Mac is off.

---

## ✅ Recommended: Cloud-Based Automatic Refresh

Since your app runs on Render, the best solution is to use a cloud service to call your API endpoint daily.

### Option 1: Render Cron Jobs (Easiest - Paid Feature)

If you have a paid Render plan with Cron Jobs:

1. Go to your Render dashboard
2. Create a new **Cron Job**
3. Set the schedule: `0 6 * * *` (daily at 6 AM)
4. Set the command: `curl -X POST https://your-app.onrender.com/api/cron/cache-refresh`

**Done!** Render will call your endpoint daily at 6 AM automatically.

---

### Option 2: cron-job.org (Free & Recommended)

This free service will call your API endpoint daily, even when your Mac is off.

**Setup Steps:**

1. **Go to https://cron-job.org**
2. **Create a free account**
3. **Create a new cron job:**
   - Title: `SISU Cache Refresh`
   - URL: `https://your-app.onrender.com/api/cron/cache-refresh`
     - ⚠️ Replace `your-app` with your actual Render app name
   - Schedule: `0 6 * * *` (daily at 6 AM)
   - Request Method: `POST`
   - Save notifications: Enable "Email on failure" (optional)
4. **Enable the job**

**That's it!** The cache will refresh automatically every day at 6 AM.

---

### Option 3: GitHub Actions (Free)

Uses GitHub's free automation to trigger the refresh.

1. **Create this file in your repo:** `.github/workflows/cache-refresh.yml`

```yaml
name: Daily Cache Refresh

on:
  schedule:
    # Runs at 6:00 AM UTC daily (adjust timezone as needed)
    - cron: '0 6 * * *'
  workflow_dispatch: # Allows manual trigger

jobs:
  refresh-cache:
    runs-on: ubuntu-latest
    steps:
      - name: Call cache refresh endpoint
        run: |
          curl -X POST https://your-app.onrender.com/api/cron/cache-refresh
```

2. **Commit and push** the file to GitHub
3. **Done!** GitHub will run it daily at 6 AM UTC

To adjust for your timezone:
- PST (UTC-8): Use `14 6 * * *` for 6 AM PST
- EST (UTC-5): Use `11 6 * * *` for 6 AM EST

---

### Option 4: EasyCron (Free tier available)

1. Go to https://www.easycron.com
2. Sign up for free account
3. Create a cron job:
   - URL: `https://your-app.onrender.com/api/cron/cache-refresh`
   - Cron Expression: `0 6 * * *`
   - HTTP Method: `POST`

---

## 🔒 Optional: Add Security (Recommended)

To prevent unauthorized cache refreshes:

1. **Add to your `.env` file on Render:**
   ```
   CRON_SECRET_TOKEN=your-random-secret-here
   ```
   - Generate a random token: https://www.uuidgenerator.net/

2. **Update your cron job URL to include the token:**
   ```
   https://your-app.onrender.com/api/cron/cache-refresh
   ```

3. **Add this header to your cron service:**
   - Header Name: `Authorization`
   - Header Value: `Bearer your-random-secret-here`

This prevents anyone from triggering your cache refresh.

---

## 🖥️ Local Mac Setup (Only works when Mac is awake)

If you still want the Mac script (runs only when your Mac is on):

**Run this once:**
1. Double-click `setup-auto-refresh.command`
2. Press Enter to install
3. Done!

**How it works:**
- Runs at 6 AM if your Mac is awake
- Logs saved to `logs/cache-refresh.log`

**To disable:**
```bash
launchctl unload ~/Library/LaunchAgents/com.sisu.cache-refresh.plist
```

---

## 📊 Verify It's Working

After setting up automatic refresh, check if it's working:

1. **Wait until after 6 AM the next day**
2. **Use your single client upload**
3. **Check the response** - it should show:
   ```json
   {
     "usedCache": true,
     "cacheStats": {
       "size": 150,
       "ageInMinutes": 30
     }
   }
   ```

If `usedCache: true` and `ageInMinutes` is less than a few hours, it's working!

---

## 🆘 Troubleshooting

### Cron job failing?

**Check your Render app URL:**
- Make sure you're using the correct URL
- Example: `https://drive-to-sisu.onrender.com/api/cron/cache-refresh`

**Check Render logs:**
1. Go to your Render dashboard
2. Click on your web service
3. View logs around 6 AM
4. Look for "Starting scheduled cache refresh..."

### Cache not updating?

**Manual test:**
```bash
curl -X POST https://your-app.onrender.com/api/cron/cache-refresh
```

If this works, your cron service isn't calling it. Check your cron service settings.

---

## 🎯 Recommendation

**For you, I recommend Option 2: cron-job.org**

Why?
- ✅ Free
- ✅ Works even when your Mac is off
- ✅ Easy to set up (5 minutes)
- ✅ Email notifications if it fails
- ✅ No code changes needed

**Quick Setup:**
1. Go to https://cron-job.org
2. Sign up
3. Create job pointing to your Render app URL
4. Set schedule to `0 6 * * *`
5. Done!

Your cache will refresh every morning at 6 AM automatically, no matter what.

---

## Summary

| Method | Works when Mac is off? | Free? | Difficulty |
|--------|----------------------|-------|------------|
| cron-job.org | ✅ Yes | ✅ Yes | ⭐ Easy |
| GitHub Actions | ✅ Yes | ✅ Yes | ⭐⭐ Medium |
| EasyCron | ✅ Yes | ✅ Yes (limited) | ⭐ Easy |
| Render Cron Jobs | ✅ Yes | ❌ No (paid) | ⭐ Easy |
| Mac Launch Agent | ❌ No | ✅ Yes | ⭐⭐ Medium |

Choose the method that works best for you!
