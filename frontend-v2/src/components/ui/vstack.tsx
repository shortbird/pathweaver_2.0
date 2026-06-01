import React from 'react';
import { View, ViewProps } from 'react-native';

interface VStackProps extends ViewProps {
  className?: string;
  space?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const spaceMap = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export function VStack({ className = '', space, style, ...props }: VStackProps) {
  // Only force an inline gap when `space` is given. Setting `gap: 0` inline
  // unconditionally overrides any `gap-*` className (inline style wins over
  // NativeWind className), which silently killed className-based spacing.
  return (
    <View
      style={[{ flexDirection: 'column' }, space ? { gap: spaceMap[space] } : null, style]}
      className={className}
      {...props}
    />
  );
}
