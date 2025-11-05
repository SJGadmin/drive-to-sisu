import { google } from 'googleapis';
import { Base64 } from 'js-base64';

/**
 * Next.js API Route: SISU Document Automation
 * Automatically checks Google Drive for new client documents (.pdf),
 * retrieves client identifiers, and uploads documents to SISU platform.
 *
 * Edge Cases Handled:
 * 1. Empty SISU_ID files (skipped)
 * 2. Emails not found in SISU (skipped with logging)
 * 3. Nested SISU_ID files (prioritizes highest level)
 * 4. Multiple transactions per email (flagged in Google Sheet)
 * 5. Comprehensive error handling and retry logic
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    // Initialize tracking arrays
    const successfulUploads = [];
    const failures = [];
    const skipped = [];
    const multiTransactionFlags = [];

    // Step 1: Authenticate with Google Drive
    const drive = await authenticateGoogleDrive();

    // Step 2: Find all client folders (those containing SISU_ID)
    const allClientFolders = await findClientFolders(drive);

    if (allClientFolders.length === 0) {
      return res.status(200).json({
        message: 'No client folders found with SISU_ID Google Doc',
        successfulUploads: [],
        failures: [],
        skipped: [],
      });
    }

    // Step 3: Deduplicate folders - prioritize highest level (shortest path)
    const clientFolders = await deduplicateFoldersByPriority(drive, allClientFolders);

    console.log(`Found ${allClientFolders.length} SISU_ID files, processing ${clientFolders.length} after deduplication`);

    // Step 4: Build email-to-transaction mapping to detect multi-transaction scenarios
    const emailToFoldersMap = new Map();

    for (const folder of clientFolders) {
      try {
        // Read client email from SISU_ID Google Doc
        const clientEmail = await readClientEmail(drive, folder.sisuIdFileId);

        // EDGE CASE 1: Skip empty SISU_ID files
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

        // Track email occurrences for multi-transaction detection
        if (!emailToFoldersMap.has(clientEmail)) {
          emailToFoldersMap.set(clientEmail, []);
        }
        emailToFoldersMap.get(clientEmail).push(folder);

      } catch (error) {
        failures.push({
          folderId: folder.folderId,
          folderName: folder.folderName,
          folderPath: folder.folderPath,
          error: `Failed to read SISU_ID: ${error.message}`,
          stage: 'read_email',
        });
      }
    }

    // Step 5: Process each unique email
    for (const [clientEmail, folders] of emailToFoldersMap.entries()) {
      try {
        // Find client in SISU with retry logic
        const sisuLookupResult = await findSISUClientWithRetry(clientEmail);

        // EDGE CASE 2: Skip if email not found in SISU
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

        const transactions = sisuLookupResult.transactions;

        // EDGE CASE 4: Multiple transactions for one email (buyer AND seller)
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

        // Process each folder for this email
        for (const folder of folders) {
          // For multi-transaction scenarios, try to upload to all matching transactions
          for (const transaction of transactions) {
            const clientId = transaction.client_id;

            try {
              // Find all PDFs in this folder and subfolders
              const pdfs = await findNewPDFs(drive, folder.folderId);

              if (pdfs.length === 0) {
                console.log(`📭 No new PDFs in ${folder.folderPath}`);
                continue;
              }

              console.log(`📄 Found ${pdfs.length} PDF(s) in ${folder.folderPath}`);

              // Upload each PDF to SISU
              for (const pdf of pdfs) {
                try {
                  // Download PDF from Google Drive
                  const fileData = await downloadFile(drive, pdf.id);

                  // Upload to SISU with retry logic
                  await uploadToSISUWithRetry(clientId, pdf.name, fileData);

                  // Rename file in Google Drive to mark as uploaded
                  await renameFileAsUploaded(drive, pdf.id, pdf.name);

                  successfulUploads.push({
                    driveFileId: pdf.id,
                    driveFileName: pdf.name,
                    sisuClientId: clientId,
                    clientEmail: clientEmail,
                    folderPath: folder.folderPath,
                    transactionRole: transaction.role || 'unknown',
                  });

                  console.log(`✅ Uploaded: ${pdf.name} to ${clientEmail} (${clientId})`);

                } catch (uploadError) {
                  failures.push({
                    folderId: folder.folderId,
                    folderName: folder.folderName,
                    folderPath: folder.folderPath,
                    fileName: pdf.name,
                    fileId: pdf.id,
                    clientEmail: clientEmail,
                    sisuClientId: clientId,
                    error: uploadError.message,
                    stage: 'upload_to_sisu',
                  });
                  console.error(`❌ Failed: ${pdf.name} - ${uploadError.message}`);
                }
              }
            } catch (folderError) {
              failures.push({
                folderId: folder.folderId,
                folderName: folder.folderName,
                folderPath: folder.folderPath,
                clientEmail: clientEmail,
                error: folderError.message,
                stage: 'process_folder',
              });
            }
          }
        }
      } catch (emailError) {
        for (const folder of folders) {
          failures.push({
            folderId: folder.folderId,
            folderName: folder.folderName,
            folderPath: folder.folderPath,
            email: clientEmail,
            error: emailError.message,
            stage: 'process_email',
          });
        }
      }
    }

    // Step 6: Log all issues to Google Sheets
    try {
      if (failures.length > 0) {
        await logFailuresToSheet(drive, failures);
      }
      if (skipped.length > 0) {
        await logSkippedToSheet(drive, skipped);
      }
      if (multiTransactionFlags.length > 0) {
        await logMultiTransactionFlags(drive, multiTransactionFlags);
      }
    } catch (sheetError) {
      console.error('Failed to log to Google Sheets:', sheetError);
    }

    // Return comprehensive summary
    return res.status(200).json({
      message: 'Upload process completed',
      summary: {
        totalSuccessful: successfulUploads.length,
        totalFailed: failures.length,
        totalSkipped: skipped.length,
        multiTransactionCount: multiTransactionFlags.length,
      },
      successfulUploads,
      failures,
      skipped,
      multiTransactionFlags,
    });
  } catch (error) {
    console.error('Fatal error in run-upload:', error);

    // Log fatal errors to sheet
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
}

/**
 * Authenticates with Google Drive using service account credentials
 */
