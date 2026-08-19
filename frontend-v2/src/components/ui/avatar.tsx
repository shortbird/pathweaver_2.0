import React from 'react';
import { View, Text, ViewProps } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

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
  return (
    <ExpoImage
      source={source}
      recyclingKey={source?.uri}
      className={`w-full h-full ${className}`}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={0}
    />
  );
}
