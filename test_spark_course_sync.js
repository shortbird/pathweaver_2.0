/**
 * Test SPARK Course Sync Webhook
 *
 * Tests the /spark/webhook/course endpoint to verify:
 * 1. Quest creation from course data
 * 2. Sample task creation from assignments
 * 3. HMAC signature validation
 */

const crypto = require('crypto');

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'https://optio-dev-backend.onrender.com';
const SPARK_WEBHOOK_SECRET = process.env.SPARK_WEBHOOK_SECRET;

if (!SPARK_WEBHOOK_SECRET) {
    console.error('Error: SPARK_WEBHOOK_SECRET environment variable not set');
    process.exit(1);
}

// Test course data with assignments
const courseData = {
    spark_org_id: "24",  // Demo org ID from SPARK developer
    spark_course_id: "test_course_biology_101",
    course_title: "Biology 101 - Test Course",
    course_description: "Introduction to biology - automated test course with assignments",
    assignments: [
        {
            spark_assignment_id: "assign_bio_001",
            title: "Cell Structure Lab Report",
            description: "Complete the cell structure lab and submit a detailed report with diagrams",
            due_date: "2025-02-15T23:59:59Z"
        },
        {
            spark_assignment_id: "assign_bio_002",
            title: "Photosynthesis Essay",
            description: "Write a 500-word essay explaining the process of photosynthesis",
            due_date: "2025-02-22T23:59:59Z"
        },
        {
            spark_assignment_id: "assign_bio_003",
            title: "Ecosystem Project",
            description: "Create a presentation about a local ecosystem",
            due_date: "2025-03-01T23:59:59Z"
        }
    ]
};

// Calculate HMAC signature
function calculateSignature(payload) {
    const payloadString = JSON.stringify(payload, Object.keys(payload).sort());
    return crypto
        .createHmac('sha256', SPARK_WEBHOOK_SECRET)
        .update(payloadString)
        .digest('hex');
}

// Test course sync webhook
async function testCourseSyncWebhook() {
    console.log('Testing SPARK Course Sync Webhook');
    console.log('==================================\n');

    console.log('Backend URL:', BACKEND_URL);
    console.log('Course ID:', courseData.spark_course_id);
    console.log('Course Title:', courseData.course_title);
    console.log('Assignment Count:', courseData.assignments.length);
    console.log('\nAssignments:');
    courseData.assignments.forEach((assignment, idx) => {
        console.log(`  ${idx + 1}. ${assignment.title} (ID: ${assignment.spark_assignment_id})`);
    });

    // Calculate signature
    const signature = calculateSignature(courseData);
    console.log('\nCalculated HMAC signature:', signature.substring(0, 20) + '...');

    // Make request
    console.log('\nSending POST request to /spark/webhook/course...\n');

    try {
        const response = await fetch(`${BACKEND_URL}/spark/webhook/course`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Spark-Signature': signature
            },
            body: JSON.stringify(courseData)
        });

        const responseText = await response.text();
        let responseData;

        try {
            responseData = JSON.parse(responseText);
        } catch (e) {
            console.error('Failed to parse response as JSON:', responseText);
            throw e;
        }

        console.log('Response Status:', response.status);
        console.log('Response Body:', JSON.stringify(responseData, null, 2));

        if (response.ok) {
            console.log('\n✓ SUCCESS - Course sync webhook processed successfully');
            console.log(`  Quest ID: ${responseData.quest_id}`);
            console.log(`  Tasks Created/Updated: ${responseData.task_count}`);
            console.log(`  Message: ${responseData.message}`);

            console.log('\nNext Steps:');
            console.log('1. Verify quest exists in Supabase (quests table)');
            console.log('2. Verify sample tasks created (quest_sample_tasks table)');
            console.log('3. Check that spark_assignment_id is set for each task');
            console.log('4. Test SSO login to verify auto-enrollment works');

            return responseData;
        } else {
            console.error('\n✗ FAILED - Course sync webhook returned error');
            console.error('  Status:', response.status);
            console.error('  Error:', responseData.error || 'Unknown error');
            throw new Error(`Course sync failed: ${responseData.error}`);
        }

    } catch (error) {
        console.error('\n✗ ERROR - Failed to call course sync webhook');
        console.error('  Error:', error.message);
        throw error;
    }
}

// Verify quest in database (optional - requires Supabase client)
async function verifyQuestCreated(questId) {
    console.log('\n\nVerifying Quest in Database');
    console.log('===========================\n');
    console.log('Quest ID:', questId);
    console.log('\nTo verify manually, run this query in Supabase:');
    console.log(`
SELECT
    q.id,
    q.title,
    q.description,
    q.quest_type,
    q.lms_course_id,
    q.is_active,
    COUNT(qst.id) as task_count
FROM quests q
LEFT JOIN quest_sample_tasks qst ON qst.quest_id = q.id
WHERE q.id = '${questId}'
GROUP BY q.id;

-- View tasks
SELECT
    id,
    title,
    description,
    pillar,
    xp_value,
    spark_assignment_id,
    order_index
FROM quest_sample_tasks
WHERE quest_id = '${questId}'
ORDER BY order_index;
    `);
}

// Run test
testCourseSyncWebhook()
    .then(result => {
        if (result && result.quest_id) {
            verifyQuestCreated(result.quest_id);
        }
        console.log('\n\nTest completed successfully!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n\nTest failed:', error.message);
        process.exit(1);
    });