async function authenticateGoogleDrive() {
  const credentialsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;

  if (!credentialsBase64) {
    throw new Error('GOOGLE_CREDENTIALS_BASE64 environment variable not set');
  }

  // Decode Base64 credentials
  const credentialsJson = Base64.decode(credentialsBase64);
  const credentials = JSON.parse(credentialsJson);

  // Create Google Auth client
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const authClient = await auth.getClient();

  // Return authenticated Drive API instance
  return google.drive({ version: 'v3', auth: authClient });
}

/**
 * Finds all folders containing SISU_ID Google Doc in the Shared Drive
 */
async function findClientFolders(drive) {
  const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;

  if (!driveId) {
    throw new Error('GOOGLE_SHARED_DRIVE_ID environment variable not set');
  }

  // Search for all SISU_ID Google Docs in the Shared Drive
  const response = await drive.files.list({
    q: "name='SISU_ID' and trashed=false and mimeType='application/vnd.google-apps.document'",
    driveId: driveId,
    corpora: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'files(id, name, parents)',
  });

  const sisuIdFiles = response.data.files || [];

  // Get folder information for each SISU_ID file
  const clientFolders = [];

  for (const file of sisuIdFiles) {
    if (file.parents && file.parents.length > 0) {
      const folderId = file.parents[0];

      // Get folder name and build full path
      try {
        const folderResponse = await drive.files.get({
          fileId: folderId,
          fields: 'id, name, parents',
          supportsAllDrives: true,
        });

        // Build full folder path for better tracking
        const folderPath = await buildFolderPath(drive, folderId);

        clientFolders.push({
          folderId: folderId,
          folderName: folderResponse.data.name,
          folderPath: folderPath,
          sisuIdFileId: file.id,
          parents: folderResponse.data.parents || [],
        });
      } catch (error) {
        console.error(`Failed to get folder info for ${folderId}:`, error.message);
      }
    }
  }

  return clientFolders;
}

/**
 * Builds the full folder path from root for display purposes
 */
