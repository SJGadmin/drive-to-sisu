import { google } from 'googleapis';
import { Base64 } from 'js-base64';

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
    // Authenticate with Google Drive
    const credentialsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;
    const credentialsJson = Base64.decode(credentialsBase64);
    const credentials = JSON.parse(credentialsJson);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const authClient = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient });

    const buyersFolderId = '1jzK8gXiqoL13kOBoAJ0_zQaBdWAcyHoj';
    const listingsFolderId = '1s69KjtZWhNaJ9Pg_yngo9joRUK4kG2Dq';
    const underContractFolderId = '11LsP1nSsjcHDhJkJHg-Bt2Nh325iOHLr';

    const foldersToProcess = [];

    // 1. Find Buyers > [Agent] > [Client] folders
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
    const propertyFolders = await getFolders(drive, underContractFolderId);
    for (const property of propertyFolders) {
      foldersToProcess.push({
        path: `*Under Contract > ${property.name}`,
        folderId: property.id,
        folderName: property.name,
      });
    }

    // Create SISU_ID files in each folder
    const created = [];
    const skipped = [];
    const errors = [];

    for (const folder of foldersToProcess) {
      try {
        // Check if SISU_ID already exists (Google Doc)
        const existingCheck = await drive.files.list({
          q: `name='SISU_ID' and '${folder.folderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.document'`,
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          fields: 'files(id, name)',
        });

        if (existingCheck.data.files && existingCheck.data.files.length > 0) {
          skipped.push({ path: folder.path, folderName: folder.folderName });
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

          created.push({ path: folder.path, folderName: folder.folderName });
        }
      } catch (error) {
        errors.push({ path: folder.path, folderName: folder.folderName, error: error.message });
      }
    }

    return res.status(200).json({
      totalFoldersScanned: foldersToProcess.length,
      created: created.length,
      skipped: skipped.length,
      errors: errors.length,
      createdFolders: created,
      skippedFolders: skipped,
      errorFolders: errors,
    });
  } catch (error) {
    console.error('Create SISU_ID files error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create SISU_ID files' });
  }
}
