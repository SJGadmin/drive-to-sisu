import { google } from 'googleapis';
import { Base64 } from 'js-base64';

/**
 * Next.js API Route: SISU Document Automation
 * Automatically checks Google Drive for new client documents (.pdf),
 * retrieves client identifiers, and uploads documents to SISU platform.
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

    // Step 1: Authenticate with Google Drive
    const drive = await authenticateGoogleDrive();

    // Step 2: Find all client folders (those containing SISU_ID.txt)
    const clientFolders = await findClientFolders(drive);

    if (clientFolders.length === 0) {
      return res.status(200).json({
        message: 'No client folders found with SISU_ID.txt',
        successfulUploads: [],
        failures: [],
      });
    }

    // Step 3: Process each client folder
    for (const folder of clientFolders) {
      try {
        // Read client email from SISU_ID.txt
        const clientEmail = await readClientEmail(drive, folder.sisuIdFileId);

        if (!clientEmail) {
          failures.push({
            folderId: folder.folderId,
            folderName: folder.folderName,
            error: 'SISU_ID.txt is empty or unreadable',
          });
          continue;
        }

        // Find client in SISU
        const clientId = await findSISUClient(clientEmail);

        if (!clientId) {
          failures.push({
            folderId: folder.folderId,
            folderName: folder.folderName,
            email: clientEmail,
            error: 'Client not found in SISU or API error',
          });
          continue;
        }

        // Find all PDFs in this folder and subfolders
        const pdfs = await findNewPDFs(drive, folder.folderId);

        // Upload each PDF to SISU
        for (const pdf of pdfs) {
          try {
            // Download PDF from Google Drive
            const fileData = await downloadFile(drive, pdf.id);

            // Upload to SISU
            await uploadToSISU(clientId, pdf.name, fileData);

            // Rename file in Google Drive to mark as uploaded
            await renameFileAsUploaded(drive, pdf.id, pdf.name);

            successfulUploads.push({
              driveFileId: pdf.id,
              driveFileName: pdf.name,
              sisuClientId: clientId,
              clientEmail: clientEmail,
            });
          } catch (uploadError) {
            failures.push({
              folderId: folder.folderId,
              folderName: folder.folderName,
              fileName: pdf.name,
              fileId: pdf.id,
              clientEmail: clientEmail,
              error: uploadError.message,
            });
          }
        }
      } catch (folderError) {
        failures.push({
          folderId: folder.folderId,
          folderName: folder.folderName,
          error: folderError.message,
        });
      }
    }

    // Log failures to Google Sheet if any exist
    if (failures.length > 0) {
      try {
        await logFailuresToSheet(drive, failures);
      } catch (sheetError) {
        console.error('Failed to log errors to Google Sheet:', sheetError);
      }
    }

    // Return summary
    return res.status(200).json({
      message: 'Upload process completed',
      summary: {
        totalSuccessful: successfulUploads.length,
        totalFailed: failures.length,
      },
      successfulUploads,
      failures,
    });
  } catch (error) {
    console.error('Fatal error in run-upload:', error);
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
 * Finds all folders containing SISU_ID.txt in the Shared Drive
 */
async function findClientFolders(drive) {
  const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;

  if (!driveId) {
    throw new Error('GOOGLE_SHARED_DRIVE_ID environment variable not set');
  }

  // Search for all SISU_ID.txt files in the Shared Drive
  const response = await drive.files.list({
    q: "name='SISU_ID.txt' and trashed=false",
    driveId: driveId,
    corpora: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'files(id, name, parents)',
  });

  const sisuIdFiles = response.data.files || [];

  // Get folder information for each SISU_ID.txt file
  const clientFolders = [];

  for (const file of sisuIdFiles) {
    if (file.parents && file.parents.length > 0) {
      const folderId = file.parents[0];

      // Get folder name
      try {
        const folderResponse = await drive.files.get({
          fileId: folderId,
          fields: 'id, name',
          supportsAllDrives: true,
        });

        clientFolders.push({
          folderId: folderId,
          folderName: folderResponse.data.name,
          sisuIdFileId: file.id,
        });
      } catch (error) {
        console.error(`Failed to get folder info for ${folderId}:`, error.message);
      }
    }
  }

  return clientFolders;
}

/**
 * Reads the client email from SISU_ID.txt
 */
async function readClientEmail(drive, fileId) {
  try {
    const response = await drive.files.get(
      {
        fileId: fileId,
        alt: 'media',
        supportsAllDrives: true,
      },
      { responseType: 'text' }
    );

    // Return trimmed email
    return response.data.trim();
  } catch (error) {
    console.error(`Failed to read SISU_ID.txt (${fileId}):`, error.message);
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
 * Finds a client in SISU by email and returns their client_id
 */
async function findSISUClient(email) {
  const baseUrl = process.env.SISU_BASE_URL;
  const authHeader = process.env.SISU_AUTH_HEADER;

  if (!baseUrl || !authHeader) {
    throw new Error('SISU_BASE_URL or SISU_AUTH_HEADER environment variable not set');
  }

  const url = `${baseUrl}/client/find-client`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SISU find-client failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Extract client_id from response
  // Based on the API docs, assuming the response contains client_id at root or in a data object
  const clientId = data.client_id || data.data?.client_id || data.id;

  if (!clientId) {
    console.error('SISU response did not contain client_id:', data);
    return null;
  }

  return clientId;
}

/**
 * Uploads a document to SISU
 */
async function uploadToSISU(clientId, filename, fileData) {
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
    throw new Error(`SISU document upload failed: ${response.status} - ${errorText}`);
  }

  return await response.json();
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
      range: 'Sheet1!A1:G1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['Timestamp', 'Folder ID', 'Folder Name', 'File ID', 'File Name', 'Client Email', 'Error'],
        ],
      },
    });
  }

  // Append failure data
  const sheets = google.sheets({ version: 'v4', auth: drive.context._options.auth });
  const timestamp = new Date().toISOString();

  const rows = failures.map((failure) => [
    timestamp,
    failure.folderId || '',
    failure.folderName || '',
    failure.fileId || '',
    failure.fileName || '',
    failure.clientEmail || failure.email || '',
    failure.error || '',
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Sheet1!A:G',
    valueInputOption: 'RAW',
    requestBody: {
      values: rows,
    },
  });
}
