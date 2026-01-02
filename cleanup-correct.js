require('dotenv').config({ path: '.env.local' });

/**
 * Script to delete ALL documents from SISU using the CORRECT endpoint
 * Endpoint: GET/DELETE /documents?transaction_id={id}
 */

async function getTransactionDocuments(baseUrl, authHeader, transactionId) {
  try {
    // Correct endpoint from network tab
    const listUrl = `${baseUrl}/documents?transaction_id=${transactionId}`;
    const response = await fetch(listUrl, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : (data.documents || []);
  } catch (error) {
    console.error(`    Error fetching: ${error.message}`);
    return [];
  }
}

async function deleteDocument(baseUrl, authHeader, transactionId, documentId) {
  // Based on the screenshot, the delete endpoint is likely:
  // DELETE /documents?transaction_id={transaction_id}&document_id={document_id}
  // OR DELETE /documents/{document_id}?transaction_id={transaction_id}

  // Try method 1: query parameters
  const deleteUrl = `${baseUrl}/documents?transaction_id=${transactionId}&document_id=${documentId}`;

  const response = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      Authorization: authHeader,
    },
  });

  return response;
}

async function cleanupEnvironment(environment, baseUrl) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🗑️  Cleaning up ${environment.toUpperCase()} documents`);
  console.log(`${'='.repeat(60)}\n`);

  const authHeader = process.env.SISU_AUTH_HEADER;

  // All transaction IDs
  const transactionIds = [
    6083634,  // ewomack1112@gmail.com
    5965135,  // travisraabe@gmail.com
    6021746,  // reginazvasquez@gmail.com
    4658729,  // ar32721@gmail.com (transaction 1)
    5952674,  // ar32721@gmail.com (transaction 2)
    5992122,  // kasrdh1978@yahoo.com (transaction 1)
    5265375,  // kasrdh1978@yahoo.com (transaction 2)
    6069847,  // simmons1968@sbcglobal.net
    3205174,  // lsrbarkley@yahoo.com (seller)
    3205171,  // lsrbarkley@yahoo.com (buyer)
    3510877,  // lalford24@gmail.com
    3122667,  // mftburns@gmail.com
    4019947,  // myra_bustos2013@yahoo.com
    5169482,  // ecieri90@yahoo.com
    5159887,  // jenniferescamilla8268@aol.com
    3077546,  // zapatajuliana1021@gmail.com
    3455522,  // gerryandstephanie2018@gmail.com
    3963402,  // recovsolutions.21@gmail.com (transaction 1)
    3119514,  // recovsolutions.21@gmail.com (transaction 2)
  ];

  console.log(`Processing ${transactionIds.length} transactions...\n`);

  let totalDeleted = 0;
  let totalErrors = 0;

  for (const transactionId of transactionIds) {
    try {
      console.log(`Transaction ${transactionId}:`);

      // Get documents for this transaction
      const documents = await getTransactionDocuments(baseUrl, authHeader, transactionId);

      if (documents.length === 0) {
        console.log(`  ℹ️  No documents found`);
        continue;
      }

      console.log(`  📄 Found ${documents.length} document(s)`);

      // Delete each document
      for (const doc of documents) {
        try {
          const docId = doc.id || doc.document_id || doc.client_document_id;

          const deleteResponse = await deleteDocument(baseUrl, authHeader, transactionId, docId);

          if (deleteResponse.ok) {
            console.log(`    ✅ Deleted: ${doc.filename || doc.name || docId}`);
            totalDeleted++;
          } else {
            const errorText = await deleteResponse.text();
            console.log(`    ❌ Failed (${deleteResponse.status}): ${doc.filename || docId}`);
            if (errorText) console.log(`       ${errorText.substring(0, 100)}`);
            totalErrors++;
          }

          // Delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (error) {
          console.log(`    ❌ Error: ${error.message}`);
          totalErrors++;
        }
      }

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
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

async function cleanupBothEnvironments() {
  console.log('\n🚀 Starting document cleanup (using correct endpoint)...\n');

  // Clean up staging
  const stagingResults = await cleanupEnvironment('staging', 'https://staging.sisu.co/api/v1');

  // Clean up production
  const productionResults = await cleanupEnvironment('production', 'https://api.sisu.co/api/v1');

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
