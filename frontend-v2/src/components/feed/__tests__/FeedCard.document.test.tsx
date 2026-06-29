/**
 * FeedCard document-tap regression test.
 *
 * Bug (report 82a4f6a1, build 29): tapping a document attachment in the feed
 * did nothing. Root cause: the document Pressable's onPress called setModal but
 * did NOT stop the tap from bubbling to the card's outer Pressable, so the card
 * navigated to the post detail and unmounted before the modal could render.
 *
 * These tests pin the fix:
 *   - the document tap calls e.stopPropagation() (so it can't bubble to the
 *     card-level onPress), and
 *   - tapping a document opens the full-screen MediaModal with the doc uri.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
  },
}));
jest.mock('@/src/hooks/useFeed', () => ({
  getViewers: jest.fn().mockResolvedValue({ viewers: [], total: 0 }),
  createShareLink: jest.fn(),
  toggleVisibility: jest.fn(),
}));
jest.mock('../VideoPlayer', () => ({ VideoPlayer: () => null }));
jest.mock('../DocumentViewer', () => ({ DocumentViewer: () => null }));
jest.mock('../CommentSheet', () => ({ CommentSheet: () => null }));
// Render MediaModal so we can assert it opened (with which uri).
jest.mock('../MediaModal', () => {
  const { Text } = require('react-native');
  return {
    MediaModal: ({ visible, uri }: { visible: boolean; uri: string }) =>
      visible ? <Text>{`MODAL_OPEN:${uri}`}</Text> : null,
  };
});
jest.mock('@/src/services/imageUrl', () => ({
  displayImageUrl: (url: string | null) => url,
  isHeicUrl: () => false,
}));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FeedCard } from '../FeedCard';
import { createMockFeedItem } from '@/src/__tests__/utils/mockFactories';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

const DOC_URL = 'https://example.com/evidence/scan.pdf';

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
});

afterEach(() => {
  clearAuthState();
});

function renderWithDocument(onPress: () => void) {
  const item = createMockFeedItem({
    evidence: { type: 'document', url: DOC_URL, title: 'My Scan' } as any,
  });
  return render(<FeedCard item={item} onPress={onPress} />);
}

describe('FeedCard document tap', () => {
  it('stops tap propagation so it cannot bubble to the card onPress', () => {
    const onPress = jest.fn();
    const { getByLabelText } = renderWithDocument(onPress);

    const stopPropagation = jest.fn();
    fireEvent.press(getByLabelText('Open document'), { stopPropagation });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('opens the full-screen document modal with the document uri', () => {
    const onPress = jest.fn();
    const { getByLabelText, queryByText } = renderWithDocument(onPress);

    expect(queryByText(`MODAL_OPEN:${DOC_URL}`)).toBeNull();

    fireEvent.press(getByLabelText('Open document'), { stopPropagation: jest.fn() });

    expect(queryByText(`MODAL_OPEN:${DOC_URL}`)).toBeTruthy();
  });
});
