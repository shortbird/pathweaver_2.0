import React from 'react';
import { View, ViewProps } from 'react-native';

interface VStackProps extends ViewProps {
  className?: string;
  space?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const spaceMap = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export function VStack({ className = '', space, style, ...props }: VStackProps) {
  const gap = space ? spaceMap[space] : 0;
  return (
    <View
      style={[{ flexDirection: 'column', gap }, style]}
      className={className}
      {...props}
    />
  );
}
