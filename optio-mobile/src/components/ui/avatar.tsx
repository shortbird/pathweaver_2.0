import React from 'react';
import { View, Text, Image, ViewProps } from 'react-native';

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

const textSizeClasses: Record<AvatarSize, string> = {
  xs: 'text-xs',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-lg',
  xl: 'text-xl',
};

const AvatarContext = React.createContext<{ size: AvatarSize }>({ size: 'md' });

export function Avatar({ className = '', size = 'md', ...props }: AvatarProps) {
  return (
    <AvatarContext.Provider value={{ size }}>
      <View
        className={`items-center justify-center bg-optio-purple overflow-hidden ${sizeClasses[size]} ${className}`}
        {...props}
      />
    </AvatarContext.Provider>
  );
}

interface AvatarFallbackTextProps {
  className?: string;
  children: string;
}

export function AvatarFallbackText({ className = '', children }: AvatarFallbackTextProps) {
  const { size } = React.useContext(AvatarContext);
  return (
    <Text className={`text-white font-poppins-bold ${textSizeClasses[size]} ${className}`}>
      {children}
    </Text>
  );
}

interface AvatarImageProps {
  source: { uri: string };
  className?: string;
}

export function AvatarImage({ source, className = '' }: AvatarImageProps) {
  return <Image source={source} className={`w-full h-full ${className}`} />;
}
