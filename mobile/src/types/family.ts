/**
 * A child on a parent's account, as every parent surface sees it.
 *
 * Lives here rather than in hooks/useParent so the family store can name it
 * without importing the hook that reads the store (a type-only import cycle
 * counts: it is erased today and becomes real the moment somebody imports a
 * value across the same edge -- src/__tests__/importCycles.test.js).
 */
export interface Child {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  total_xp: number;
  is_dependent: boolean;
  date_of_birth: string | null;
  role: string;
  // The rest arrive from GET /api/family/children; the observer list
  // (/api/observers/my-students) does not carry them.
  /** This guardian owns the child's login (users.managed_by_parent_id). */
  managed_by_me?: boolean;
  /** Which of the three parent links hold for this guardian. */
  links?: { managed: boolean; linked: boolean; household: boolean };
  organization_id?: string | null;
  level?: number;
  active_quest_count?: number;
  age?: number | null;
  email?: string | null;
}
