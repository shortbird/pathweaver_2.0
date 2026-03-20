import React from 'react';
import { Text as RNText, TextProps } from 'react-native';

interface HeadingProps extends TextProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const sizeMap = {
  xs: 'text-sm font-poppins-semibold',
  sm: 'text-base font-poppins-semibold',
  md: 'text-lg font-poppins-bold',
  lg: 'text-xl font-poppins-bold',
  xl: 'text-2xl font-poppins-bold',
  '2xl': 'text-3xl font-poppins-bold',
};

export function Heading({ className = '', size = 'lg', ...props }: HeadingProps) {
  return (
    <RNText
      className={`text-typography ${sizeMap[size]} ${className}`}
      {...props}
    />
  );
}
