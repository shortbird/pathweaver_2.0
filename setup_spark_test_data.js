/**
 * Setup Script for Spark Integration Testing
 *
 * This script creates test data in the Optio database to enable webhook testing:
 * 1. Creates a test quest linked to Spark assignment
 * 2. Creates tasks for the test student
 * 3. Links the student to the quest
 *
 * Run this ONCE before testing webhooks.
 *
 * Usage:
 *   node setup_spark_test_data.js
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase configuration (from your environment)
const SUPABASE_URL = 'https://vvfgxcykxjybtvpfzwyx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'your-service-key-here';

// Test data configuration
const TEST_USER_ID = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8'; // Spark test student
const TEST_ASSIGNMENT_ID = 'test_assignment_001';
const TEST_COURSE_ID = 'test_course_001';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function setupTestData() {
  console.log('='.repeat(80));
  console.log('SPARK INTEGRATION - Test Data Setup');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Step 1: Create or find test quest for Spark assignment
    console.log('Step 1: Creating test quest for Spark assignment...');

    // Check if quest already exists
    const { data: existingQuest } = await supabase
      .from('quests')
      .select('id')
      .eq('lms_assignment_id', TEST_ASSIGNMENT_ID)
      .eq('lms_platform', 'spark')
      .single();

    let questId;
    if (existingQuest) {
      questId = existingQuest.id;
      console.log(`✓ Quest already exists: ${questId}`);
    } else {
      const { data: newQuest, error } = await supabase
        .from('quests')
        .insert({
          title: 'Test Spark Assignment',
          description: 'This is a test quest created for Spark webhook integration testing.',
          source: 'lms',
          lms_course_id: TEST_COURSE_ID,
          lms_assignment_id: TEST_ASSIGNMENT_ID,
          lms_platform: 'spark',
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      questId = newQuest.id;
      console.log(`✓ Created new quest: ${questId}`);
    }
    console.log('');

    // Step 2: Enroll student in quest
    console.log('Step 2: Enrolling test student in quest...');

    const { data: existingEnrollment } = await supabase
      .from('user_quests')
      .select('user_id')
      .eq('user_id', TEST_USER_ID)
      .eq('quest_id', questId)
      .single();

    let userQuestId;
    if (existingEnrollment) {
      console.log('✓ Student already enrolled in quest');
      // Get the user_quest record
      const { data: uq } = await supabase
        .from('user_quests')
        .select('id')
        .eq('user_id', TEST_USER_ID)
        .eq('quest_id', questId)
        .single();
      userQuestId = uq.id;
    } else {
      const { data: enrollment, error } = await supabase
        .from('user_quests')
        .insert({
          user_id: TEST_USER_ID,
          quest_id: questId,
          is_active: true,
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      userQuestId = enrollment.id;
      console.log('✓ Enrolled student in quest');
    }
    console.log('');

    // Step 3: Create tasks for the student
    console.log('Step 3: Creating quest tasks for student...');

    const { data: existingTasks } = await supabase
      .from('user_quest_tasks')
      .select('id')
      .eq('user_id', TEST_USER_ID)
      .eq('quest_id', questId);

    if (existingTasks && existingTasks.length > 0) {
      console.log(`✓ Student already has ${existingTasks.length} task(s) for this quest`);
    } else {
      const { data: tasks, error } = await supabase
        .from('user_quest_tasks')
        .insert([
          {
            user_id: TEST_USER_ID,
            quest_id: questId,
            user_quest_id: userQuestId,
            title: 'Complete Spark Assignment',
            description: 'Submit your work through the Spark LMS',
            pillar: 'stem',
            xp_value: 100,
            order_index: 0,
            is_required: true,
            is_manual: false
          }
        ])
        .select();

      if (error) throw error;
      console.log(`✓ Created ${tasks.length} task(s) for student`);
    }
    console.log('');

    // Summary
    console.log('='.repeat(80));
    console.log('SETUP COMPLETE');
    console.log('='.repeat(80));
    console.log('');
    console.log('Test data is ready! You can now run:');
    console.log('  node test_spark_webhook.js');
    console.log('');
    console.log('Expected result:');
    console.log('  ✓ Webhook should return 200 status');
    console.log('  ✓ Task should be marked complete');
    console.log('  ✓ Evidence should appear in student portfolio');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('ERROR');
    console.error('='.repeat(80));
    console.error('');
    console.error('Failed to setup test data:', error.message);
    console.error('');
    console.error('Details:', error);
    console.error('');
    process.exit(1);
  }
}

// Run setup
setupTestData();
