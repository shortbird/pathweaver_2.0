/**
 * Avatar tests.
 *
 * AvatarImage moved from React Native's <Image> to expo-image (398825a0) and
 * kept its `w-full h-full` className. NativeWind does not wrap expo-image, so
 * the image laid out at 0x0 and every avatar in the app was a blank purple
 * circle. The size has to be an explicit style.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Avatar, AvatarImage } from '../avatar';

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: any) => <View testID="expo-image" {...props} /> };
});

describe('AvatarImage', () => {
  it('fills the avatar with an explicit width and height', () => {
    const { getByTestId } = render(
      <Avatar>
        <AvatarImage source={{ uri: 'https://x.test/a.jpg' }} />
      </Avatar>
    );
    const img = getByTestId('expo-image');
    expect(img.props.style).toEqual(expect.objectContaining({ width: '100%', height: '100%' }));
  });

  it('routes an iPhone HEIC avatar through the transcoding endpoint', () => {
    const { getByTestId } = render(
      <Avatar>
        <AvatarImage source={{ uri: 'https://x.supabase.co/storage/v1/object/sign/user-uploads/a.heic?token=t' }} />
      </Avatar>
    );
    expect(getByTestId('expo-image').props.source.uri).toBe(
      'https://x.supabase.co/storage/v1/render/image/sign/user-uploads/a.heic?token=t'
    );
  });
});
