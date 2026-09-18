/**
 * LinkedText — a UIText whose inline URLs are tappable.
 *
 * Same props as UIText; the string children are split with utils/linkify and
 * each link is rendered as a nested <Text> in the brand colour that opens
 * through safeOpenURL (never Linking.openURL bare: a value the OS cannot route
 * must be a no-op, not a crash). Non-string children pass straight through.
 */

import React from 'react';
import { Text as RNText } from 'react-native';
import { UIText, type UITextProps } from './text';
import { linkify } from '@/src/utils/linkify';
import { safeOpenURL } from '@/src/utils/linking';
import { toast } from './toast';

export interface LinkedTextProps extends Omit<UITextProps, 'children'> {
  children?: React.ReactNode;
  /** Tailwind classes for the link runs. */
  linkClassName?: string;
}

export function LinkedText({ children, linkClassName = 'text-optio-purple underline', ...props }: LinkedTextProps) {
  if (typeof children !== 'string') return <UIText {...props}>{children}</UIText>;
  const parts = linkify(children);
  if (!parts.some((p) => p.url)) return <UIText {...props}>{children}</UIText>;

  const open = async (url: string) => {
    const ok = await safeOpenURL(url);
    if (!ok) toast.error("Couldn't open that link");
  };

  return (
    <UIText {...props}>
      {parts.map((p, i) => (p.url ? (
        <RNText
          key={i}
          className={linkClassName}
          onPress={() => open(p.url!)}
          accessibilityRole="link"
          testID="linked-text-link"
        >
          {p.text}
        </RNText>
      ) : (
        <RNText key={i}>{p.text}</RNText>
      )))}
    </UIText>
  );
}

export default LinkedText;
