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
}
