/**
 * feedDetailStore - carries the tapped feed item into the post-detail route.
 *
 * The feed API is aggregation-only (cursor-paginated, no fetch-one-by-id
 * endpoint), so instead of refetching a single post we hand the already-loaded
 * FeedItem to the detail screen through this tiny store. If the store is empty
 * (e.g. the route is deep-linked directly), the detail screen shows a graceful
 * "no longer available" state.
 */

import { create } from 'zustand';
import type { FeedItem } from '@/src/hooks/useFeed';

interface FeedDetailState {
  item: FeedItem | null;
  setItem: (item: FeedItem | null) => void;
}

export const useFeedDetailStore = create<FeedDetailState>((set) => ({
  item: null,
  setItem: (item) => set({ item }),
}));
