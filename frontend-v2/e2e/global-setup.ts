/**
 * Playwright Global Setup - Seeds test data before all tests run.
 * Uses the Supabase REST API directly (no backend required).
 *
 * All seeded data uses IDs prefixed with 'e2e-' for easy cleanup.
 */

const SUPABASE_URL = 'https://vvfgxcykxjybtvpfzwyx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.E2E_SUPABASE_SERVICE_KEY || '';

// Test user IDs (from seed_e2e_users.py)
const STUDENT_ID = 'f800c931-d295-4d78-9bc3-cdf6d0dc8eab';
const PARENT_ID = '01f90004-9425-49c4-b314-725c89ebb285';
const CHILD_ID = '7741e099-5305-4d99-8db0-5c7418be94b4';
const ADVISOR_ID = 'ba5723e1-eb39-49a1-a4c4-136300064a47';
const OBSERVER_ID = 'c4cbc7a3-41ee-4d13-ad57-14157d868517';
const SUPERADMIN_ID = '8081b187-f8b8-4ec3-bb18-3cbbb55ad6fa';
const ORGADMIN_ID = '93b049fd-c8a2-48ef-b483-161acc559860';

const QUEST_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COURSE_ID = '12345678-1234-1234-1234-123456789012';

// E2E-specific IDs (prefixed for cleanup)
const E2E_LEARNING_EVENT_1 = 'e2e00001-0000-0000-0000-000000000001';
const E2E_LEARNING_EVENT_2 = 'e2e00001-0000-0000-0000-000000000002';
const E2E_LEARNING_EVENT_3 = 'e2e00001-0000-0000-0000-000000000003';
const E2E_TRACK_1 = 'e2e00002-0000-0000-0000-000000000001';
const E2E_NOTIFICATION_1 = 'e2e00003-0000-0000-0000-000000000001';
const E2E_NOTIFICATION_2 = 'e2e00003-0000-0000-0000-000000000002';
const E2E_NOTIFICATION_3 = 'e2e00003-0000-0000-0000-000000000003';
const E2E_BUDDY_ID = 'e2e00004-0000-0000-0000-000000000001';
const E2E_BOUNTY_1 = 'e2e00005-0000-0000-0000-000000000001';
const E2E_BOUNTY_CLAIM_1 = 'e2e00006-0000-0000-0000-000000000001';
const E2E_LESSON_1 = 'e2e00007-0000-0000-0000-000000000001';
const E2E_LESSON_2 = 'e2e00007-0000-0000-0000-000000000002';

