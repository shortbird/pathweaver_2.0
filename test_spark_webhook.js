/**
 * Test script for Spark webhook integration
 *
 * This sends a test submission webhook to Optio dev backend.
 */

const crypto = require('crypto');
const https = require('https');

// Secrets from Render environment
const WEBHOOK_SECRET = '616bf3413b37e8a213c8252b12ecc923fed22a577ce6a9ff1c12a2178077aad5';

// Test submission payload
const submission = {
  spark_user_id: 'test_student_001',
  spark_assignment_id: 'test_assignment_001',
  spark_course_id: 'test_course_001',
  submission_text: 'This is a test submission from Spark LMS. Testing the webhook integration with Optio to ensure evidence is properly recorded in student portfolios.',
  submission_files: [
    // Empty for now - we can test file downloads separately
  ],
  submitted_at: new Date().toISOString(),
  grade: 100
};

console.log('='.repeat(80));
console.log('SPARK WEBHOOK TEST - Sending Test Submission');
console.log('='.repeat(80));
console.log('');

// Convert payload to JSON string
const payloadString = JSON.stringify(submission);

console.log('Submission Payload:');
console.log(JSON.stringify(submission, null, 2));
console.log('');

// Calculate HMAC-SHA256 signature
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(payloadString)
  .digest('hex');

console.log('HMAC-SHA256 Signature:');
console.log(signature);
console.log('');

console.log('='.repeat(80));
console.log('SENDING REQUEST TO OPTIO DEV BACKEND');
console.log('='.repeat(80));
console.log('');
console.log('URL: https://optio-dev-backend.onrender.com/spark/webhook/submission');
console.log('Method: POST');
console.log('Headers:');
console.log('  Content-Type: application/json');
console.log('  X-Spark-Signature:', signature);
console.log('');

// Send the webhook
const req = https.request({
  hostname: 'optio-dev-backend.onrender.com',
  path: '/spark/webhook/submission',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Spark-Signature': signature,
    'Content-Length': Buffer.byteLength(payloadString)
  }
}, (res) => {
  console.log('='.repeat(80));
  console.log('RESPONSE FROM OPTIO');
  console.log('='.repeat(80));
  console.log('');
  console.log('Status Code:', res.statusCode);
  console.log('Status Message:', res.statusMessage);
  console.log('');
  console.log('Response Headers:');
  console.log(JSON.stringify(res.headers, null, 2));
  console.log('');

  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Response Body:');
    try {
      const jsonData = JSON.parse(data);
      console.log(JSON.stringify(jsonData, null, 2));
    } catch (e) {
      console.log(data);
    }
    console.log('');

    console.log('='.repeat(80));
    console.log('TEST RESULTS');
    console.log('='.repeat(80));
    console.log('');

    if (res.statusCode === 200) {
      console.log('✅ SUCCESS! Webhook accepted by Optio.');
      console.log('');
      console.log('Next Steps:');
      console.log('1. Log into Optio dev as spark-test@optioeducation.com');
      console.log('2. Navigate to your dashboard');
      console.log('3. Check for the test submission evidence');
      console.log('4. Verify it appears in your portfolio');
    } else if (res.statusCode === 401) {
      console.log('❌ FAILED: Signature validation failed.');
      console.log('   Check that WEBHOOK_SECRET matches on both sides.');
    } else if (res.statusCode === 404) {
      console.log('⚠️  WARNING: User or assignment not found.');
      console.log('   This is expected if SSO hasn\'t been tested yet.');
      console.log('   Run test_spark_sso.js first to create the user account.');
    } else if (res.statusCode === 400) {
      console.log('❌ FAILED: Invalid payload format.');
      console.log('   Check the response body above for details.');
    } else if (res.statusCode >= 500) {
      console.log('❌ FAILED: Server error on Optio side.');
      console.log('   Check Optio backend logs for details.');
    } else {
      console.log('⚠️  Unexpected status code:', res.statusCode);
    }
    console.log('');
  });
});

req.on('error', (error) => {
  console.log('='.repeat(80));
  console.log('ERROR');
  console.log('='.repeat(80));
  console.log('');
  console.log('❌ Request failed:', error.message);
  console.log('');
  console.log('Possible causes:');
  console.log('- Network connectivity issue');
  console.log('- Optio backend is down');
  console.log('- DNS resolution failed');
  console.log('');
});

req.write(payloadString);
req.end();
