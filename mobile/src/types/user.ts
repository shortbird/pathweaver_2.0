/**
 * The shape of an authenticated user, as /api/auth/me returns it.
 *
 * This lives in its own module rather than in stores/authStore because
 * services/landingRoute needs the type and authStore needs landingRoute's
 * function -- an import cycle between a store and a service. It was a type-only
 * import, so TypeScript erased it and nothing broke at runtime; it was still a
 * cycle in the source graph, and the day someone imports a VALUE across that
 * edge it becomes a real one, at a call site that has nothing to do with types.
 *
 * authStore re-exports `User`, so every existing `import { User } from
 * '@/src/stores/authStore'` keeps working.
 */

export interface User {
  id: string;
  email: string;
  display_name: string;
  /** From /api/auth/me, which selects the whole users row. Optional because
   *  older cached sessions predate it being read here. */
  created_at?: string;
  first_name: string;
  last_name: string;
  role: string;
  org_role: string | null;
  // Multi-role org users carry every org role here; `org_role` is the legacy
  // single-value field. Role checks must consider both.
  org_roles?: string[] | null;
  organization_id: string | null;
  total_xp: number;
  avatar_url: string | null;
  date_of_birth: string | null;
  /** Set once a date of birth has been attested through an age gate
   *  (POST /api/connections/age-check). Non-null means the profile editor must
   *  not offer to change it — the backend refuses the write either way. */
  date_of_birth_locked_at?: string | null;
  is_dependent: boolean;
  managed_by_parent_id: string | null;
  // Partner program tag (e.g. 'opened-academy' for the OEA Diploma Plan). Null
  // for users not in a partner program.
  program_key: string | null;
  // Remembered AI task generation challenge level ('easier'|'standard'|'challenge').
  // Null means Standard.
  preferred_challenge_level?: string | null;
  // The user's organization, when they belong to one. /api/auth/me embeds it so
  // per-org capability flags (organizations.feature_flags) are available client
  // side without a second request.
  organization?: {
    id: string;
    name?: string;
    slug?: string;
    feature_flags?: Record<string, any> | null;
  } | null;
  // The SCHOOL this user belongs to, which is NOT the same question as
  // `organization`: a parent is usually a platform user with no
  // organization_id and belongs to a school through their child. /api/auth/me
  // resolves it that way (routes/auth/login/core.py _school_payload) and the
  // School page is offered only when this is set. `homepage` is the per-org
  // opt-in (feature_flags.sis_settings.school_homepage).
  school?: {
    id: string;
    name?: string | null;
    homepage?: boolean;
  } | null;
}
