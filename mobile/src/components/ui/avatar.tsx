import React from 'react';
import { View, Text, ViewProps } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { displayImageUrl } from '@/src/services/imageUrl';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps extends ViewProps {
  className?: string;
  size?: AvatarSize;
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'w-6 h-6 rounded-full',
  sm: 'w-8 h-8 rounded-full',
  md: 'w-10 h-10 rounded-full',
  lg: 'w-14 h-14 rounded-full',
  xl: 'w-20 h-20 rounded-full',
};

const textSizes: Record<AvatarSize, string> = {
  xs: 'text-xs', sm: 'text-xs', md: 'text-sm', lg: 'text-lg', xl: 'text-xl',
};

const AvatarContext = React.createContext<{ size: AvatarSize }>({ size: 'md' });

export function Avatar({ className = '', size = 'md', ...props }: AvatarProps) {
  // Memoized: a fresh `{ size }` each render re-rendered every consumer.
  const ctx = React.useMemo(() => ({ size }), [size]);
  return (
    <AvatarContext.Provider value={ctx}>
      <View
        className={`items-center justify-center bg-optio-purple overflow-hidden ${sizeClasses[size]} ${className}`}
        {...props}
      />
    </AvatarContext.Provider>
  );
}

export function AvatarFallbackText({ className = '', children }: { className?: string; children: string }) {
  const { size } = React.useContext(AvatarContext);
  return <Text className={`text-white font-poppins-bold ${textSizes[size]} ${className}`}>{children}</Text>;
}

/** Avatars are small (24-80px) but the URLs behind them are full-size uploads.
 *  React Native's <Image> re-fetched and re-decoded those on every mount with no
 *  disk cache on Android; expo-image caches the decode and recycles its view, so
 *  a feed card scrolling back into place doesn't pay for the avatar twice. */
export function AvatarImage({ source, className = '' }: { source: { uri: string }; className?: string }) {
  // Sized with an explicit style, not `w-full h-full`: NativeWind does not
  // wrap expo-image, so the className never reached it and the image laid
  // out at 0x0 -- every avatar in the app was a blank purple circle from the
  // moment the RN <Image> was swapped out (398825a0). The HEIC rewrite is the
  // same one the feed applies; an iPhone-uploaded avatar is otherwise blank
  // on Android and the web.
  const uri = displayImageUrl(source?.uri) || source?.uri;
  return (
    <ExpoImage
      source={{ ...source, uri }}
      recyclingKey={source?.uri}
      className={className}
      style={{ width: '100%', height: '100%' }}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={0}
    />
  );
}
