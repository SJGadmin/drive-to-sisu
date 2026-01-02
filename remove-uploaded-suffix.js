require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');

/**
 * Script to remove _UPLOADED.pdf suffix from files for a specific client email
 * Usage: node remove-uploaded-suffix.js <email>
 * Example: node remove-uploaded-suffix.js travisraabe@gmail.com
 */

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

async function getFolderPath(drive, folderId, sharedDriveId) {
  const parts = [];
  let currentId = folderId;

  while (currentId && currentId !== sharedDriveId) {
    const response = await drive.files.get({
      fileId: currentId,
      fields: 'name, parents',
      supportsAllDrives: true,
    });

    parts.unshift(response.data.name);
    currentId = response.data.parents ? response.data.parents[0] : null;
  }

  return 'Drive > ' + parts.join(' > ');
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

async function main() {
  const targetEmail = process.argv[2];

  if (!targetEmail) {
    console.error('\n❌ Error: Email address required!');
    console.error('\nUsage: node remove-uploaded-suffix.js <email>');
    console.error('Example: node remove-uploaded-suffix.js travisraabe@gmail.com\n');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`🔄 Removing _UPLOADED suffix for: ${targetEmail}`);
  console.log('='.repeat(60) + '\n');

  const drive = await getGoogleDriveAuth();
  const sharedDriveId = process.env.GOOGLE_SHARED_DRIVE_ID;

  // Find all SISU_ID files
  console.log('📂 Finding SISU_ID files...');
  const sisuIdFiles = await findSISUIDFiles(drive, sharedDriveId);
  console.log(`   Found ${sisuIdFiles.length} SISU_ID files\n`);

  let totalRenamed = 0;
  let foldersProcessed = 0;

  for (const sisuIdFile of sisuIdFiles) {
    const email = await readClientEmail(drive, sisuIdFile.id);

    if (email !== targetEmail) {
      continue;
    }

    const folderId = sisuIdFile.parents[0];
    const folderPath = await getFolderPath(drive, folderId, sharedDriveId);

    console.log(`📁 Processing: ${folderPath}`);
    foldersProcessed++;

    // Find all PDFs with _UPLOADED suffix in this folder and subfolders
    const uploadedPdfs = await findUploadedPDFs(drive, folderId);

    if (uploadedPdfs.length === 0) {
      console.log(`   ℹ️  No _UPLOADED files found\n`);
      continue;
    }

    console.log(`   📄 Found ${uploadedPdfs.length} file(s) with _UPLOADED suffix`);

    for (const pdf of uploadedPdfs) {
      try {
        const newName = await removeUploadedSuffix(drive, pdf.id, pdf.name);
        console.log(`   ✅ Renamed: ${pdf.name} → ${newName}`);
        totalRenamed++;
      } catch (error) {
        console.log(`   ❌ Failed to rename ${pdf.name}: ${error.message}`);
      }
    }

    console.log('');
  }

  console.log('='.repeat(60));
  console.log('✅ COMPLETE!');
  console.log('='.repeat(60));
  console.log(`Folders processed: ${foldersProcessed}`);
  console.log(`Files renamed: ${totalRenamed}`);
  console.log('='.repeat(60) + '\n');

  if (totalRenamed > 0) {
    console.log('✨ Files are now ready to be uploaded again!\n');
  } else if (foldersProcessed === 0) {
    console.log(`⚠️  No folders found for email: ${targetEmail}\n`);
  }
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
