require('dotenv').config({ path: '.env.local' });

async function testSISULookup() {
  const baseUrl = process.env.SISU_BASE_URL;
  const authHeader = process.env.SISU_AUTH_HEADER;

  console.log('Testing SISU API...');
  console.log('Base URL:', baseUrl);
  console.log('Auth Header:', authHeader?.substring(0, 20) + '...');

  // Test with a couple of the emails that should exist
  const testEmails = [
    'ewomack1112@gmail.com',
    'rae.ann.hicks@gmail.com',
    'onaidareichen@gmail.com',
  ];

  for (const email of testEmails) {
    console.log('\n====================================');
    console.log(`Testing email: ${email}`);
    console.log('====================================');

    try {
      const url = `${baseUrl}/client/find-client`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({ email }),
      });

      console.log('Status:', response.status, response.statusText);

      const responseText = await response.text();
      console.log('Raw Response:', responseText);

      try {
        const data = JSON.parse(responseText);
        console.log('Parsed JSON:', JSON.stringify(data, null, 2));
      } catch (e) {
        console.log('Could not parse as JSON');
      }

    } catch (error) {
      console.error('Error:', error.message);
    }
  }
}

testSISULookup();
