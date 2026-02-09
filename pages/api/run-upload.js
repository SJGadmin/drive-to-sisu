import { google } from 'googleapis';
import { Base64 } from 'js-base64';

/**
 * Next.js API Route: SISU Document Automation
 * Automatically checks Google Drive for new client documents (.pdf),
 * retrieves SISU transaction IDs from SISU_ID documents, and uploads
 * documents directly to the matching SISU transaction.
 *
 * Edge Cases Handled:
 * 1. Empty SISU_ID files (skipped)
 * 2. Invalid transaction IDs (skipped with logging)
 * 3. Nested SISU_ID files (prioritizes highest level)
 * 4. Comprehensive error handling and retry logic
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const successfulUploads = [];
    const failures = [];
    const skipped = [];

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

    const clientFolders = allClientFolders;

    console.log(`Found ${clientFolders.length} folders with SISU_ID in Under Contract`);

    // Step 4: Process each folder - read transaction ID and upload PDFs
    for (const folder of clientFolders) {
      try {
        // Read transaction ID from SISU_ID Google Doc
        const transactionId = await readTransactionId(drive, folder.sisuIdFileId);

        // Skip empty SISU_ID files
        if (!transactionId || transactionId.trim() === '') {
          skipped.push({
            folderId: folder.folderId,
            folderName: folder.folderName,
            folderPath: folder.folderPath,
            reason: 'SISU_ID file is empty',
          });
          console.log(`⏭️  Skipped (empty): ${folder.folderPath}`);
          continue;
        }

        const clientId = parseInt(transactionId.trim(), 10);

        if (isNaN(clientId)) {
          skipped.push({
            folderId: folder.folderId,
            folderName: folder.folderName,
            folderPath: folder.folderPath,
            reason: `Invalid transaction ID: "${transactionId.trim()}"`,
          });
          console.log(`⏭️  Skipped (invalid ID): ${folder.folderPath} - "${transactionId.trim()}"`);
          continue;
        }

        // Find all new PDFs in this folder and subfolders
        const pdfs = await findNewPDFs(drive, folder.folderId);

        if (pdfs.length === 0) {
          console.log(`📭 No new PDFs in ${folder.folderPath}`);
          continue;
        }

        console.log(`📄 Found ${pdfs.length} PDF(s) in ${folder.folderPath}`);

        // Upload each PDF directly to the SISU transaction
        for (const pdf of pdfs) {
          try {
            const fileData = await downloadFile(drive, pdf.id);
            await uploadToSISUWithRetry(clientId, pdf.name, fileData);
            await renameFileAsUploaded(drive, pdf.id, pdf.name);

            successfulUploads.push({
              driveFileId: pdf.id,
              driveFileName: pdf.name,
              sisuClientId: clientId,
              folderPath: folder.folderPath,
            });

            console.log(`✅ Uploaded: ${pdf.name} to transaction ${clientId}`);

          } catch (uploadError) {
            failures.push({
              folderId: folder.folderId,
              folderName: folder.folderName,
              folderPath: folder.folderPath,
              fileName: pdf.name,
              fileId: pdf.id,
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
          error: folderError.message,
          stage: 'process_folder',
        });
      }
    }

    // Step 5: Log all issues to Google Sheets
    try {
      if (failures.length > 0) {
        await logFailuresToSheet(drive, failures);
      }
      if (skipped.length > 0) {
        await logSkippedToSheet(drive, skipped);
      }
    } catch (sheetError) {
      console.error('Failed to log to Google Sheets:', sheetError);
    }

    return res.status(200).json({
      message: 'Upload process completed',
      summary: {
        totalSuccessful: successfulUploads.length,
        totalFailed: failures.length,
        totalSkipped: skipped.length,
      },
      successfulUploads,
      failures,
      skipped,
    });
  } catch (error) {
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
}

/**
 * Authenticates with Google Drive using service account credentials
 */
