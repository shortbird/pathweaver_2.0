/**
 * Playwright Global Teardown - Cleans up ALL E2E test data.
 * Deletes e2e-prefixed data AND seed-script data (quests, tasks, etc.)
 */

const SUPABASE_URL = 'https://vvfgxcykxjybtvpfzwyx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.E2E_SUPABASE_SERVICE_KEY || '';

// Same IDs as global-setup.ts
const STUDENT_ID = 'f800c931-d295-4d78-9bc3-cdf6d0dc8eab';
const CHILD_ID = '7741e099-5305-4d99-8db0-5c7418be94b4';
const QUEST_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const QUEST_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const COURSE_ID = '12345678-1234-1234-1234-123456789012';
const TASK_1_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const TASK_2_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

async function deleteWhere(table: string, query: string) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
  });
  if (!res.ok && res.status !== 404) {
    console.warn(`  WARN: cleanup ${table} ${res.status}`);
  }
}

export default async function globalTeardown() {
  if (!SUPABASE_SERVICE_KEY) {
    console.log('[e2e-teardown] No SUPABASE_SERVICE_KEY - skipping cleanup');
    return;
  }

  console.log('[e2e-teardown] Cleaning up ALL test data...');

  // e2e-prefixed data
  await deleteWhere('bounty_claims', '?id=like.e2e*');
  await deleteWhere('bounties', '?id=like.e2e*');
  await deleteWhere('curriculum_lessons', '?id=like.e2e*');
  await deleteWhere('learning_events', '?id=like.e2e*');
  await deleteWhere('interest_tracks', '?id=like.e2e*');
  await deleteWhere('notifications', '?id=like.e2e*');
  await deleteWhere('buddies', '?id=like.e2e*');

  // Seed-script data (reverse dependency order)
  await deleteWhere('quest_task_completions', `?user_id=eq.${STUDENT_ID}`);
  await deleteWhere('user_quest_tasks', `?id=in.(${TASK_1_ID},${TASK_2_ID})`);
  await deleteWhere('course_enrollments', `?user_id=eq.${STUDENT_ID}&course_id=eq.${COURSE_ID}`);
  await deleteWhere('course_quests', `?course_id=eq.${COURSE_ID}&quest_id=eq.${QUEST_A_ID}`);
  await deleteWhere('user_quests', `?user_id=in.(${STUDENT_ID},${CHILD_ID})&quest_id=in.(${QUEST_A_ID},${QUEST_B_ID})`);
  await deleteWhere('courses', `?id=eq.${COURSE_ID}`);
  await deleteWhere('quests', `?id=in.(${QUEST_A_ID},${QUEST_B_ID})`);

  console.log('[e2e-teardown] Cleanup complete.');
}
