/**
 * Pin the test process to a timezone west of Greenwich.
 *
 * CI runs on ubuntu-latest, which is UTC. In UTC, local time IS UTC, so a
 * formatter that reads an event stamp in local time gives the same answer as
 * one that reads it in UTC — and the tests that say "10:00, not 4:00" pass
 * whether or not the code is right. Every wall-clock test in this suite was
 * green in CI while the bug they describe was shipping.
 *
 * America/Denver is where the platform's schools are, and the zone in which
 * every one of these reports came in: Labor Day on the Sunday (iCreate,
 * 2026-08-31), the 10am Hang Time at 4am (Perch 1d0d41a9), the 6:30 Moms'
 * Group Night at 12:30 (Marika, 2026-09-15). Local machines are already in
 * it; this makes CI match them.
 *
 * globalSetup runs in the parent before workers fork, so the value is in the
 * environment they inherit. Setting process.env.TZ from inside a test file
 * does not work: Jest hands each test a copy of process.env, and Node only
 * resets its timezone cache through the setter on the real one.
 */
module.exports = async () => {
  process.env.TZ = 'America/Denver';
};
