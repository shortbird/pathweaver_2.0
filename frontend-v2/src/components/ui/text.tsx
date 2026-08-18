import React from 'react';
import { Text as RNText, TextProps } from 'react-native';

interface UITextProps extends TextProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

// One step up from Tailwind's web defaults (12/14/16/18). See the fontSize
// block in tailwind.config.js for why: the app was built almost entirely below
// both platforms' body defaults and read as too small on a phone.
//
// Changing this map is how the whole app moves — there are ~1,800 call sites
// and they all come through here.
const sizeMap = {
  xs: 'text-body-xs',   // 13px — badges, metadata, chips
  sm: 'text-body-sm',   // 15px — secondary reading text
  md: 'text-body-md',   // 17px — body, matching the iOS default
  lg: 'text-body-lg',   // 20px — lead text
};

export function UIText({ className = '', size = 'md', ...props }: UITextProps) {
  return (
    <RNText
      className={`font-poppins text-typo dark:text-dark-typo ${sizeMap[size]} ${className}`}
      {...props}
    />
  );
}
