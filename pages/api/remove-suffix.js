require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');

async function getGoogleDriveAuth() {
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8')
  );

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
}

async function findSISUIDFiles(drive, sharedDriveId) {
  const response = await drive.files.list({
    q: `name='SISU_ID' and mimeType='application/vnd.google-apps.document' and trashed=false`,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    corpora: 'drive',
    driveId: sharedDriveId,
    fields: 'files(id, name, parents)',
  });

  return response.data.files || [];
}

async function readClientEmail(drive, fileId) {
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
    return null;
  }
}

async function findUploadedPDFs(drive, folderId) {
  const allPdfs = [];

  async function searchFolder(currentFolderId) {
    // Search for PDFs with _UPLOADED suffix
    const query = `'${currentFolderId}' in parents and trashed=false and mimeType='application/pdf' and name contains '_UPLOADED.pdf'`;

    const response = await drive.files.list({
      q: query,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'files(id, name, mimeType)',
    });

    const files = response.data.files || [];
    allPdfs.push(...files);

    // Search subfolders
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

async function removeUploadedSuffix(drive, fileId, currentName) {
  const newName = currentName.replace(/_UPLOADED\.pdf$/i, '.pdf');

  await drive.files.update({
    fileId: fileId,
    requestBody: {
      name: newName,
    },
    supportsAllDrives: true,
  });

  return newName;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const targetEmail = email.trim();

    const drive = await getGoogleDriveAuth();
    const sharedDriveId = process.env.GOOGLE_SHARED_DRIVE_ID;

    // Find all SISU_ID files
    const sisuIdFiles = await findSISUIDFiles(drive, sharedDriveId);

    let totalRenamed = 0;
    let foldersProcessed = 0;

    for (const sisuIdFile of sisuIdFiles) {
      const clientEmail = await readClientEmail(drive, sisuIdFile.id);

      if (clientEmail !== targetEmail) {
        continue;
      }

      const folderId = sisuIdFile.parents[0];
      foldersProcessed++;

      // Find all PDFs with _UPLOADED suffix in this folder and subfolders
      const uploadedPdfs = await findUploadedPDFs(drive, folderId);

      if (uploadedPdfs.length === 0) {
        continue;
      }

      for (const pdf of uploadedPdfs) {
        try {
          await removeUploadedSuffix(drive, pdf.id, pdf.name);
          totalRenamed++;
        } catch (error) {
          console.error(`Failed to rename ${pdf.name}: ${error.message}`);
        }
      }
    }

    return res.status(200).json({
      success: true,
      foldersProcessed,
      filesRenamed: totalRenamed,
    });

  } catch (error) {
    console.error('Error removing suffix:', error);
    return res.status(500).json({
      error: error.message || 'Failed to remove suffix'
    });
  }
}
