# Drive to SISU Upload Automation

Automated system that checks Google Drive for new client documents (.pdf) and uploads them to the correct client's transaction portal in the SISU platform.

## Overview

This Next.js application provides both a web interface and an API route for automated document uploads:

**Web Interface** (`/`):
- Simple, user-friendly dashboard with a "Run Upload Process" button
- Real-time progress indicator while processing
- Visual summary showing successful uploads and failures
- Detailed results for each processed document

**API Route** (`/api/run-upload`):
1. Searches a Google Shared Drive for folders containing `SISU_ID.txt` (client identifier files)
2. Finds all new PDF documents in those folders and subfolders
3. Retrieves the client's SISU account using their email from `SISU_ID.txt`
4. Uploads the PDFs to the client's SISU transaction portal
5. Marks successfully uploaded files by renaming them with `_UPLOADED.pdf` suffix
6. Logs any failures to a Google Sheet in the Shared Drive

## Prerequisites

- Node.js 18+ installed
- A Google Cloud Service Account with Drive API access
- Access to a Google Shared Drive
- SISU API credentials

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/SJGadmin/drive-to-sisu.git
cd drive-to-sisu
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your credentials:

```env
GOOGLE_CREDENTIALS_BASE64=<your_base64_encoded_service_account_key>
GOOGLE_SHARED_DRIVE_ID=0AKjcBWrKqcliUk9PVA
SISU_BASE_URL=https://staging.sisu.co/api/v1
SISU_AUTH_HEADER=Basic c3Rld2FydC1hbmQtamFuZS1ncm91cDozYTU1MzRiMi1jZTVhLTRhMWMtOGMzNy1jOWE0YTE3NmE3NWI=
```

#### Getting Google Service Account Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the Google Drive API
4. Create a Service Account
5. Download the JSON key file
6. Base64 encode the JSON file:
   ```bash
   base64 -i service-account-key.json
   ```
7. Copy the output to `GOOGLE_CREDENTIALS_BASE64`

### 4. Run the Development Server

```bash
npm run dev
```

Open your browser to `http://localhost:3000` to see the web interface, or use the API directly at `http://localhost:3000/api/run-upload`

**See [SETUP.md](SETUP.md) for detailed instructions on obtaining your Google Service Account credentials.**

### 5. Deploy to Production

Build and start the production server:

```bash
npm run build
npm start
```

Or deploy to Vercel:

```bash
npx vercel
```

## Google Drive Folder Structure

For the automation to work, your Google Shared Drive must be organized as follows:

```
Shared Drive (ID: 0AKjcBWrKqcliUk9PVA)
├── Client Folder 1/
│   ├── SISU_ID.txt (contains: client1@example.com)
│   ├── Document1.pdf (will be uploaded)
│   ├── Document2.pdf (will be uploaded)
│   ├── Document3_UPLOADED.pdf (skipped - already uploaded)
│   └── Subfolder/
│       └── Document4.pdf (will be uploaded)
├── Client Folder 2/
│   ├── SISU_ID.txt (contains: client2@example.com)
│   └── Invoice.pdf (will be uploaded)
```

**Important Notes:**
- Each client folder must contain a `SISU_ID.txt` file with the client's email address
- Only `.pdf` files are processed
- Files ending with `_UPLOADED.pdf` are skipped
- The script searches all subfolders below the folder containing `SISU_ID.txt`
- Successfully uploaded files are renamed with `_UPLOADED.pdf` suffix

## Usage

### Web Interface (Recommended for Manual Runs)

1. Open `http://localhost:3000` (or your deployed URL) in your browser
2. Click the "Run Upload Process" button
3. Wait for the process to complete
4. View the results summary showing:
   - Number of documents successfully uploaded
   - Number of failed uploads
   - Details for each processed file

### API Usage (For Automation/Cron Jobs)

#### Endpoint

```
POST /api/run-upload
```

#### Example Request

```bash
curl -X POST http://localhost:3000/api/run-upload
```

### Example Response

```json
{
  "message": "Upload process completed",
  "summary": {
    "totalSuccessful": 5,
    "totalFailed": 1
  },
  "successfulUploads": [
    {
      "driveFileId": "1ABC...xyz",
      "driveFileName": "Document1.pdf",
      "sisuClientId": 12345,
      "clientEmail": "client1@example.com"
    }
  ],
  "failures": [
    {
      "folderId": "1DEF...abc",
      "folderName": "Client Folder 2",
      "fileName": "Invoice.pdf",
      "fileId": "1GHI...def",
      "clientEmail": "client2@example.com",
      "error": "SISU document upload failed: 400 - Invalid file format"
    }
  ]
}
```

## Error Logging

Failed uploads are automatically logged to a Google Sheet named `SISU_Upload_Errors` in your Shared Drive. The sheet contains:

- Timestamp
- Folder ID
- Folder Name
- File ID
- File Name
- Client Email
- Error Message

## Automation with Cron Jobs

You can automate this script to run periodically using:

### Vercel Cron Jobs

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/run-upload",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

### External Cron Service

Use a service like [cron-job.org](https://cron-job.org) or [EasyCron](https://www.easycron.com/) to make POST requests to your deployed endpoint.

## Troubleshooting

### "GOOGLE_CREDENTIALS_BASE64 environment variable not set"
- Ensure `.env.local` exists and contains the Base64-encoded service account key

### "Client not found in SISU or API error"
- Verify the email in `SISU_ID.txt` matches a client in SISU
- Check that the SISU API credentials are correct

### "Permission denied" errors from Google Drive
- Ensure the service account has access to the Shared Drive
- The service account email should be added as a member of the Shared Drive

### No files being processed
- Verify files don't already end with `_UPLOADED.pdf`
- Ensure files are `.pdf` format
- Check that `SISU_ID.txt` exists in the parent folder

## Development

### Project Structure

```
drive-to-sisu/
├── pages/
│   ├── index.js            # Web interface
│   └── api/
│       └── run-upload.js   # Main API route
├── package.json            # Dependencies
├── next.config.js          # Next.js configuration
├── .env.local             # Environment variables (not in git)
├── .env.example           # Example environment variables
├── SETUP.md               # Detailed setup guide
└── README.md              # This file
```

### Testing Locally

1. Set up a test folder in your Shared Drive
2. Add a `SISU_ID.txt` with a test email
3. Add some test PDFs
4. Run the API endpoint and verify results

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