async function authenticateGoogleDrive() {
  const credentialsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;

  if (!credentialsBase64) {
    throw new Error('GOOGLE_CREDENTIALS_BASE64 environment variable not set');
  }

  const credentialsJson = Base64.decode(credentialsBase64);
  const credentials = JSON.parse(credentialsJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const authClient = await auth.getClient();
  return google.drive({ version: 'v3', auth: authClient });
}

/**
 * Finds all folders containing SISU_ID Google Doc in the Under Contract folder
 * Only searches the specific folder where active transactions live (5-20 subfolders)
 */
async function findClientFolders(drive) {
  const underContractFolderId = process.env.UNDER_CONTRACT_FOLDER_ID || '11LsP1nSsjcHDhJkJHg-Bt2Nh325iOHLr';

  // Step 1: List subfolders of Under Contract (1 API call, 5-20 results)
  const foldersResponse = await drive.files.list({
    q: `'${underContractFolderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'files(id, name)',
    orderBy: 'name',
  });

  const subfolders = foldersResponse.data.files || [];
  const clientFolders = [];

  // Step 2: Check each subfolder for a SISU_ID doc (5-20 API calls)
  for (const folder of subfolders) {
    const sisuIdResponse = await drive.files.list({
      q: `name='SISU_ID' and '${folder.id}' in parents and trashed=false and mimeType='application/vnd.google-apps.document'`,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'files(id, name)',
    });

    const sisuIdFiles = sisuIdResponse.data.files || [];

    if (sisuIdFiles.length > 0) {
      clientFolders.push({
        folderId: folder.id,
        folderName: folder.name,
        folderPath: `*Under Contract > ${folder.name}`,
        sisuIdFileId: sisuIdFiles[0].id,
      });
    }
  }

  return clientFolders;
}

/**
 * Reads the SISU transaction ID from SISU_ID Google Doc
 */
async function readTransactionId(drive, fileId) {
  try {
    const response = await drive.files.export(
      {
        fileId: fileId,
        mimeType: 'text/plain',
      },
      {
        responseType: 'text',
      }
    );

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
    const query = `'${currentFolderId}' in parents and trashed=false and mimeType='application/pdf'`;

    const response = await drive.files.list({
      q: query,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'files(id, name, mimeType)',
    });

    const files = response.data.files || [];

    const newPdfs = files.filter(
      (file) => !file.name.endsWith('_UPLOADED.pdf')
    );
    allPdfs.push(...newPdfs);

    const folderQuery = `'${currentFolderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`;

    const folderResponse = await drive.files.list({
      q: folderQuery,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'files(id, name)',
    });

    const subfolders = folderResponse.data.files || [];

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
 * Uploads a document to SISU with retry logic
 */
async function uploadToSISUWithRetry(clientId, filename, fileData, maxRetries = 3) {
  const baseUrl = process.env.SISU_BASE_URL;
  const authHeader = process.env.SISU_AUTH_HEADER;

  if (!baseUrl || !authHeader) {
    throw new Error('SISU_BASE_URL or SISU_AUTH_HEADER environment variable not set');
  }

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

      if (attempt === maxRetries) {
        throw new Error(`Upload failed after ${maxRetries} attempts: ${error.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/**
 * Renames a file in Google Drive to mark it as uploaded
 */
async function renameFileAsUploaded(drive, fileId, currentName) {
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

    const sheets = google.sheets({ version: 'v4', auth: drive.context._options.auth });
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'Errors!A1:H1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['Timestamp', 'Stage', 'Folder Path', 'Folder ID', 'File Name', 'File ID', 'SISU Client ID', 'Error'],
        ],
      },
    });
  }

  const sheets = google.sheets({ version: 'v4', auth: drive.context._options.auth });
  const timestamp = new Date().toISOString();

  const rows = failures.map((failure) => [
    timestamp,
    failure.stage || 'unknown',
    failure.folderPath || failure.folderName || '',
    failure.folderId || '',
    failure.fileName || '',
    failure.fileId || '',
    failure.sisuClientId || '',
    failure.error || failure.stack || '',
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Errors!A:H',
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

      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'Skipped!A1:E1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Timestamp', 'Folder Path', 'Folder ID', 'Reason', 'Details']],
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
    item.reason || '',
    item.details || '',
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Skipped!A:E',
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
