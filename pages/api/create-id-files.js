require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');
const { Base64 } = require('js-base64');

async function getGoogleDriveAuth() {
  const credentialsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;
  const credentialsJson = Base64.decode(credentialsBase64);
  const credentials = JSON.parse(credentialsJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const authClient = await auth.getClient();
  return google.drive({ version: 'v3', auth: authClient });
}

async function getFolders(drive, parentId) {
  const query = `'${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`;

  const response = await drive.files.list({
    q: query,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'files(id, name)',
    orderBy: 'name',
  });

  return response.data.files || [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const drive = await getGoogleDriveAuth();
    const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;

    const foldersToProcess = [];

    // 1. Find Buyers > [Agent] > [Client] folders
    const buyersFolderId = '1jzK8gXiqoL13kOBoAJ0_zQaBdWAcyHoj';
    const agentFolders = await getFolders(drive, buyersFolderId);

    for (const agent of agentFolders) {
      const clientFolders = await getFolders(drive, agent.id);
      for (const client of clientFolders) {
        foldersToProcess.push({
          path: `*Buyers > ${agent.name} > ${client.name}`,
          folderId: client.id,
          folderName: client.name,
        });
      }
    }

    // 2. Find Listings > *Active > [Properties]
    const listingsFolderId = '1s69KjtZWhNaJ9Pg_yngo9joRUK4kG2Dq';
    const listingsSubfolders = await getFolders(drive, listingsFolderId);
    const activeListingsFolder = listingsSubfolders.find(f => f.name === '*Active');

    if (activeListingsFolder) {
      const propertyFolders = await getFolders(drive, activeListingsFolder.id);
      for (const property of propertyFolders) {
        foldersToProcess.push({
          path: `*Listings > *Active > ${property.name}`,
          folderId: property.id,
          folderName: property.name,
        });
      }
    }

    // 3. Find Under Contract > [Properties]
    const underContractFolderId = '11LsP1nSsjcHDhJkJHg-Bt2Nh325iOHLr';
    const propertyFolders = await getFolders(drive, underContractFolderId);

    for (const property of propertyFolders) {
      foldersToProcess.push({
        path: `*Under Contract > ${property.name}`,
        folderId: property.id,
        folderName: property.name,
      });
    }

    // Create the files
    const created = [];
    const skipped = [];
    const errors = [];

    for (let i = 0; i < foldersToProcess.length; i++) {
      const folder = foldersToProcess[i];

      try {
        // Check if SISU_ID already exists (Google Doc)
        const existingCheck = await drive.files.list({
          q: `name='SISU_ID' and '${folder.folderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.document'`,
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          fields: 'files(id, name)',
        });

        if (existingCheck.data.files && existingCheck.data.files.length > 0) {
          skipped.push(folder);
        } else {
          // Create blank Google Doc named SISU_ID
          const fileMetadata = {
            name: 'SISU_ID',
            mimeType: 'application/vnd.google-apps.document',
            parents: [folder.folderId],
          };

          await drive.files.create({
            requestBody: fileMetadata,
            supportsAllDrives: true,
            fields: 'id, name',
          });

          created.push(folder);
        }
      } catch (error) {
        errors.push({ folder, error: error.message });
      }
    }

    return res.status(200).json({
      success: true,
      created: created.length,
      skipped: skipped.length,
      errors: errors.length,
      totalProcessed: foldersToProcess.length,
    });

  } catch (error) {
    console.error('Error creating ID files:', error);
    return res.status(500).json({
      error: error.message || 'Failed to create ID files'
    });
  }
}
