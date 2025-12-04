/**
 * Test script for Spark webhook integration with file uploads
 *
 * This sends a multipart/form-data submission webhook to Optio dev backend.
 * Tests the file upload functionality of the Spark integration.
 */

const crypto = require('crypto');
const FormData = require('form-data');
const fs = require('fs');
const https = require('https');
const path = require('path');

// Secrets from Render environment - MUST be set as environment variable
const WEBHOOK_SECRET = process.env.SPARK_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.error('❌ ERROR: SPARK_WEBHOOK_SECRET environment variable not set');
  console.error('Set it with: export SPARK_WEBHOOK_SECRET=your_secret_here');
  console.error('Contact Optio team for the secret value.');
  process.exit(1);
}

// Test submission metadata (this is what gets signed)
const metadata = {
  spark_user_id: 'test_student_001',
  spark_assignment_id: 'test_assignment_001',
  spark_course_id: 'test_course_001',
  submission_text: 'I completed the Python calculator assignment. See attached code file and screenshot of the working program output. The calculator supports addition, subtraction, multiplication, and division.',
  submitted_at: new Date().toISOString(),
  grade: 95
};

console.log('='.repeat(80));
console.log('SPARK WEBHOOK TEST - Multipart File Upload');
console.log('='.repeat(80));
console.log('');

// Convert metadata to JSON string
const metadataJson = JSON.stringify(metadata);

console.log('Submission Metadata:');
console.log(JSON.stringify(metadata, null, 2));
console.log('');

// Calculate HMAC-SHA256 signature on metadata JSON only (not entire multipart body)
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(metadataJson)
  .digest('hex');

console.log('HMAC-SHA256 Signature:');
console.log(signature);
console.log('');

// Create sample test files if they don't exist
const testFilesDir = path.join(__dirname, 'spark_test_files');
if (!fs.existsSync(testFilesDir)) {
  fs.mkdirSync(testFilesDir);
}

// Create sample Python file
const pythonCode = `# Simple Calculator Program
# Created for Spark LMS Assignment

def add(a, b):
    """Add two numbers"""
    return a + b

def subtract(a, b):
    """Subtract two numbers"""
    return a - b

def multiply(a, b):
    """Multiply two numbers"""
    return a * b

def divide(a, b):
    """Divide two numbers"""
    if b == 0:
        return "Error: Division by zero"
    return a / b

# Test the calculator
print("Testing Calculator:")
print(f"5 + 3 = {add(5, 3)}")
print(f"10 - 4 = {subtract(10, 4)}")
print(f"6 * 7 = {multiply(6, 7)}")
print(f"15 / 3 = {divide(15, 3)}")
`;

const pythonFilePath = path.join(testFilesDir, 'calculator.py');
fs.writeFileSync(pythonFilePath, pythonCode);

// Create sample text file (simulating program output screenshot description)
const outputText = `Calculator Program Output Screenshot

This screenshot shows the calculator program running successfully with the following test results:

Test Case 1: Addition
Input: 5 + 3
Output: 8
Status: PASS

Test Case 2: Subtraction
Input: 10 - 4
Output: 6
Status: PASS

Test Case 3: Multiplication
Input: 6 * 7
Output: 42
Status: PASS

Test Case 4: Division
Input: 15 / 3
Output: 5.0
Status: PASS

Test Case 5: Division by Zero
Input: 10 / 0
Output: Error: Division by zero
Status: PASS (correctly handled)

All test cases passed successfully.
`;

const textFilePath = path.join(testFilesDir, 'test_results.txt');
fs.writeFileSync(textFilePath, outputText);

console.log('Created test files:');
console.log('  - calculator.py (Python code)');
console.log('  - test_results.txt (Test results)');
console.log('');

// Create form data with metadata and files
const form = new FormData();
form.append('metadata', metadataJson);
form.append('file1', fs.createReadStream(pythonFilePath), {
  filename: 'calculator.py',
  contentType: 'text/plain'
});
form.append('file2', fs.createReadStream(textFilePath), {
  filename: 'test_results.txt',
  contentType: 'text/plain'
});

console.log('='.repeat(80));
console.log('SENDING MULTIPART REQUEST TO OPTIO DEV BACKEND');
console.log('='.repeat(80));
console.log('');
console.log('URL: https://optio-dev-backend.onrender.com/spark/webhook/submission');
console.log('Method: POST');
console.log('Content-Type: multipart/form-data');
console.log('Headers:');
console.log('  X-Spark-Signature:', signature);
console.log('');
console.log('Form Fields:');
console.log('  metadata: (JSON string)');
console.log('  file1: calculator.py (text/plain)');
console.log('  file2: test_results.txt (text/plain)');
console.log('');

// Send the webhook
const req = https.request({
  hostname: 'optio-dev-backend.onrender.com',
  path: '/spark/webhook/submission',
  method: 'POST',
  headers: {
    'X-Spark-Signature': signature,
    ...form.getHeaders()
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
      console.log('✅ SUCCESS! Multipart webhook with files accepted by Optio.');
      console.log('');
      console.log('Next Steps:');
      console.log('1. Log into Optio dev as spark-test@optioeducation.com');
      console.log('2. Navigate to your diploma/portfolio page');
      console.log('3. Check for the test submission evidence');
      console.log('4. Verify 2 file attachments appear (calculator.py, test_results.txt)');
      console.log('5. Click files to verify they open correctly');
    } else if (res.statusCode === 401) {
      console.log('❌ FAILED: Signature validation failed.');
      console.log('   Check that WEBHOOK_SECRET matches on both sides.');
    } else if (res.statusCode === 404) {
      console.log('⚠️  WARNING: User or assignment not found.');
      console.log('   This is expected if SSO hasn\'t been tested yet.');
      console.log('   Steps to fix:');
      console.log('   1. Run: node test_spark_sso.js');
      console.log('   2. Open the SSO URL to create user account');
      console.log('   3. Log in and start the test quest');
      console.log('   4. Re-run this script');
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

form.pipe(req);
