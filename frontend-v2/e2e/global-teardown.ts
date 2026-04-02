/**
 * Playwright Global Teardown - Cleans up all E2E test data.
 * Deletes everything with e2e-prefixed IDs.
 */

const SUPABASE_URL = 'https://vvfgxcykxjybtvpfzwyx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.E2E_SUPABASE_SERVICE_KEY || '';

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

  console.log('[e2e-teardown] Cleaning up test data...');

  // Delete in reverse dependency order
  await deleteWhere('bounty_claims', '?id=like.e2e*');
  await deleteWhere('bounties', '?id=like.e2e*');
  await deleteWhere('curriculum_lessons', '?id=like.e2e*');
  await deleteWhere('learning_events', '?id=like.e2e*');
  await deleteWhere('interest_tracks', '?id=like.e2e*');
  await deleteWhere('notifications', '?id=like.e2e*');
  await deleteWhere('buddies', '?id=like.e2e*');

  console.log('[e2e-teardown] Cleanup complete.');
}
