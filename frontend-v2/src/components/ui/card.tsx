import React from 'react';
import { View, ViewProps } from 'react-native';

type CardVariant = 'elevated' | 'outline' | 'filled' | 'ghost';
type CardSize = 'sm' | 'md' | 'lg';

interface CardProps extends ViewProps {
  className?: string;
  variant?: CardVariant;
  size?: CardSize;
}

const variantClasses: Record<CardVariant, string> = {
  elevated: 'bg-white shadow-md',
  outline: 'border border-surface-200 bg-white',
  filled: 'bg-surface-50',
  ghost: '',
};

const sizeClasses: Record<CardSize, string> = {
  sm: 'p-3 rounded-lg',
  md: 'p-4 rounded-xl',
  lg: 'p-6 rounded-2xl',
};

export function Card({
  className = '',
  variant = 'elevated',
  size = 'md',
  ...props
}: CardProps) {
  return (
    <View
      className={`${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
