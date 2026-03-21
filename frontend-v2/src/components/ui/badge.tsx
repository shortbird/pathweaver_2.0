import React from 'react';
import { View, Text, ViewProps, TextProps } from 'react-native';

type BadgeAction = 'info' | 'success' | 'warning' | 'error' | 'muted';

interface BadgeProps extends ViewProps {
  className?: string;
  action?: BadgeAction;
}

const actionClasses: Record<BadgeAction, string> = {
  info: 'bg-blue-100',
  success: 'bg-green-100',
  warning: 'bg-amber-100',
  error: 'bg-red-100',
  muted: 'bg-surface-100',
};

export function Badge({ className = '', action = 'info', ...props }: BadgeProps) {
  return (
    <View
      className={`self-start px-2.5 py-1 rounded-full ${actionClasses[action]} ${className}`}
      {...props}
    />
  );
}

interface BadgeTextProps extends TextProps {
  className?: string;
}

export function BadgeText({ className = '', ...props }: BadgeTextProps) {
  return <Text className={`text-xs font-poppins-semibold ${className}`} {...props} />;
}