async function supabaseQuery(table: string, method: string, body?: any, query?: string) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query || ''}`;
  const headers: Record<string, string> = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    console.warn(`  WARN: ${method} ${table} ${res.status}: ${text.substring(0, 200)}`);
  }
  return res;
}

async function upsert(table: string, data: any | any[]) {
  return supabaseQuery(table, 'POST', Array.isArray(data) ? data : [data]);
}

async function deleteWhere(table: string, query: string) {
  return supabaseQuery(table, 'DELETE', undefined, query);
}

export default async function globalSetup() {
  if (!SUPABASE_SERVICE_KEY) {
    console.log('[e2e-setup] No SUPABASE_SERVICE_KEY - skipping data seed');
    return;
  }

  console.log('[e2e-setup] Seeding test data...');

  // ── Clean up previous E2E data ──
  console.log('[e2e-setup] Cleaning previous e2e data...');
  await deleteWhere('bounty_claims', `?id=eq.${E2E_BOUNTY_CLAIM_1}`);
  await deleteWhere('bounties', `?id=eq.${E2E_BOUNTY_1}`);
  await deleteWhere('learning_events', `?id=in.(${E2E_LEARNING_EVENT_1},${E2E_LEARNING_EVENT_2},${E2E_LEARNING_EVENT_3})`);
  await deleteWhere('interest_tracks', `?id=eq.${E2E_TRACK_1}`);
  await deleteWhere('notifications', `?id=in.(${E2E_NOTIFICATION_1},${E2E_NOTIFICATION_2},${E2E_NOTIFICATION_3})`);
  await deleteWhere('buddies', `?id=eq.${E2E_BUDDY_ID}`);
  await deleteWhere('curriculum_lessons', `?id=in.(${E2E_LESSON_1},${E2E_LESSON_2})`);

  // ── Seed learning events (for journal + feed) ──
  console.log('[e2e-setup] Seeding learning events...');
  await upsert('learning_events', [
    {
      id: E2E_LEARNING_EVENT_1,
      user_id: STUDENT_ID,
      title: 'Built a Python calculator',
      description: 'Created a command-line calculator app using Python functions and error handling',
      pillars: ['stem'],
      source_type: 'realtime',
      event_date: new Date().toISOString().split('T')[0],
    },
    {
      id: E2E_LEARNING_EVENT_2,
      user_id: STUDENT_ID,
      title: 'Sketched wildlife at the park',
      description: 'Spent 2 hours sketching birds and squirrels at the local park',
      pillars: ['art'],
      source_type: 'realtime',
      event_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    },
    {
      id: E2E_LEARNING_EVENT_3,
      user_id: CHILD_ID,
      title: 'Practiced multiplication tables',
      description: 'Worked through 7s and 8s multiplication tables with flashcards',
      pillars: ['stem'],
      source_type: 'parent_capture',
      captured_by_user_id: PARENT_ID,
      event_date: new Date().toISOString().split('T')[0],
    },
  ]);

  // ── Seed interest track (for journal topics) ──
  console.log('[e2e-setup] Seeding interest tracks...');
  await upsert('interest_tracks', [{
    id: E2E_TRACK_1,
    user_id: STUDENT_ID,
    name: 'Coding Projects',
    description: 'All my programming learning moments',
    color: '#6D469B',
    icon: 'code',
  }]);

  // Assign first learning event to the track
  await supabaseQuery('learning_events', 'PATCH', { track_id: E2E_TRACK_1 }, `?id=eq.${E2E_LEARNING_EVENT_1}`);

  // ── Seed notifications ──
  console.log('[e2e-setup] Seeding notifications...');
  await upsert('notifications', [
    {
      id: E2E_NOTIFICATION_1,
      user_id: STUDENT_ID,
      type: 'task_approved',
      title: 'Task Approved',
      message: 'Your task "Complete Python Tutorial" has been approved! +50 XP',
      is_read: false,
      link: '/quests',
    },
    {
      id: E2E_NOTIFICATION_2,
      user_id: STUDENT_ID,
      type: 'announcement',
      title: 'Welcome to Optio!',
      message: 'Start your first quest to begin earning XP.',
      is_read: true,
      link: '/quests',
    },
    {
      id: E2E_NOTIFICATION_3,
      user_id: STUDENT_ID,
      type: 'badge_earned',
      title: 'Badge Earned',
      message: 'You earned the "First Steps" badge!',
      is_read: false,
    },
  ]);

  // ── Seed buddy ──
  console.log('[e2e-setup] Seeding buddy...');
  await upsert('buddies', [{
    id: E2E_BUDDY_ID,
    user_id: STUDENT_ID,
    name: 'Sparky',
    vitality: 75,
    bond: 50,
    stage: 2,
    highest_stage: 2,
    last_interaction: new Date().toISOString(),
    food_journal: '[]',
    equipped: '{}',
    wallet: 100,
    total_xp_fed: 200,
    xp_fed_today: 0,
  }]);

  // ── Seed bounty with claim ──
  console.log('[e2e-setup] Seeding bounties...');
  await upsert('bounties', [{
    id: E2E_BOUNTY_1,
    poster_id: PARENT_ID,
    title: 'Clean Up the Community Garden',
    description: 'Help maintain the community garden for 2 hours',
    requirements: 'Spend 2 hours helping in the garden',
    bounty_type: 'family',
    xp_reward: 100,
    pillar: 'civics',
    status: 'active',
    visibility: 'family',
    max_participants: 3,
    deadline: '2026-12-31',
    deliverables: JSON.stringify([
      { id: 'd1', label: 'Photo of work done', completed: false },
      { id: 'd2', label: 'Log 2 hours', completed: false },
    ]),
    allowed_student_ids: JSON.stringify([CHILD_ID]),
  }]);

  // Bounty claim from child
  await upsert('bounty_claims', [{
    id: E2E_BOUNTY_CLAIM_1,
    bounty_id: E2E_BOUNTY_1,
    student_id: CHILD_ID,
    status: 'in_progress',
  }]);

  // ── Seed curriculum lessons for the course quest ──
  console.log('[e2e-setup] Seeding curriculum lessons...');
  await upsert('curriculum_lessons', [
    {
      id: E2E_LESSON_1,
      quest_id: QUEST_A_ID,
      title: 'Introduction to Variables',
      description: 'Learn what variables are and how to use them',
      content: '<h2>What is a Variable?</h2><p>A variable is a named container for storing data.</p>',
      sequence_order: 1,
      is_published: true,
      is_required: true,
      created_by: SUPERADMIN_ID,
    },
    {
      id: E2E_LESSON_2,
      quest_id: QUEST_A_ID,
      title: 'Control Flow with If/Else',
      description: 'Make decisions in your code with conditionals',
      content: '<h2>If/Else Statements</h2><p>Use conditionals to control program flow.</p>',
      sequence_order: 2,
      is_published: true,
      is_required: true,
      created_by: SUPERADMIN_ID,
    },
  ]);

  console.log('[e2e-setup] Seed complete.');
}
