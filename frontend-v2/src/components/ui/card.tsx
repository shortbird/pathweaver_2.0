import React from 'react';
import { View, ViewProps } from 'react-native';

type CardVariant = 'elevated' | 'outline' | 'filled' | 'ghost' | 'brand';
type CardSize = 'sm' | 'md' | 'lg';

interface CardProps extends ViewProps {
  className?: string;
  variant?: CardVariant;
  size?: CardSize;
}

const variantClasses: Record<CardVariant, string> = {
  elevated: 'bg-white dark:bg-dark-surface-100',
  outline: 'border border-surface-200 dark:border-dark-surface-300 bg-white dark:bg-dark-surface-100',
  filled: 'bg-surface-50 dark:bg-dark-surface-50',
  ghost: '',
  brand: 'bg-brand-surface-50 dark:bg-dark-surface-100 border border-brand-surface-200 dark:border-dark-surface-300',
};

const sizeClasses: Record<CardSize, string> = {
  sm: 'p-3 rounded-lg',
  md: 'p-4 rounded-xl',
  lg: 'p-6 rounded-2xl',
};

// Warm purple-tinted shadow for elevated cards
const elevatedShadow = {
  shadowColor: '#6D469B',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
};

export function Card({
  className = '',
  variant = 'elevated',
  size = 'md',
  style,
  ...props
}: CardProps) {
  const shadow = variant === 'elevated' ? elevatedShadow : undefined;

  return (
    <View
      className={`${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      style={[shadow, style]}
      {...props}
    />
  );
}
