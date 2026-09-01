/**
 * Tapping a photo a teacher sent has to open it IN the app. It used to hand the
 * URL to Linking.openURL, which on Android is the browser, which is why an
 * iCreate parent reported that her only option was to download the picture
 * (2026-08-31).
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { MessageAttachments } from '../MessageParts';

jest.mock('@/src/components/feed/MediaModal', () => {
  const { Text } = require('react-native');
  return {
    MediaModal: ({ uri, type }: { uri: string; type: string }) => (
      <Text testID="media-modal">{`${type}:${uri}`}</Text>
    ),
  };
});

const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);

beforeEach(() => jest.clearAllMocks());

describe('MessageAttachments', () => {
  it('opens a tapped photo in the in-app viewer, not the browser', () => {
    const { getByTestId, queryByTestId } = render(
      <MessageAttachments
        isMine={false}
        attachments={[{ url: 'https://cdn.test/pic.jpg', type: 'image', name: 'pic.jpg' } as any]}
      />,
    );

    expect(queryByTestId('media-modal')).toBeNull();
    fireEvent.press(getByTestId('message-attachment-image'));

    expect(getByTestId('media-modal')).toHaveTextContent('image:https://cdn.test/pic.jpg');
    expect(openURL).not.toHaveBeenCalled();
  });

  it('opens a video in the same viewer', () => {
    const { getByTestId } = render(
      <MessageAttachments
        isMine={false}
        attachments={[{ url: 'https://cdn.test/clip.mp4', type: 'video', name: 'clip.mp4' } as any]}
      />,
    );

    fireEvent.press(getByTestId('message-attachment-file'));
    expect(getByTestId('media-modal')).toHaveTextContent('video:https://cdn.test/clip.mp4');
    expect(openURL).not.toHaveBeenCalled();
  });

  it('still hands a real file to the OS — there is no in-app reader for one', () => {
    const { getByTestId, queryByTestId } = render(
      <MessageAttachments
        isMine={false}
        attachments={[{ url: 'https://cdn.test/form.docx', type: 'file', name: 'form.docx' } as any]}
      />,
    );

    fireEvent.press(getByTestId('message-attachment-file'));
    expect(queryByTestId('media-modal')).toBeNull();
  });
});