async function buildFolderPath(drive, folderId) {
  const pathSegments = [];
  let currentId = folderId;
  const maxDepth = 10; // Prevent infinite loops
  let depth = 0;

  try {
    while (currentId && depth < maxDepth) {
      const response = await drive.files.get({
        fileId: currentId,
        fields: 'id, name, parents',
        supportsAllDrives: true,
      });

      pathSegments.unshift(response.data.name);

      if (response.data.parents && response.data.parents.length > 0) {
        currentId = response.data.parents[0];
      } else {
        break;
      }
      depth++;
    }

    return pathSegments.join(' > ');
  } catch (error) {
    return 'Unknown Path';
  }
}

/**
 * Deduplicates folders when SISU_ID exists at multiple levels
 * Prioritizes the HIGHEST level (shortest path) to ensure all files are captured
 */
async function deduplicateFoldersByPriority(drive, allFolders) {
  // Group folders that share the same ancestor hierarchy
  const pathDepths = allFolders.map(folder => ({
    ...folder,
    depth: folder.folderPath.split(' > ').length,
  }));

  // Sort by depth (ascending) - shortest paths first
  pathDepths.sort((a, b) => a.depth - b.depth);

  const selectedFolders = [];
  const processedPaths = new Set();

  for (const folder of pathDepths) {
    // Check if this folder is a descendant of any already-processed folder
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

/**
 * Reads the client email from SISU_ID Google Doc
 */
async function readClientEmail(drive, fileId) {
  try {
    // Export Google Doc as plain text
    const response = await drive.files.export(
      {
        fileId: fileId,
        mimeType: 'text/plain',
      },
      {
        responseType: 'text',
      }
    );

    // Return trimmed email
    return response.data.trim();
  } catch (error) {
    console.error(`Failed to read SISU_ID Google Doc (${fileId}):`, error.message);
    return null;
  }
}

/**
 * Finds all new PDF files (not ending with _UPLOADED.pdf) in a folder and its subfolders
 */
async function findNewPDFs(drive, folderId) {
  const allPdfs = [];

  async function searchFolder(currentFolderId) {
    // Search for PDFs in current folder
    const query = `'${currentFolderId}' in parents and trashed=false and mimeType='application/pdf'`;

    const response = await drive.files.list({
      q: query,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'files(id, name, mimeType)',
    });

    const files = response.data.files || [];

    // Filter for new PDFs (not ending with _UPLOADED.pdf)
    const newPdfs = files.filter(
      (file) => !file.name.endsWith('_UPLOADED.pdf')
    );
    allPdfs.push(...newPdfs);

    // Find subfolders
    const folderQuery = `'${currentFolderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`;

    const folderResponse = await drive.files.list({
      q: folderQuery,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'files(id, name)',
    });

    const subfolders = folderResponse.data.files || [];

    // Recursively search subfolders
    for (const subfolder of subfolders) {
      await searchFolder(subfolder.id);
    }
  }

  await searchFolder(folderId);
  return allPdfs;
}

/**
 * Downloads a file from Google Drive as binary data
 */
async function downloadFile(drive, fileId) {
  const response = await drive.files.get(
    {
      fileId: fileId,
      alt: 'media',
      supportsAllDrives: true,
    },
    { responseType: 'arraybuffer' }
  );

  return Buffer.from(response.data);
}

/**
 * Finds client(s) in SISU by email with retry logic
 * Returns object with found status and array of transactions
 */
async function findSISUClientWithRetry(email, maxRetries = 3) {
  const baseUrl = process.env.SISU_BASE_URL;
  const authHeader = process.env.SISU_AUTH_HEADER;

  if (!baseUrl || !authHeader) {
    throw new Error('SISU_BASE_URL or SISU_AUTH_HEADER environment variable not set');
  }

  const url = `${baseUrl}/client/find-client`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({ email }),
      });

      // If 404, client doesn't exist in SISU (not an error, just skip)
      if (response.status === 404) {
        return {
          found: false,
          error: 'Email not found in SISU',
          transactions: [],
        };
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SISU API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // Handle SISU API response structure: { "clients": [...] }
      let allClients = [];

      if (data.clients && Array.isArray(data.clients)) {
        allClients = data.clients;
      } else if (Array.isArray(data)) {
        allClients = data;
      } else if (data.client_id) {
        // Single client object
        allClients = [data];
      }

      if (allClients.length === 0) {
        return {
          found: false,
          error: 'No clients found for email',
          transactions: [],
        };
      }

      // Filter for ACTIVE transactions only (exclude closed/archived)
      // Active status codes: UCON (under contract), ACTI (active listing), PEND (pending), etc.
      // Exclude: CLOSD (closed), LOST, WITHD (withdrawn), etc.
      const activeClients = allClients.filter(client => {
        const statusCode = client.status_code || client.status || '';
        const status = client.status || '';

        // Exclude closed and inactive statuses
        const inactiveStatuses = ['CLOSD', 'LOST', 'WITHD', 'CANC', 'EXPIR', 'DEAD'];

        return !inactiveStatuses.includes(statusCode) && status !== 'A'; // 'A' = archived
      });

      if (activeClients.length === 0) {
        return {
          found: false,
          error: 'No active transactions found for email (all transactions are closed/inactive)',
          transactions: [],
        };
      }

      // Convert to standardized transaction format
      const transactions = activeClients.map(client => ({
        client_id: client.client_id,
        role: client.type_id === 'b' ? 'buyer' : client.type_id === 's' ? 'seller' : 'unknown',
        property_address: client.address_1 || 'N/A',
        status_code: client.status_code,
      }));

      return {
        found: true,
        transactions: transactions,
      };

    } catch (error) {
      console.error(`SISU lookup attempt ${attempt}/${maxRetries} failed for ${email}:`, error.message);

      // If this was the last attempt, return failure
      if (attempt === maxRetries) {
        return {
          found: false,
          error: `API error after ${maxRetries} attempts: ${error.message}`,
          transactions: [],
        };
      }

      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/**
 * Uploads a document to SISU with retry logic
 */
async function uploadToSISUWithRetry(clientId, filename, fileData, maxRetries = 3) {
  const baseUrl = process.env.SISU_BASE_URL;
  const authHeader = process.env.SISU_AUTH_HEADER;

  if (!baseUrl || !authHeader) {
    throw new Error('SISU_BASE_URL or SISU_AUTH_HEADER environment variable not set');
  }

  // Convert binary data to Base64
  const base64Data = Base64.fromUint8Array(new Uint8Array(fileData));

  const url = `${baseUrl}/client/documents`;

  const payload = {
    client_id: clientId,
    filename: filename,
    data: base64Data,
    file_extension: 'pdf',
    file_type: 'pdf',
    content_type: 'application/pdf',
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SISU API returned ${response.status}: ${errorText}`);
      }

      return await response.json();

    } catch (error) {
      console.error(`Upload attempt ${attempt}/${maxRetries} failed for ${filename}:`, error.message);

      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw new Error(`Upload failed after ${maxRetries} attempts: ${error.message}`);
      }

      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/**
 * Renames a file in Google Drive to mark it as uploaded
 */
async function renameFileAsUploaded(drive, fileId, currentName) {
  // Remove .pdf extension and add _UPLOADED.pdf
  const nameWithoutExt = currentName.replace(/\.pdf$/i, '');
  const newName = `${nameWithoutExt}_UPLOADED.pdf`;

  await drive.files.update({
    fileId: fileId,
    requestBody: {
      name: newName,
    },
    supportsAllDrives: true,
  });
}

/**
 * Logs failures to a Google Sheet in the Shared Drive
 */
async function logFailuresToSheet(drive, failures) {
  const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;
  const sheetName = 'SISU_Upload_Errors';

  // Search for existing error log sheet
  const searchResponse = await drive.files.list({
    q: `name='${sheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    driveId: driveId,
    corpora: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'files(id, name)',
  });

  let sheetId;

  if (searchResponse.data.files && searchResponse.data.files.length > 0) {
    // Use existing sheet
    sheetId = searchResponse.data.files[0].id;
  } else {
    // Create new sheet in the Shared Drive
    const createResponse = await drive.files.create({
      requestBody: {
        name: sheetName,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [driveId],
      },
      supportsAllDrives: true,
      fields: 'id',
    });
    sheetId = createResponse.data.id;

    // Initialize with headers using Google Sheets API
    const sheets = google.sheets({ version: 'v4', auth: drive.context._options.auth });
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'Errors!A1:I1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['Timestamp', 'Stage', 'Folder Path', 'Folder ID', 'File Name', 'File ID', 'Client Email', 'SISU Client ID', 'Error'],
        ],
      },
    });
  }

  // Append failure data
  const sheets = google.sheets({ version: 'v4', auth: drive.context._options.auth });
  const timestamp = new Date().toISOString();

  const rows = failures.map((failure) => [
    timestamp,
    failure.stage || 'unknown',
    failure.folderPath || failure.folderName || '',
    failure.folderId || '',
    failure.fileName || '',
    failure.fileId || '',
    failure.clientEmail || failure.email || '',
    failure.sisuClientId || '',
    failure.error || failure.stack || '',
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Errors!A:I',
    valueInputOption: 'RAW',
    requestBody: {
      values: rows,
    },
  });
}

