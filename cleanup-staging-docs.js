require('dotenv').config({ path: '.env.local' });

/**
 * Script to delete all uploaded documents from BOTH staging AND production SISU
 * This will fetch all documents for each client and delete them
 */

async function cleanupDocuments(environment, baseUrl) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🗑️  Cleaning up ${environment.toUpperCase()} documents`);
  console.log(`${'='.repeat(60)}\n`);

  const authHeader = process.env.SISU_AUTH_HEADER;

  // Client IDs that had documents uploaded to staging
  const clientIds = [
    6083634,  // ewomack1112@gmail.com
    5965135,  // travisraabe@gmail.com
    6021746,  // reginazvasquez@gmail.com
    4658729,  // ar32721@gmail.com
    5992122,  // kasrdh1978@yahoo.com
    6069847,  // simmons1968@sbcglobal.net
    3205174,  // lsrbarkley@yahoo.com
    3510877,  // lalford24@gmail.com
    3122667,  // mftburns@gmail.com
    4019947,  // myra_bustos2013@yahoo.com
    5169482,  // ecieri90@yahoo.com
    5159887,  // jenniferescamilla8268@aol.com
    3077546,  // zapatajuliana1021@gmail.com
    3455522,  // gerryandstephanie2018@gmail.com
    3963402,  // recovsolutions.21@gmail.com (first transaction)
    3119514,  // recovsolutions.21@gmail.com (second transaction)
  ];

  console.log(`Processing ${clientIds.length} clients...\n`);

  let totalDeleted = 0;
  let totalErrors = 0;

  for (const clientId of clientIds) {
    try {
      console.log(`\nProcessing client ${clientId}...`);

      // Get list of documents for this client
      const listUrl = `${baseUrl}/client/${clientId}/documents`;
      const listResponse = await fetch(listUrl, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Authorization: authHeader,
        },
      });

      if (!listResponse.ok) {
        console.log(`  ⚠️  Could not fetch documents (${listResponse.status})`);
        continue;
      }

      const documents = await listResponse.json();

      if (!documents || documents.length === 0) {
        console.log(`  ℹ️  No documents found`);
        continue;
      }

      console.log(`  📄 Found ${documents.length} document(s)`);

      // Delete each document
      for (const doc of documents) {
        try {
          const deleteUrl = `${baseUrl}/client/documents/${clientId}/${doc.id}`;
          const deleteResponse = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              accept: 'application/json',
              Authorization: authHeader,
            },
          });

          if (deleteResponse.ok) {
            console.log(`    ✅ Deleted: ${doc.filename || doc.id}`);
            totalDeleted++;
          } else {
            console.log(`    ❌ Failed to delete ${doc.filename || doc.id} (${deleteResponse.status})`);
            totalErrors++;
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          console.log(`    ❌ Error deleting document: ${error.message}`);
          totalErrors++;
        }
      }

    } catch (error) {
      console.log(`  ❌ Error processing client ${clientId}: ${error.message}`);
      totalErrors++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ ${environment.toUpperCase()} cleanup complete!`);
  console.log(`   Deleted: ${totalDeleted} documents`);
  console.log(`   Errors: ${totalErrors}`);
  console.log(`${'='.repeat(60)}\n`);

  return { deleted: totalDeleted, errors: totalErrors };
}

// Run the cleanup for BOTH environments
async function cleanupBothEnvironments() {
  console.log('\n🚀 Starting cleanup of documents from BOTH staging AND production...\n');

  // Clean up staging
  const stagingResults = await cleanupDocuments('staging', 'https://staging.sisu.co/api/v1');

  // Clean up production
  const productionResults = await cleanupDocuments('production', 'https://api.sisu.co/api/v1');

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('🎉 ALL CLEANUP COMPLETE!');
  console.log('='.repeat(60));
  console.log(`Staging:    ${stagingResults.deleted} deleted, ${stagingResults.errors} errors`);
  console.log(`Production: ${productionResults.deleted} deleted, ${productionResults.errors} errors`);
  console.log(`Total:      ${stagingResults.deleted + productionResults.deleted} deleted`);
  console.log('='.repeat(60) + '\n');
}

cleanupBothEnvironments().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
