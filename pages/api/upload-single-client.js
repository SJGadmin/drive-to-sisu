import { google } from 'googleapis';
import { Base64 } from 'js-base64';

/**
 * Next.js API Route: Single Transaction Upload
 * Searches for a specific SISU transaction ID in SISU_ID documents
 * and uploads only that transaction's documents.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { transactionId } = req.body;

  if (!transactionId || typeof transactionId !== 'string') {
    return res.status(400).json({ error: 'Transaction ID is required' });
  }

  const targetId = transactionId.trim();
  const clientId = parseInt(targetId, 10);

  if (isNaN(clientId)) {
    return res.status(400).json({ error: 'Transaction ID must be a number' });
  }

  try {
    // Step 1: Authenticate with Google Drive
    const drive = await authenticateGoogleDrive();

    // Step 2: Verify transaction exists in SISU
    const sisuClient = await verifySISUTransaction(clientId);

    if (!sisuClient) {
      return res.status(404).json({
        error: 'Transaction ID not found in SISU',
        transactionId: targetId,
      });
    }

    const address = sisuClient.address_1 || 'N/A';

    // Step 3: Find the folder with matching transaction ID in SISU_ID doc
    const allClientFolders = await findClientFolders(drive);

    let matchedFolder = null;

    for (const folder of allClientFolders) {
      try {
        const folderTransactionId = await readTransactionId(drive, folder.sisuIdFileId);

        if (folderTransactionId && folderTransactionId.trim() === targetId) {
          matchedFolder = folder;
          break;
        }
      } catch (error) {
        console.error(`Failed to read SISU_ID for folder ${folder.folderId}:`, error.message);
      }
    }

    if (!matchedFolder) {
      return res.status(404).json({
        error: 'No folder found with SISU_ID matching this transaction ID',
        transactionId: targetId,
      });
    }

    console.log(`Found matching folder: ${matchedFolder.folderPath}`);

    // Step 4: Upload documents
    const successfulUploads = [];
    const failures = [];

    const pdfs = await findNewPDFs(drive, matchedFolder.folderId);

    if (pdfs.length === 0) {
      return res.status(200).json({
        message: 'No new documents found for this transaction',
        transactionId: targetId,
        address,
        documentsUploaded: 0,
      });
    }

    console.log(`Found ${pdfs.length} PDF(s) to upload`);

    for (const pdf of pdfs) {
      try {
        const fileData = await downloadFile(drive, pdf.id);
        await uploadToSISUWithRetry(clientId, pdf.name, fileData);
        await renameFileAsUploaded(drive, pdf.id, pdf.name);

        successfulUploads.push({
          driveFileId: pdf.id,
          driveFileName: pdf.name,
          sisuClientId: clientId,
          folderPath: matchedFolder.folderPath,
        });

        console.log(`✅ Uploaded: ${pdf.name}`);

      } catch (uploadError) {
        failures.push({
          fileName: pdf.name,
          fileId: pdf.id,
          error: uploadError.message,
        });
        console.error(`❌ Failed: ${pdf.name} - ${uploadError.message}`);
      }
    }

    // Step 5: Log results to Google Sheets
    try {
      if (failures.length > 0) {
        await logFailuresToSheet(drive, failures.map(f => ({
          ...f,
          folderId: matchedFolder.folderId,
          folderPath: matchedFolder.folderPath,
          sisuClientId: clientId,
          stage: 'upload_to_sisu',
        })));
      }
    } catch (sheetError) {
      console.error('Failed to log to Google Sheets:', sheetError);
    }

    return res.status(200).json({
      message: 'Single transaction upload completed',
      transactionId: targetId,
      address,
      documentsUploaded: successfulUploads.length,
      documentsFailed: failures.length,
      successfulUploads,
      failures,
    });

  } catch (error) {
    console.error('Error in upload-single-client:', error);
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
 * Verifies a transaction exists in SISU by client_id
 * Returns the client object if found, null otherwise
 */
async function verifySISUTransaction(clientId) {
  const baseUrl = process.env.SISU_BASE_URL;
  const authHeader = process.env.SISU_AUTH_HEADER;

  if (!baseUrl || !authHeader) {
    throw new Error('SISU_BASE_URL or SISU_AUTH_HEADER environment variable not set');
  }

  const url = `${baseUrl}/client/find-client`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ client_id: clientId }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    let clients = [];
    if (data.clients && Array.isArray(data.clients)) {
      clients = data.clients;
    } else if (Array.isArray(data)) {
      clients = data;
    } else if (data.client_id) {
      clients = [data];
    }

    return clients.length > 0 ? clients[0] : null;

  } catch (error) {
    console.error(`Failed to verify SISU transaction ${clientId}:`, error.message);
    return null;
  }
}

/**
 * Finds all folders containing SISU_ID Google Doc in the Shared Drive
 */
async function findClientFolders(drive) {
  const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;

  if (!driveId) {
    throw new Error('GOOGLE_SHARED_DRIVE_ID environment variable not set');
  }

  const response = await drive.files.list({
    q: "name='SISU_ID' and trashed=false and mimeType='application/vnd.google-apps.document'",
    driveId: driveId,
    corpora: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'files(id, name, parents)',
  });

  const sisuIdFiles = response.data.files || [];
  const clientFolders = [];

  for (const file of sisuIdFiles) {
    if (file.parents && file.parents.length > 0) {
      const folderId = file.parents[0];

      try {
        const folderResponse = await drive.files.get({
          fileId: folderId,
          fields: 'id, name, parents',
          supportsAllDrives: true,
        });

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
  const maxDepth = 10;
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
 * Reads the transaction ID from SISU_ID Google Doc
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
    failure.stage || 'single_client_upload',
    failure.folderPath || failure.folderName || '',
    failure.folderId || '',
    failure.fileName || '',
    failure.fileId || '',
    failure.sisuClientId || '',
    failure.error || '',
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

// Allow long execution time for Render deployment
export const config = {
  maxDuration: 300, // 5 minutes
};
