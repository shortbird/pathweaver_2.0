/**
 * Test script for Spark Course Sync Webhook
 *
 * This generates a valid HMAC-signed webhook request to test course auto-sync.
 * Run this to verify the webhook creates/updates quests correctly.
 */

const crypto = require('crypto');

// Webhook secret from environment (same as submission webhook)
const WEBHOOK_SECRET = process.env.SPARK_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.error('❌ ERROR: SPARK_WEBHOOK_SECRET environment variable not set');
  console.error('Set it with: export SPARK_WEBHOOK_SECRET=your_secret_here');
  process.exit(1);
}

// Test course data
const courseData = {
  spark_org_id: "24",  // SPARK demo org ID
  spark_course_id: "course_bio101",
  course_title: "Biology 101",
  course_description: "Introduction to cellular biology and life sciences",
  assignments: [
    {
      spark_assignment_id: "assign_bio_001",
      title: "Cell Structure Lab Report",
      description: "Document your observations of cell structures under microscope",
      due_date: "2025-02-15T23:59:59Z"
    },
    {
      spark_assignment_id: "assign_bio_002",
      title: "Photosynthesis Essay",
      description: "Explain the process of photosynthesis in detail",
      due_date: "2025-02-22T23:59:59Z"
    },
    {
      spark_assignment_id: "assign_bio_003",
      title: "DNA Model Project",
      description: "Create a 3D model of DNA structure",
      due_date: "2025-03-01T23:59:59Z"
    }
  ]
};

console.log('='.repeat(80));
console.log('SPARK COURSE WEBHOOK TEST');
console.log('='.repeat(80));
console.log('');

console.log('Course Data:');
console.log(JSON.stringify(courseData, null, 2));
console.log('');

// Calculate HMAC signature - must match backend's format
// Backend uses: json.dumps(data, separators=(',', ':'), sort_keys=True)
// Need to sort all keys recursively and use compact JSON (no spaces)
function sortedStringify(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(sortedStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(key => `"${key}":${sortedStringify(obj[key])}`);
  return '{' + pairs.join(',') + '}';
}

const payload = sortedStringify(courseData);
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');

console.log('HMAC-SHA256 Signature:');
console.log(signature);
console.log('');

// Generate curl commands for testing
const devUrl = 'https://optio-dev-backend.onrender.com/spark/webhook/course';
const prodUrl = 'https://optio-prod-backend.onrender.com/spark/webhook/course';

console.log('='.repeat(80));
console.log('TEST COMMANDS');
console.log('='.repeat(80));
console.log('');

console.log('DEV ENVIRONMENT:');
console.log('');
console.log(`curl -X POST ${devUrl} \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -H "X-Spark-Signature: ${signature}" \\`);
console.log(`  -d '${payload}'`);
console.log('');

console.log('PROD ENVIRONMENT:');
console.log('');
console.log(`curl -X POST ${prodUrl} \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -H "X-Spark-Signature: ${signature}" \\`);
console.log(`  -d '${payload}'`);
console.log('');

console.log('='.repeat(80));
console.log('EXPECTED RESULT');
console.log('='.repeat(80));
console.log('');
console.log('✅ Status: 200 OK');
console.log('✅ Response:');
console.log('{');
console.log('  "success": true,');
console.log('  "quest_id": "<uuid>",');
console.log('  "task_count": 3,');
console.log('  "message": "Quest \'Biology 101\' synced successfully"');
console.log('}');
console.log('');
console.log('Quest Details:');
console.log('- Title: Biology 101');
console.log('- Type: course');
console.log('- LMS Course ID: course_bio101');
console.log('- Tasks Created: 3 (Cell Structure Lab, Photosynthesis Essay, DNA Model)');
console.log('');

console.log('='.repeat(80));
console.log('VERIFICATION STEPS');
console.log('='.repeat(80));
console.log('');
console.log('1. Run the curl command above');
console.log('2. Check response for quest_id');
console.log('3. Log into Optio admin dashboard');
console.log('4. Navigate to Quests section');
console.log('5. Verify "Biology 101" quest exists with:');
console.log('   - quest_type = "course"');
console.log('   - lms_course_id = "course_bio101"');
console.log('   - 3 tasks in task library');
console.log('6. Run again to test UPDATE (should update existing quest)');
console.log('');

console.log('='.repeat(80));
console.log('DATABASE QUERIES (Verification)');
console.log('='.repeat(80));
console.log('');
console.log('-- Check quest was created');
console.log("SELECT id, title, quest_type, lms_course_id FROM quests WHERE lms_course_id = 'course_bio101';");
console.log('');
console.log('-- Check tasks were created');
console.log("SELECT id, title, spark_assignment_id FROM task_library WHERE quest_id = '<quest_id>';");
console.log('');

console.log('='.repeat(80));
console.log('UPDATE TEST');
console.log('='.repeat(80));
console.log('');
console.log('To test UPDATE (modifying existing course):');
console.log('1. Change course_title to "Biology 101 - Spring 2025"');
console.log('2. Add a 4th assignment to the assignments array');
console.log('3. Re-run this script (signature will be different)');
console.log('4. Verify quest title updated and 4th task added');
console.log('');
