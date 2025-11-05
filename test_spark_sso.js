/**
 * Test script for Spark SSO integration
 *
 * This generates a valid JWT token and outputs the SSO URL.
 * Open the URL in your browser to test the SSO flow.
 */

const jwt = require('jsonwebtoken');

// Secrets from Render environment
const SSO_SECRET = '3d69457249381391c19f7f7a64ec1d5b9e78adab7583c343d2087a47b4a7cb00';

// Test student account details
const testStudent = {
  spark_user_id: 'test_student_001',
  email: 'spark-test@optioeducation.com',
  first_name: 'Spark',
  last_name: 'TestStudent',
  role: 'student'
};

console.log('='.repeat(80));
console.log('SPARK SSO TEST - Generating JWT Token');
console.log('='.repeat(80));
console.log('');

// Create JWT payload
const payload = {
  sub: testStudent.spark_user_id,
  email: testStudent.email,
  given_name: testStudent.first_name,
  family_name: testStudent.last_name,
  role: testStudent.role,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 600  // 10 minutes from now
};

console.log('JWT Payload:');
console.log(JSON.stringify(payload, null, 2));
console.log('');

// Sign the token
const token = jwt.sign(payload, SSO_SECRET, { algorithm: 'HS256' });

console.log('Generated JWT Token:');
console.log(token);
console.log('');
console.log('Token Length:', token.length, 'characters');
console.log('');

// Generate SSO URLs for both environments
// NOTE: SSO endpoint is on the BACKEND, not frontend
const devUrl = `https://optio-dev-backend.onrender.com/spark/sso?token=${token}`;
const prodUrl = `https://optio-prod-backend.onrender.com/spark/sso?token=${token}`;

console.log('='.repeat(80));
console.log('SSO TEST URLS');
console.log('='.repeat(80));
console.log('');
console.log('DEV ENVIRONMENT:');
console.log(devUrl);
console.log('');
console.log('PROD ENVIRONMENT (when ready):');
console.log(prodUrl);
console.log('');

console.log('='.repeat(80));
console.log('TESTING INSTRUCTIONS');
console.log('='.repeat(80));
console.log('');
console.log('1. Copy the DEV ENVIRONMENT URL above');
console.log('2. Paste it into your browser');
console.log('3. You should be automatically logged into Optio as "Spark TestStudent"');
console.log('4. Verify you land on the Optio dashboard');
console.log('5. Check the user profile shows the correct name and email');
console.log('');
console.log('Expected Result:');
console.log('- Automatic login (no password prompt)');
console.log('- Redirected to dashboard');
console.log('- User account created with Spark user ID mapping');
console.log('');
console.log('Token expires in 10 minutes from now.');
console.log('');
