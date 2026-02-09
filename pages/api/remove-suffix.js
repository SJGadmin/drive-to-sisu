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

async function findSISUIDFiles(drive) {
  const underContractFolderId = process.env.UNDER_CONTRACT_FOLDER_ID || '11LsP1nSsjcHDhJkJHg-Bt2Nh325iOHLr';

  // List subfolders of Under Contract (5-20 results)
  const foldersResponse = await drive.files.list({
    q: `'${underContractFolderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'files(id, name)',
    orderBy: 'name',
  });

  const subfolders = foldersResponse.data.files || [];
  const sisuIdFiles = [];

  // Check each subfolder for a SISU_ID doc
  for (const folder of subfolders) {
    const sisuIdResponse = await drive.files.list({
      q: `name='SISU_ID' and '${folder.id}' in parents and trashed=false and mimeType='application/vnd.google-apps.document'`,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'files(id, name)',
    });

    const files = sisuIdResponse.data.files || [];
    if (files.length > 0) {
      sisuIdFiles.push({
        id: files[0].id,
        name: files[0].name,
        parents: [folder.id],
      });
    }
  }

  return sisuIdFiles;
}

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
    return null;
  }
}

async function findUploadedPDFs(drive, folderId) {
  const allPdfs = [];

  async function searchFolder(currentFolderId) {
    const query = `'${currentFolderId}' in parents and trashed=false and mimeType='application/pdf' and name contains '_UPLOADED.pdf'`;

    const response = await drive.files.list({
      q: query,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'files(id, name, mimeType)',
    });

    const files = response.data.files || [];
    allPdfs.push(...files);

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
    const { transactionId } = req.body;

    if (!transactionId || !transactionId.trim()) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    const targetId = transactionId.trim();

    const drive = await getGoogleDriveAuth();

    // Find all SISU_ID files in Under Contract folder
    const sisuIdFiles = await findSISUIDFiles(drive);

    let totalRenamed = 0;
    let foldersProcessed = 0;

    for (const sisuIdFile of sisuIdFiles) {
      const fileTransactionId = await readTransactionId(drive, sisuIdFile.id);

      if (fileTransactionId !== targetId) {
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
      transactionId: targetId,
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
