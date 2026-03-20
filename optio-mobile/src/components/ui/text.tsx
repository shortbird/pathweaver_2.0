import React from 'react';
import { Text as RNText, TextProps } from 'react-native';

interface UITextProps extends TextProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const sizeMap = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

export function UIText({ className = '', size = 'md', ...props }: UITextProps) {
  return (
    <RNText
      className={`font-poppins text-typography ${sizeMap[size]} ${className}`}
      {...props}
    />
  );
}
