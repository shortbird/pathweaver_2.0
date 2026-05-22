import React from 'react';
import { View, ViewProps } from 'react-native';

interface HStackProps extends ViewProps {
  className?: string;
  space?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const spaceMap = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export function HStack({ className = '', space, style, ...props }: HStackProps) {
  const gap = space ? spaceMap[space] : 0;
  return (
    <View
      style={[{ flexDirection: 'row', gap }, style]}
      className={className}
      {...props}
    />
  );
}
