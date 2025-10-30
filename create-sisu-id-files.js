// Script to create blank SISU_ID.txt files in all relevant client/property folders
require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');
const { Base64 } = require('js-base64');

async function createSisuIdFiles() {
  try {
    console.log('🔐 Authenticating with Google Drive...\n');

    const credentialsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;
    const credentialsJson = Base64.decode(credentialsBase64);
    const credentials = JSON.parse(credentialsJson);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const authClient = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient });

    const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;
    const activeFolderId = '1AgCgNDx37qSX6pCjY-YSJcnEtM_X1iqD'; // Active (Cloned)

    console.log('📊 Analyzing folder structure...\n');
    console.log('='.repeat(70) + '\n');

    const foldersToProcess = [];

    // 1. Find Buyers > [Agent] > [Client] folders
    console.log('🔍 Searching: *Buyers > [Agents] > [Clients]...\n');
    const buyersFolderId = '1jzK8gXiqoL13kOBoAJ0_zQaBdWAcyHoj';

    const agentFolders = await getFolders(drive, buyersFolderId);
    console.log(`   Found ${agentFolders.length} agent folders\n`);

    for (const agent of agentFolders) {
      console.log(`   📁 Agent: ${agent.name}`);
      const clientFolders = await getFolders(drive, agent.id);
      console.log(`      → ${clientFolders.length} client folder(s)`);

      for (const client of clientFolders) {
        foldersToProcess.push({
          path: `*Buyers > ${agent.name} > ${client.name}`,
          folderId: client.id,
          folderName: client.name,
        });
      }
      console.log();
    }

    // 2. Find Listings > *Active > [Properties]
    console.log('🔍 Searching: *Listings > *Active > [Properties]...\n');
    const listingsFolderId = '1s69KjtZWhNaJ9Pg_yngo9joRUK4kG2Dq';

    const listingsSubfolders = await getFolders(drive, listingsFolderId);
    const activeListingsFolder = listingsSubfolders.find(f => f.name === '*Active');

    if (activeListingsFolder) {
      const propertyFolders = await getFolders(drive, activeListingsFolder.id);
      console.log(`   Found ${propertyFolders.length} property folder(s)\n`);

      for (const property of propertyFolders) {
        foldersToProcess.push({
          path: `*Listings > *Active > ${property.name}`,
          folderId: property.id,
          folderName: property.name,
        });
      }
    }

    // 3. Find Under Contract > [Properties]
    console.log('🔍 Searching: *Under Contract > [Properties]...\n');
    const underContractFolderId = '11LsP1nSsjcHDhJkJHg-Bt2Nh325iOHLr';

    const propertyFolders = await getFolders(drive, underContractFolderId);
    console.log(`   Found ${propertyFolders.length} property folder(s)\n`);

    for (const property of propertyFolders) {
      foldersToProcess.push({
        path: `*Under Contract > ${property.name}`,
        folderId: property.id,
        folderName: property.name,
      });
    }

    console.log('='.repeat(70));
    console.log(`\n📊 Total folders to process: ${foldersToProcess.length}\n`);
    console.log('='.repeat(70) + '\n');

    // Ask for confirmation
    console.log('⚠️  This will create a blank SISU_ID.txt file in each folder.');
    console.log('⚠️  Files that already exist will be skipped.\n');

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
          console.log(`⏭️  [${i + 1}/${foldersToProcess.length}] Skipped (already exists): ${folder.path}`);
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
          console.log(`✅ [${i + 1}/${foldersToProcess.length}] Created: ${folder.path}`);
        }
      } catch (error) {
        errors.push({ folder, error: error.message });
        console.log(`❌ [${i + 1}/${foldersToProcess.length}] Error: ${folder.path} - ${error.message}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('\n📊 SUMMARY:\n');
    console.log(`✅ Created: ${created.length} file(s)`);
    console.log(`⏭️  Skipped (already exists): ${skipped.length} file(s)`);
    console.log(`❌ Errors: ${errors.length} file(s)`);
    console.log('\n' + '='.repeat(70));

    if (created.length > 0) {
      console.log('\n✅ SUCCESS! Blank SISU_ID Google Docs have been created.');
      console.log('\n📝 Next steps:');
      console.log('   1. Open your Google Drive');
      console.log('   2. Navigate to each client/property folder');
      console.log('   3. Open the SISU_ID Google Doc and add the client\'s email address');
      console.log('   4. The doc will auto-save');
    }

    if (errors.length > 0) {
      console.log('\n⚠️  Some files could not be created. Check the errors above.');
    }

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error);
  }
}

// Helper function to get folders
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

createSisuIdFiles();
