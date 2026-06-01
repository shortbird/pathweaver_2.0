import React from 'react';
import { Pressable, PressableProps, Text, TextProps, ActivityIndicator, Platform } from 'react-native';

type ButtonVariant = 'solid' | 'outline' | 'link';
type ButtonAction = 'primary' | 'secondary' | 'positive' | 'negative';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

// V1-style brand gradient on web for primary solid buttons; on native, fall back
// to the solid optio-purple plus a soft warm shadow (no expo-linear-gradient dep).
const brandGradientStyle = Platform.OS === 'web'
  ? {
      backgroundImage: 'linear-gradient(135deg, #6D469B 0%, #8058AC 50%, #EF597B 100%)',
      boxShadow: '0 4px 12px rgba(109, 70, 155, 0.25)',
    } as any
  : {
      shadowColor: '#6D469B',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
      elevation: 3,
    };

interface ButtonProps extends PressableProps {
  className?: string;
  variant?: ButtonVariant;
  action?: ButtonAction;
  size?: ButtonSize;
  loading?: boolean;
}

const variantActionClasses: Record<ButtonVariant, Record<ButtonAction, string>> = {
  solid: {
    primary: 'bg-optio-purple active:bg-optio-purple-dark',
    secondary: 'bg-surface-200 dark:bg-dark-surface-200 active:bg-surface-300 dark:active:bg-dark-surface-300',
    positive: 'bg-green-600 active:bg-green-700',
    negative: 'bg-red-500 active:bg-red-600',
  },
  outline: {
    primary: 'border-2 border-optio-purple bg-transparent active:bg-optio-purple/10',
    secondary: 'border-2 border-surface-200 dark:border-dark-surface-300 bg-transparent active:bg-surface-50 dark:active:bg-dark-surface-100',
    positive: 'border-2 border-green-600 bg-transparent active:bg-green-50',
    negative: 'border-2 border-red-500 bg-transparent active:bg-red-50',
  },
  link: {
    primary: 'bg-transparent',
    secondary: 'bg-transparent',
    positive: 'bg-transparent',
    negative: 'bg-transparent',
  },
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'px-3 py-1.5 rounded-md',
  sm: 'px-4 py-2 rounded-lg',
  md: 'px-5 py-2.5 rounded-lg',
  lg: 'px-6 py-3 rounded-xl',
};

const textVariantAction: Record<ButtonVariant, Record<ButtonAction, string>> = {
  solid: {
    primary: 'text-white',
    secondary: 'text-typo dark:text-dark-typo',
    positive: 'text-white',
    negative: 'text-white',
  },
  outline: {
    primary: 'text-optio-purple',
    secondary: 'text-typo dark:text-dark-typo',
    positive: 'text-green-600',
    negative: 'text-red-500 dark:text-red-400',
  },
  link: {
    primary: 'text-optio-purple',
    secondary: 'text-typo-500 dark:text-dark-typo-500',
    positive: 'text-green-600',
    negative: 'text-red-500 dark:text-red-400',
  },
};

const textSizeClasses: Record<ButtonSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

const ButtonContext = React.createContext<{
  variant: ButtonVariant;
  action: ButtonAction;
  size: ButtonSize;
}>({ variant: 'solid', action: 'primary', size: 'md' });

export function Button({
  className = '',
  variant = 'solid',
  action = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  const base = `flex-row items-center justify-center gap-2 ${sizeClasses[size]} ${variantActionClasses[variant][action]}`;
  // Web affordances: pointer cursor + a subtle hover dim (works for every
  // variant, including the brand-gradient primary whose background can't be
  // shifted by a `hover:bg-*` class). All no-op on native.
  const stateClass =
    disabled || loading
      ? 'opacity-50 web:cursor-not-allowed'
      : 'web:cursor-pointer hover:opacity-90 transition-opacity';
  const isBrandPrimary = variant === 'solid' && action === 'primary';

  return (
    <ButtonContext.Provider value={{ variant, action, size }}>
      <Pressable
        className={`${base} ${stateClass} ${className}`}
        disabled={disabled || loading}
        style={isBrandPrimary ? [brandGradientStyle, style as any] : style}
        {...props}
      >
        {loading && <ActivityIndicator size="small" color={variant === 'solid' ? '#fff' : '#6D469B'} />}
        {children}
      </Pressable>
    </ButtonContext.Provider>
  );
}

interface ButtonTextProps extends TextProps {
  className?: string;
}

export function ButtonText({ className = '', ...props }: ButtonTextProps) {
  const { variant, action, size } = React.useContext(ButtonContext);
  const colorClass = textVariantAction[variant][action];
  const sizeClass = textSizeClasses[size];

  return (
    <Text
      className={`font-poppins-semibold ${sizeClass} ${colorClass} ${className}`}
      {...props}
    />
  );
}
