import React from 'react';
import { View, ViewProps } from 'react-native';

interface DividerProps extends ViewProps {
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

export function Divider({ className = '', orientation = 'horizontal', ...props }: DividerProps) {
  const dir = orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full';
  return <View className={`bg-surface-200 dark:bg-dark-surface-300 ${dir} ${className}`} {...props} />;
}
