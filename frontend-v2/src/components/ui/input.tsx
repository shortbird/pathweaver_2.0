import React from 'react';
import { View, TextInput, TextInputProps, ViewProps, Pressable, PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type InputVariant = 'outline' | 'underlined' | 'rounded';
type InputSize = 'sm' | 'md' | 'lg';

interface InputProps extends ViewProps {
  className?: string;
  variant?: InputVariant;
  size?: InputSize;
  isDisabled?: boolean;
  isInvalid?: boolean;
}

const variantClasses: Record<InputVariant, string> = {
  outline: 'border border-surface-200 dark:border-dark-surface-300 rounded-lg bg-white dark:bg-dark-surface-100',
  underlined: 'border-b border-surface-200 dark:border-dark-surface-300 bg-transparent rounded-none',
  rounded: 'border border-surface-200 dark:border-dark-surface-300 rounded-full bg-white dark:bg-dark-surface-100',
};

const sizeClasses: Record<InputSize, string> = {
  sm: 'h-10',
  md: 'h-12',
  lg: 'h-14',
};

const InputContext = React.createContext<{
  isDisabled: boolean;
  setFocused: (v: boolean) => void;
}>({ isDisabled: false, setFocused: () => {} });

export function Input({
  className = '',
  variant = 'outline',
  size = 'md',
  isDisabled = false,
  isInvalid = false,
  children,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = React.useState(false);
  const invalidClass = isInvalid ? 'border-red-500 border-2' : '';
  // Focus affordance: tint the border (color-only, no width change so there's
  // no 1px layout jump). Tracked via context since the focus lives on the
  // child TextInput, not this container. Suppressed while invalid.
  const focusClass = !isInvalid && isFocused ? 'border-optio-purple' : '';
  const disabledClass = isDisabled ? 'opacity-50' : '';

  return (
    <InputContext.Provider value={{ isDisabled, setFocused: setIsFocused }}>
      <View
        className={`flex-row items-center ${variantClasses[variant]} ${sizeClasses[size]} ${invalidClass} ${focusClass} ${disabledClass} ${className}`}
        {...props}
      >
        {children}
      </View>
    </InputContext.Provider>
  );
}

interface InputFieldProps extends TextInputProps {
  className?: string;
}

export function InputField({ className = '', onFocus, onBlur, ...props }: InputFieldProps) {
  const { isDisabled, setFocused } = React.useContext(InputContext);

  return (
    <TextInput
      className={`flex-1 px-3 py-2 font-poppins text-sm text-typo dark:text-dark-typo web:outline-none ${className}`}
      editable={!isDisabled}
      placeholderTextColor="#9CA3AF"
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      {...props}
    />
  );
}

interface InputSlotProps extends PressableProps {
  className?: string;
}

export function InputSlot({ className = '', ...props }: InputSlotProps) {
  return (
    <Pressable
      className={`items-center justify-center px-2 web:cursor-pointer hover:opacity-70 ${className}`}
      {...props}
    />
  );
}

interface InputIconProps {
  as: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
}

export function InputIcon({ as: iconName, size = 20, color = '#9CA3AF' }: InputIconProps) {
  return <Ionicons name={iconName} size={size} color={color} />;
}
