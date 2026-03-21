import React from 'react';
import { View, ViewProps } from 'react-native';

interface VStackProps extends ViewProps {
  className?: string;
  space?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const spaceMap = { xs: 'gap-1', sm: 'gap-2', md: 'gap-4', lg: 'gap-6', xl: 'gap-8' };

export function VStack({ className = '', space, ...props }: VStackProps) {
  const gap = space ? spaceMap[space] : '';
  return <View className={`flex flex-col ${gap} ${className}`} {...props} />;
}
