# Setup Guide: Getting Your Environment Variables

This guide will walk you through obtaining all the necessary credentials to run the SISU Document Automation system.

## Required Environment Variables

You need 4 environment variables. Here's how to get each one:

---

## 1. GOOGLE_CREDENTIALS_BASE64

This is your Google Service Account credentials, Base64 encoded.

### Step-by-Step Instructions:

#### A. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click "New Project"
4. Name it something like "SISU Document Automation"
5. Click "Create"

#### B. Enable Google Drive API

1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Google Drive API"
3. Click on it and click "Enable"
4. Also enable "Google Sheets API" (for error logging)

#### C. Create a Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the details:
   - Service account name: `sisu-automation`
   - Service account ID: (auto-generated)
   - Description: "Service account for automated SISU document uploads"
4. Click "Create and Continue"
5. Skip the optional permissions steps (click "Continue" then "Done")

#### D. Create and Download Service Account Key

1. Find your new service account in the list
2. Click on it to open the details
3. Go to the "Keys" tab
4. Click "Add Key" > "Create new key"
5. Choose "JSON" format
6. Click "Create"
7. A JSON file will download automatically - **KEEP THIS SECURE!**

#### E. Share Your Google Drive with the Service Account

1. Open the downloaded JSON file and find the `client_email` field
   - It will look like: `sisu-automation@your-project-123456.iam.gserviceaccount.com`
2. Go to your Google Shared Drive (ID: `0AKjcBWrKqcliUk9PVA`)
3. Right-click and select "Share"
4. Paste the service account email
5. Give it "Content Manager" or "Editor" permissions
6. Click "Send"

#### F. Convert JSON to Base64

**On Mac/Linux:**
```bash
base64 -i path/to/your-service-account-key.json | tr -d '\n'
```

**On Windows (PowerShell):**
```powershell
[Convert]::ToBase64String([System.IO.File]::ReadAllBytes("path\to\your-service-account-key.json"))
```

**Online Tool (if needed):**
- Go to https://www.base64encode.org/
- Upload your JSON file
- Copy the encoded output

Copy the entire Base64 string - this is your `GOOGLE_CREDENTIALS_BASE64`

---

## 2. GOOGLE_SHARED_DRIVE_ID

✅ **Already provided:** `0AKjcBWrKqcliUk9PVA`

This is the root folder ID of your Google Shared Drive.

### How to Find Your Drive ID (if you need to change it):

1. Open Google Drive
2. Navigate to your Shared Drive
3. Look at the URL - the ID is the long string after `/drive/folders/`
   - Example: `https://drive.google.com/drive/folders/0AKjcBWrKqcliUk9PVA`
   - The ID is: `0AKjcBWrKqcliUk9PVA`

---

## 3. SISU_BASE_URL

✅ **Already provided:** `https://staging.sisu.co/api/v1`

This is the base URL for the SISU API.

- **Staging:** `https://staging.sisu.co/api/v1`
- **Production:** `https://sisu.co/api/v1` (change this when you're ready for production)

---

## 4. SISU_AUTH_HEADER

✅ **Already provided:** `Basic c3Rld2FydC1hbmQtamFuZS1ncm91cDozYTU1MzRiMi1jZTVhLTRhMWMtOGMzNy1jOWE0YTE3NmE3NWI=`

This is your SISU API authentication header with Basic Auth credentials.

### If You Need to Generate a New One:

If your SISU credentials change, create a new Basic Auth header:

1. Get your SISU username and password (API credentials)
2. Create a string: `username:password`
3. Base64 encode it:

**On Mac/Linux:**
```bash
echo -n "your-username:your-password" | base64
```

**On Windows (PowerShell):**
```powershell
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("your-username:your-password"))
```

4. Add "Basic " in front: `Basic YOUR_BASE64_STRING_HERE`

---

## Setting Up Your .env.local File

1. In your project directory, create a file named `.env.local`
2. Add all four variables:

```env
# Google Drive Configuration
GOOGLE_CREDENTIALS_BASE64=YOUR_VERY_LONG_BASE64_STRING_HERE

# Google Shared Drive ID
GOOGLE_SHARED_DRIVE_ID=0AKjcBWrKqcliUk9PVA

# SISU API Configuration
SISU_BASE_URL=https://staging.sisu.co/api/v1

# SISU API Auth Header
SISU_AUTH_HEADER=Basic c3Rld2FydC1hbmQtamFuZS1ncm91cDozYTU1MzRiMi1jZTVhLTRhMWMtOGMzNy1jOWE0YTE3NmE3NWI=
```

3. Replace `YOUR_VERY_LONG_BASE64_STRING_HERE` with your actual Base64-encoded service account JSON

---

## Testing Your Setup

After setting up your `.env.local` file:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open your browser to `http://localhost:3000`

4. Click the "Run Upload Process" button

5. Check the results!

---

## Troubleshooting

### Error: "GOOGLE_CREDENTIALS_BASE64 environment variable not set"
- Make sure your `.env.local` file is in the root directory
- Restart your Next.js dev server after creating/editing `.env.local`

### Error: "Permission denied" from Google Drive
- Make sure you shared the Shared Drive with your service account email
- The service account needs "Content Manager" or "Editor" permissions

### Error: "Client not found in SISU"
- Check that the email in `SISU_ID.txt` matches exactly (no extra spaces)
- Verify the email exists in your SISU staging environment
- Test the SISU API credentials with a tool like Postman

### Error: "Invalid credentials" from Google
- Your Base64 encoding might be incorrect
- Make sure you copied the entire Base64 string with no line breaks
- Try encoding the JSON file again

---

## Security Best Practices

⚠️ **NEVER commit these files to git:**
- `.env.local`
- `.env`
- Any `*service-account*.json` files
- Any `*credentials*.json` files

✅ **The `.gitignore` file already includes these patterns**

⚠️ **For production deployment:**
- Use environment variable secrets in your hosting platform (Vercel, Netlify, etc.)
- Don't hardcode credentials in your code
- Rotate your service account keys periodically

---

## Next Steps

Once your environment is set up:

1. ✅ Create test folders in your Google Drive with `SISU_ID.txt` files
2. ✅ Add some test PDFs
3. ✅ Run the upload process from the web interface
4. ✅ Check the results and verify files are renamed to `_UPLOADED.pdf`
5. ✅ Check SISU to confirm documents were uploaded
6. ✅ Deploy to production when ready!

---

## Need Help?

If you run into issues:
1. Check the browser console for errors (F12)
2. Check your Next.js terminal for server-side errors
3. Verify all environment variables are set correctly
4. Test each API separately (Google Drive, then SISU)

Good luck! 🚀
