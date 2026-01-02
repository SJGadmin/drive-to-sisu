# Edge Case Handling Documentation

This document details all the edge cases that the SISU Document Automation system handles.

## Overview

The system now includes comprehensive handling for various edge cases you identified, with robust error handling, retry logic, and detailed logging.

## Edge Cases Implemented

### 1. Empty SISU_ID Files

**Scenario**: SISU_ID Google Doc exists but contains no email address

**Handling**:
- Folder is automatically skipped (no error thrown)
- Logged to "Skipped" sheet in `SISU_Upload_Errors` Google Sheet
- Reason: "SISU_ID file is empty"
- Displayed in UI under "Folders Skipped" count

**Code Location**: [pages/api/run-upload.js:58-67](pages/api/run-upload.js#L58-L67)

```javascript
if (!clientEmail || clientEmail.trim() === '') {
  skipped.push({
    folderId: folder.folderId,
    folderName: folder.folderName,
    folderPath: folder.folderPath,
    reason: 'SISU_ID file is empty',
  });
  console.log(`⏭️  Skipped (empty): ${folder.folderPath}`);
  continue;
}
```

---

### 2. Email Not Associated with SISU Transaction

**Scenario**: SISU_ID contains an email, but the email doesn't exist in SISU or has no active transactions

**Handling**:
- Folder is automatically skipped (not treated as error)
- Logged to "Skipped" sheet
- Reason: "Email not associated with a SISU transaction"
- Details field contains specific error from SISU API (e.g., "Email not found in SISU" or "No active transactions")
- Displayed in UI under "Folders Skipped" count

**Code Location**: [pages/api/run-upload.js:92-106](pages/api/run-upload.js#L92-L106)

```javascript
if (!sisuLookupResult.found) {
  for (const folder of folders) {
    skipped.push({
      folderId: folder.folderId,
      folderName: folder.folderName,
      folderPath: folder.folderPath,
      email: clientEmail,
      reason: 'Email not associated with a SISU transaction',
      details: sisuLookupResult.error,
    });
    console.log(`⏭️  Skipped (not in SISU): ${folder.folderPath} - ${clientEmail}`);
  }
  continue;
}
```

**SISU API Handling**: [pages/api/run-upload.js:505-596](pages/api/run-upload.js#L505-L596)
- Returns 404: Logged as "Email not found in SISU"
- Returns valid response with no transactions: Logged as "No active transactions found for email"
- Network errors after 3 retries: Logged with specific API error

---

### 3. Nested SISU_ID Files (Highest Level Priority)

**Scenario**: Same client/property has SISU_ID at multiple levels (e.g., when moving from "Listings" to "Under Contract")

**Example**:
```
*Listings > *Active > 123 Main St > SISU_ID (seller@example.com)
*Under Contract > 123 Main St > SISU_ID (seller@example.com)
```

**Handling**:
- System detects all SISU_ID files first
- Builds full folder path for each
- Calculates path depth (number of folder levels)
- Sorts by depth (ascending) - shortest paths first
- Processes only the HIGHEST level (shortest path)
- Nested/duplicate paths are automatically skipped
- Logged to console: `⏭️  Skipping nested: [path] (parent: [parent_path])`

**Why Highest Level?**
- Ensures ALL files are captured (parent folder includes subfolders)
- Prevents duplicate uploads
- When files move from Active to Under Contract, parent SISU_ID captures everything

**Code Location**: [pages/api/run-upload.js:376-412](pages/api/run-upload.js#L376-L412)

```javascript
async function deduplicateFoldersByPriority(drive, allFolders) {
  const pathDepths = allFolders.map(folder => ({
    ...folder,
    depth: folder.folderPath.split(' > ').length,
  }));

  pathDepths.sort((a, b) => a.depth - b.depth);

  const selectedFolders = [];
  const processedPaths = new Set();

  for (const folder of pathDepths) {
    let isDescendant = false;
    for (const processedPath of processedPaths) {
      if (folder.folderPath.startsWith(processedPath + ' > ')) {
        isDescendant = true;
        console.log(`⏭️  Skipping nested: ${folder.folderPath} (parent: ${processedPath})`);
        break;
      }
    }
    if (!isDescendant) {
      selectedFolders.push(folder);
      processedPaths.add(folder.folderPath);
    }
  }
  return selectedFolders;
}
```

---

### 4. Multiple Transactions Per Email (Buyer AND Seller)

**Scenario**: Same email appears in multiple active SISU transactions with different roles

**Example**:
- sarah.wilson@example.com is a buyer for "123 Main St"
- sarah.wilson@example.com is also a seller for "456 Oak Ave"

**Handling**:
- System detects multiple transactions from SISU API
- **Files are uploaded to ALL matching transactions**
- Creates a flag entry in "Multi-Transaction Flags" sheet
- Flag includes:
  - Email address
  - Transaction count
  - Transaction details (client ID, role, property address for each)
  - All folder paths affected
  - Message: "MANUAL REVIEW NEEDED: Multiple transactions found for this email"
- Displayed in UI under "Multi-Transaction Flags" count with full details
- User can review and manually delete incorrect uploads from SISU portal if needed

**Code Location**: [pages/api/run-upload.js:110-127](pages/api/run-upload.js#L110-L127)

```javascript
if (transactions.length > 1) {
  multiTransactionFlags.push({
    email: clientEmail,
    transactionCount: transactions.length,
    transactions: transactions.map(t => ({
      clientId: t.client_id,
      role: t.role || 'unknown',
      address: t.property_address || 'N/A',
    })),
    folders: folders.map(f => ({
      folderId: f.folderId,
      folderPath: f.folderPath,
    })),
    message: 'MANUAL REVIEW NEEDED: Multiple transactions found for this email',
  });
  console.log(`🚩 FLAG: Multiple transactions for ${clientEmail}`);
}

// Upload to ALL transactions
for (const transaction of transactions) {
  const clientId = transaction.client_id;
  // ... upload logic
}
```

**Google Sheet Logging**: [pages/api/run-upload.js:841-927](pages/api/run-upload.js#L841-L927)

---

### 5. Comprehensive Error Handling and Retry Logic

**Retry Logic for SISU API Calls**:

**Find Client** ([pages/api/run-upload.js:505-596](pages/api/run-upload.js#L505-L596)):
- Up to 3 attempts
- Exponential backoff (1s, 2s, 3s)
- Handles network errors, timeouts, API errors
- Returns structured result: `{ found: boolean, transactions: [], error: string }`

**Upload Document** ([pages/api/run-upload.js:601-653](pages/api/run-upload.js#L601-L653)):
- Up to 3 attempts per file
- Exponential backoff
- Logs each attempt
- Throws detailed error after final attempt

**Error Stage Tracking**:
Every error is logged with the stage where it occurred:
- `read_email`: Failed to read SISU_ID Google Doc
- `process_email`: Failed during email processing
- `process_folder`: Failed during folder processing
- `upload_to_sisu`: Failed during SISU upload
- `system`: Fatal system error

**Fatal Error Handling**:
Even if the entire system crashes, the error is logged to Google Sheets:

```javascript
catch (error) {
  console.error('Fatal error in run-upload:', error);

  try {
    const drive = await authenticateGoogleDrive();
    await logFailuresToSheet(drive, [{
      error: `FATAL: ${error.message}`,
      stage: 'system',
      stack: error.stack,
    }]);
  } catch (logError) {
    console.error('Could not log fatal error to sheet:', logError);
  }

  return res.status(500).json({
    error: 'Internal server error',
    details: error.message,
  });
}
```

---

## Google Sheets Logging

All results are logged to a single Google Sheet named `SISU_Upload_Errors` with three tabs:

### Errors Sheet
- **Purpose**: Actual failures requiring attention
- **Columns**: Timestamp, Stage, Folder Path, Folder ID, File Name, File ID, Client Email, SISU Client ID, Error
- **Auto-created**: Yes, with headers on first run
- **Code**: [pages/api/run-upload.js:675-745](pages/api/run-upload.js#L675-L745)

### Skipped Sheet
- **Purpose**: Intentionally skipped folders (not errors)
- **Columns**: Timestamp, Folder Path, Folder ID, Email, Reason, Details
- **Auto-created**: Yes, as separate tab
- **Code**: [pages/api/run-upload.js:750-836](pages/api/run-upload.js#L750-L836)

### Multi-Transaction Flags Sheet
- **Purpose**: Manual review needed for multi-transaction scenarios
- **Columns**: Timestamp, Email, Transaction Count, Transaction Details (JSON), Folder Paths, Action Required
- **Auto-created**: Yes, as separate tab
- **Code**: [pages/api/run-upload.js:841-927](pages/api/run-upload.js#L841-L927)

---

## UI Updates

The frontend ([pages/index.js](pages/index.js)) now displays:

**Summary Cards**:
1. **Documents Uploaded** (green) - Success count
2. **Folders Skipped** (yellow) - Skipped count (NOT errors)
3. **Failed Uploads** (red) - Error count
4. **Multi-Transaction Flags** (purple) - Flags requiring review (only shown if > 0)

**Detailed Sections**:
1. **Successful Uploads** - Shows first 10, with file name, email, and folder path
2. **Skipped Folders** - Shows first 5, with folder path, email (if available), reason, and details
3. **Multi-Transaction Flags** - Shows all flags with email, transaction count, and transaction details
4. **Failed Uploads** - Shows first 5, with file name/folder path, stage, and error message

**CSS Styling**:
- Different colors for each category
- Warning notes for multi-transaction flags
- Pagination notes when showing subset of results
- Empty state message when no work needed

---

## Testing Recommendations

### Test Case 1: Empty SISU_ID
1. Create a folder with an empty SISU_ID Google Doc
2. Run the upload process
3. Verify folder appears in "Skipped" count
4. Check "Skipped" sheet has entry with reason "SISU_ID file is empty"

### Test Case 2: Email Not in SISU
1. Create a folder with SISU_ID containing `nonexistent@example.com`
2. Run the upload process
3. Verify folder appears in "Skipped" count
4. Check "Skipped" sheet has entry with reason "Email not associated with a SISU transaction"

### Test Case 3: Nested SISU_ID
1. Create structure: `Parent Folder > SISU_ID` and `Parent Folder > Child Folder > SISU_ID`
2. Both SISU_ID files contain same email
3. Run the upload process
4. Verify console shows "Skipping nested" message for child folder
5. Verify only parent folder is processed

### Test Case 4: Multi-Transaction Email
1. Ensure an email exists in SISU with 2+ active transactions
2. Create folder with SISU_ID containing that email
3. Add PDFs to the folder
4. Run the upload process
5. Verify files are uploaded to ALL matching transactions
6. Verify "Multi-Transaction Flags" sheet has entry with transaction details
7. Manually check SISU portal to verify uploads went to correct transactions

### Test Case 5: SISU API Failure
1. Temporarily use incorrect SISU credentials
2. Run the upload process
3. Verify system retries 3 times (check console logs)
4. Verify error is logged to "Errors" sheet with stage "upload_to_sisu"
5. Verify error message includes "Upload failed after 3 attempts"

---

## Summary of Changes

**Files Modified**:
1. [pages/api/run-upload.js](pages/api/run-upload.js) - Complete rewrite with all edge cases
2. [pages/index.js](pages/index.js) - Updated UI for new status categories
3. [README.md](README.md) - Updated documentation with edge cases

**New Functions Added**:
- `deduplicateFoldersByPriority()` - Handles nested SISU_ID files
- `buildFolderPath()` - Builds full path for display
- `findSISUClientWithRetry()` - SISU lookup with retry logic and multi-transaction support
- `uploadToSISUWithRetry()` - Upload with retry logic
- `logSkippedToSheet()` - Logs skipped folders
- `logMultiTransactionFlags()` - Logs multi-transaction flags

**Key Improvements**:
- All edge cases handled with appropriate logging
- No false errors (skipped items are clearly distinguished from failures)
- Detailed tracking of every decision made by the system
- Manual review workflow for multi-transaction scenarios
- Robust retry logic for all API calls
- Comprehensive error logging with stage tracking
- User-friendly UI that clearly communicates what happened
