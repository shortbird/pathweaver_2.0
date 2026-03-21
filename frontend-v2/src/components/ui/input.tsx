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
  outline: 'border border-surface-200 rounded-lg bg-white',
  underlined: 'border-b border-surface-200 bg-transparent rounded-none',
  rounded: 'border border-surface-200 rounded-full bg-white',
};

const sizeClasses: Record<InputSize, string> = {
  sm: 'h-9',
  md: 'h-11',
  lg: 'h-14',
};

const InputContext = React.createContext<{
  isDisabled: boolean;
}>({ isDisabled: false });

export function Input({
  className = '',
  variant = 'outline',
  size = 'md',
  isDisabled = false,
  isInvalid = false,
  children,
  ...props
}: InputProps) {
  const invalidClass = isInvalid ? 'border-red-500 border-2' : '';
  const disabledClass = isDisabled ? 'opacity-50' : '';

  return (
    <InputContext.Provider value={{ isDisabled }}>
      <View
        className={`flex-row items-center ${variantClasses[variant]} ${sizeClasses[size]} ${invalidClass} ${disabledClass} ${className}`}
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

export function InputField({ className = '', ...props }: InputFieldProps) {
  const { isDisabled } = React.useContext(InputContext);

  return (
    <TextInput
      className={`flex-1 px-3 font-poppins text-base text-typo ${className}`}
      editable={!isDisabled}
      placeholderTextColor="#9CA3AF"
      {...props}
    />
  );
}

interface InputSlotProps extends PressableProps {
  className?: string;
}

export function InputSlot({ className = '', ...props }: InputSlotProps) {
  return <Pressable className={`items-center justify-center px-2 ${className}`} {...props} />;
}

interface InputIconProps {
  as: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
}

export function InputIcon({ as: iconName, size = 20, color = '#9CA3AF' }: InputIconProps) {
  return <Ionicons name={iconName} size={size} color={color} />;
}
