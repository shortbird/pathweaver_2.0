import React from 'react';
import { View, ViewProps } from 'react-native';

interface HStackProps extends ViewProps {
  className?: string;
  space?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const spaceMap = {
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
};

export function HStack({ className = '', space, ...props }: HStackProps) {
  const gap = space ? spaceMap[space] : '';
  return <View className={`flex flex-row ${gap} ${className}`} {...props} />;
}
