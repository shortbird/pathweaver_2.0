# Data Freshness Implementation Tracker

## Problem Summary
Users experience stale data that only refreshes after logout/login due to:
1. Dual authentication systems (localStorage vs httpOnly cookies)
2. React Query installed but not properly utilized
3. localStorage caching without refresh mechanisms
4. No global state invalidation
5. Missing event-driven updates

## Implementation Phases

### Phase 1: Configure React Query Infrastructure ✅
- [x] Set up QueryClient with proper cache configuration
- [x] Create query key factory for consistent naming
- [x] Add default staleTime and cacheTime settings
- [x] Enable refetchOnWindowFocus for active data

### Phase 2: Create API Hooks Layer ✅
- [x] Create hooks/useUserData.js for user profile
- [x] Create hooks/useQuests.js for quest operations
- [x] Create hooks/useFriends.js for friends data
- [x] Create hooks/usePortfolio.js for diploma/portfolio

### Phase 3: Migrate Authentication ✅
- [x] Update AuthContext to use React Query
- [x] Remove localStorage user caching
- [x] Implement proper token refresh with cache invalidation
- [x] Add user data refetch on login

### Phase 4: Component Migration ✅
#### Dashboard ✅
- [x] Replace useEffect/api calls with useQuery
- [x] Add cache invalidation on quest completion
- [x] Remove manual refresh intervals
- [x] Add automatic refetch intervals

#### Quest Pages ✅
- [x] Update QuestDetailV3 cache invalidation
- [x] Add mutation hooks for enrollment/completion
- [x] Implement optimistic updates via React Query

#### Social Features ✅
- [x] Migrate FriendsPage to React Query
- [x] Add real-time friend request updates
- [x] Cache collaboration invitations
- [x] Add optimistic UI for friend actions

#### Profile/Settings ⚠️
- [x] Create API hooks for profile updates
- [ ] Migrate ProfilePage to React Query (partial)
- [ ] Update subscription changes globally
- [ ] Sync user data across components

### Phase 5: Global Event System ✅
- [x] Global cache invalidation via React Query
- [x] Automatic cache invalidation on mutations
- [x] Event-driven updates via queryClient.invalidateQueries
- [x] Built-in error recovery via React Query

### Phase 6: Testing & Optimization 🔄
- [x] Add loading and error states
- [x] Implement retry logic via React Query
- [x] Frontend server running for testing
- [ ] Test complete user flows for data freshness
- [ ] Verify cache invalidation works correctly end-to-end

## Files to Modify

### Core Infrastructure
1. `frontend/src/App.jsx` - QueryClient configuration
2. `frontend/src/utils/queryKeys.js` - NEW: Query key factory
3. `frontend/src/hooks/api/` - NEW: API hooks directory

### Authentication
4. `frontend/src/contexts/AuthContext.jsx` - Migrate to React Query
5. `frontend/src/services/authService.js` - Update to invalidate caches

### Pages
6. `frontend/src/pages/DashboardPage.jsx` - Full React Query migration
7. `frontend/src/pages/QuestHubV3Improved.jsx` - Convert to useQuery
8. `frontend/src/pages/QuestDetailV3.jsx` - Add proper invalidation
9. `frontend/src/pages/FriendsPage.jsx` - Migrate to hooks
10. `frontend/src/pages/ProfilePage.jsx` - Add cache updates

### Components
11. Various components that fetch data independently

## Success Criteria
- [ ] Data updates immediately after actions without page refresh
- [ ] No more localStorage for user data
- [ ] Consistent data across all components
- [ ] Optimistic updates for better UX
- [ ] Proper loading and error states
- [ ] Background refetch for active data

## Testing Checklist
- [ ] Login shows fresh user data
- [ ] Quest completion updates dashboard immediately
- [ ] Profile changes reflect everywhere
- [ ] Friend requests update in real-time
- [ ] Subscription changes apply instantly
- [ ] XP updates show immediately
- [ ] Task completion refreshes progress
- [ ] No stale data after navigation

## Notes
- Prioritize user-facing features first
- Maintain backwards compatibility during migration
- Test on both dev and production environments
- Document any breaking changes