/**
 * Logs skipped folders to a Google Sheet
 */
async function logSkippedToSheet(drive, skipped) {
  const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;
  const sheetName = 'SISU_Upload_Errors';

  // Find or create sheet
  const searchResponse = await drive.files.list({
    q: `name='${sheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    driveId: driveId,
    corpora: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'files(id, name)',
  });

  let sheetId;
  if (searchResponse.data.files && searchResponse.data.files.length > 0) {
    sheetId = searchResponse.data.files[0].id;
  } else {
    const createResponse = await drive.files.create({
      requestBody: {
        name: sheetName,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [driveId],
      },
      supportsAllDrives: true,
      fields: 'id',
    });
    sheetId = createResponse.data.id;
  }

  const sheets = google.sheets({ version: 'v4', auth: drive.context._options.auth });

  // Check if Skipped sheet exists, create if not
  try {
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
    });

    const skippedSheetExists = spreadsheet.data.sheets.some(
      sheet => sheet.properties.title === 'Skipped'
    );

    if (!skippedSheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: 'Skipped' },
            },
          }],
        },
      });

      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'Skipped!A1:F1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Timestamp', 'Folder Path', 'Folder ID', 'Email', 'Reason', 'Details']],
        },
      });
    }
  } catch (error) {
    console.error('Error checking/creating Skipped sheet:', error);
  }

  const timestamp = new Date().toISOString();
  const rows = skipped.map((item) => [
    timestamp,
    item.folderPath || item.folderName || '',
    item.folderId || '',
    item.email || '',
    item.reason || '',
    item.details || '',
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Skipped!A:F',
    valueInputOption: 'RAW',
    requestBody: {
      values: rows,
    },
  });
}

/**
 * Logs multi-transaction flags to a Google Sheet for manual review
 */
async function logMultiTransactionFlags(drive, flags) {
  const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;
  const sheetName = 'SISU_Upload_Errors';

  // Find or create sheet
  const searchResponse = await drive.files.list({
    q: `name='${sheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    driveId: driveId,
    corpora: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'files(id, name)',
  });

  let sheetId;
  if (searchResponse.data.files && searchResponse.data.files.length > 0) {
    sheetId = searchResponse.data.files[0].id;
  } else {
    const createResponse = await drive.files.create({
      requestBody: {
        name: sheetName,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [driveId],
      },
      supportsAllDrives: true,
      fields: 'id',
    });
    sheetId = createResponse.data.id;
  }

  const sheets = google.sheets({ version: 'v4', auth: drive.context._options.auth });

  // Check if Multi-Transaction sheet exists, create if not
  try {
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
    });

    const flagSheetExists = spreadsheet.data.sheets.some(
      sheet => sheet.properties.title === 'Multi-Transaction Flags'
    );

    if (!flagSheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: 'Multi-Transaction Flags' },
            },
          }],
        },
      });

      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'Multi-Transaction Flags!A1:F1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Timestamp', 'Email', 'Transaction Count', 'Transaction Details', 'Folder Paths', 'Action Required']],
        },
      });
    }
  } catch (error) {
    console.error('Error checking/creating Multi-Transaction Flags sheet:', error);
  }

  const timestamp = new Date().toISOString();
  const rows = flags.map((flag) => [
    timestamp,
    flag.email || '',
    flag.transactionCount || 0,
    JSON.stringify(flag.transactions),
    flag.folders.map(f => f.folderPath).join(' | '),
    'MANUAL REVIEW REQUIRED',
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Multi-Transaction Flags!A:F',
    valueInputOption: 'RAW',
    requestBody: {
      values: rows,
    },
  });
}


// Allow long execution time for Render deployment
export const config = {
  maxDuration: 300, // 5 minutes
};
