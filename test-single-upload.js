require('dotenv').config({ path: '.env.local' });
const { Base64 } = require('js-base64');
const fs = require('fs');

/**
 * Test script to upload ONE document to verify folder parameter works
 */

async function testUpload() {
  const baseUrl = process.env.SISU_BASE_URL;
  const authHeader = process.env.SISU_AUTH_HEADER;

  console.log('\n🧪 Testing single document upload...\n');
  console.log(`Target: ${baseUrl}`);
  console.log(`Folder: "All Documents"`);
  console.log(`is_public: true\n`);

  // Use ewomack1112@gmail.com transaction (6083634) for test
  const testClientId = 6083634;
  const testFilename = 'TEST_UPLOAD.pdf';

  // Create a simple test PDF content (just for testing)
  const testPdfContent = Buffer.from('%PDF-1.4\nTest PDF\n%%EOF');

  const base64Data = Base64.fromUint8Array(new Uint8Array(testPdfContent));

  const url = `${baseUrl}/client/documents`;

  const payload = {
    client_id: testClientId,
    filename: testFilename,
    data: base64Data,
    file_extension: 'pdf',
    file_type: 'pdf',
    content_type: 'application/pdf',
    category: 'all-documents', // Try category instead of folder
    folder_name: 'All Documents', // Try folder_name
    document_type: 'all-documents', // Try document_type
    is_public: true, // Make visible to client
    visibility: 'public', // Try visibility
  };

  console.log('Payload (without data):');
  const payloadDisplay = { ...payload, data: '[base64 data omitted]' };
  console.log(payloadDisplay);
  console.log('\n');

  try {
    console.log('Sending request...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    });

    console.log(`\nResponse Status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Upload failed!');
      console.log('Error response:', errorText);
      process.exit(1);
    }

    const result = await response.json();
    console.log('✅ Upload successful!');
    console.log('Response:', JSON.stringify(result, null, 2));
    console.log('\n');
    console.log('='.repeat(60));
    console.log('📋 NEXT STEPS:');
    console.log('='.repeat(60));
    console.log('1. Log into production SISU (api.sisu.co)');
    console.log('2. Go to transaction 6083634 (ewomack1112@gmail.com)');
    console.log('3. Check if "TEST_UPLOAD.pdf" appears in "All Documents" folder');
    console.log('4. If YES: The folder parameter works! ✅');
    console.log('5. If NO (in General Documents): The folder parameter is ignored ❌');
    console.log('='.repeat(60));
    console.log('\n');

  } catch (error) {
    console.log('❌ Request failed!');
    console.log('Error:', error.message);
    process.exit(1);
  }
}

testUpload();
