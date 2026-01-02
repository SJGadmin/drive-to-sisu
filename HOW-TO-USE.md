# How to Use the New Features - Simple Guide

You now have 3 easy-to-use scripts in your project folder. Just **double-click** them to run!

---

## 📁 The Scripts

### 1️⃣ **1-refresh-cache.command**
**What it does:** Builds the cache for super-fast client lookups

**When to use:**
- After adding new clients to Google Drive
- Once daily for best performance
- After restarting your server

**How to use:**
1. Double-click the file
2. Press Enter to start
3. Wait for it to finish (shows progress)
4. Press Enter to close

**What you'll see:**
```
=== Client Cache Refresh ===

✓ Authenticated

Starting cache refresh...
Found 148 client folders
  [1/148] Cached: client1@example.com
  [2/148] Cached: client2@example.com
  ...

✓ Cache is ready for fast lookups!
```

---

### 2️⃣ **2-test-closed-transactions.command**
**What it does:** Tests if your SISU account can access closed transactions

**When to use:**
- First time setup (run this once)
- To verify closed transaction support
- To debug transaction access issues

**How to use:**
1. Double-click the file
2. Enter a client email address when prompted
3. View the results
4. Press Enter to close

**What you'll see:**
- List of all transactions for that email
- Transaction status (Pending, Closed, etc.)
- Whether closed transactions are accessible

---

### 3️⃣ **3-test-single-upload.command**
**What it does:** Tests uploading documents for a single client

**When to use:**
- Testing the upload system
- Uploading for just one client
- Debugging upload issues

**How to use:**
1. Double-click the file
2. Enter the client email when prompted
3. Watch the upload progress
4. Press Enter to close

**What you'll see:**
- Client lookup results
- Documents found
- Upload success/failure for each file

---

## 🚀 Quick Start - First Time Setup

**Step 1:** Run the cache refresh
- Double-click `1-refresh-cache.command`
- Wait for it to complete (takes 1-2 minutes)

**Step 2:** Test closed transactions
- Double-click `2-test-closed-transactions.command`
- Enter any client email from your system
- Check if closed transactions appear

**Step 3:** You're done!
- Your system is now optimized
- Single client uploads will be 600x faster
- Closed transactions work (if SISU allows it)

---

## 💡 Tips

### Daily Cache Refresh
For best performance, refresh the cache once per day:
- Double-click `1-refresh-cache.command` every morning
- Or set it up to run automatically (see OPTIMIZATION_GUIDE.md)

### Cache is Temporary
The cache is stored in memory, so:
- ✅ Super fast lookups
- ⚠️ Clears when you restart the server
- 💡 Just run the refresh script after restart

### New Clients
When you add a new client to Google Drive:
- Option 1: Run the refresh script (faster)
- Option 2: Do nothing (cache updates automatically on first lookup)

---

## 🆘 Troubleshooting

### "Permission denied" error
If you can't run the scripts:
1. Open Terminal
2. Run this command:
```bash
cd "/Users/mystuff/Documents/Drive to SISU Upload/drive-to-sisu"
chmod +x *.command
```

### "Command not found" or "node: not found"
You need to install Node.js:
1. Go to https://nodejs.org
2. Download and install the LTS version
3. Restart your computer
4. Try again

### Scripts don't open when double-clicked
1. Right-click the script file
2. Choose "Open With" → "Terminal"
3. Click "Open" if macOS asks for permission

### Still having issues?
See the detailed [OPTIMIZATION_GUIDE.md](OPTIMIZATION_GUIDE.md) or check the main [README.md](README.md)

---

## 📚 More Information

- **Full Documentation:** See [OPTIMIZATION_GUIDE.md](OPTIMIZATION_GUIDE.md)
- **Setup Guide:** See [SETUP.md](SETUP.md)
- **Main README:** See [README.md](README.md)

---

That's it! You now have a much faster and more efficient SISU upload system. 🎉
