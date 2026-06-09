/**
 * BountyHowItWorks - role-aware "How bounties work" explainer.
 *
 * The bounty system means something different depending on who you are: a
 * student TAKES ON bounties to earn a reward, while a parent / observer / advisor
 * POSTS them and reviews the work. Nothing in the app taught that split, so
 * each role landed on the Bounties screen without knowing what to do (bug
 * reports: "Bounties need better explanation. For students, parents, and
 * observers. Each role is different and needs to be taught by the app better."
 * + "Update to better explain observer features. Bounties specifically.").
 *
 * This is a compact, dismissible card shown at the top of the Bounties screen.
 * Expanded on first visit; once the user collapses it, it stays collapsed
 * across launches (persisted) but is always re-openable by tapping the header.
 */

import React, { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Card } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { getFlag, setFlag, PrefsKeys } from '@/src/stores/prefsStore';

interface GuideContent {
  intro: string;
  steps: string[];
  footer?: string;
}

/**
 * Copy per role. Students get the "take it on" framing; everyone who can post
 * (parent / observer / advisor / org_admin / superadmin) gets the "post &
 * review" framing, with the right noun for who completes the work.
 */
function contentForRole(role?: string): GuideContent {
  if (role === 'student') {
    return {
      intro: 'Bounties are challenges you take on to earn a reward.',
      steps: [
        'Start a bounty that interests you.',
        'Do the work and add proof — a photo, video, link, or a few words.',
        'Turn it in. Whoever posted it reviews your work and grants your reward.',
      ],
    };
  }
  const isParent = role === 'parent';
  const childNoun = isParent ? 'kid' : 'student';
  const childNounPlural = isParent ? 'kids' : 'students';
  const content: GuideContent = {
    intro: `Bounties are challenges you post for your ${childNounPlural} to take on.`,
    steps: [
      'Post a bounty with a few clear deliverables and a reward.',
      `A ${childNoun} takes it on and submits proof of their work.`,
      'Review what they turned in — approve their reward, or ask for another try.',
    ],
  };
  if (role === 'observer') {
    content.footer = 'You can also leave encouraging comments on their work.';
  }
  return content;
}

export function BountyHowItWorks({ role }: { role?: string }) {
  const c = useThemeColors();
  // null = haven't read the saved preference yet; render nothing to avoid a
  // flash of the wrong state on mount.
  const [collapsed, setCollapsed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getFlag(PrefsKeys.BountyGuideCollapsed).then((v) => {
      if (active) setCollapsed(v);
    });
    return () => { active = false; };
  }, []);

  if (collapsed === null) return null;

  const content = contentForRole(role);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    setFlag(PrefsKeys.BountyGuideCollapsed, next);
  };

  return (
    <Card variant="filled" size="md">
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? 'Show how bounties work' : 'Hide how bounties work'}
      >
        <HStack className="items-center gap-2">
          <Ionicons name="information-circle-outline" size={18} color="#6D469B" />
          <UIText size="sm" className="font-poppins-semibold text-optio-purple flex-1">
            How bounties work
          </UIText>
          <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={c.iconMuted} />
        </HStack>
      </Pressable>

      {!collapsed && (
        <VStack space="sm" className="mt-3">
          <UIText size="sm" className="text-typo-600 dark:text-dark-typo-600">
            {content.intro}
          </UIText>
          <VStack space="xs">
            {content.steps.map((step, i) => (
              <HStack key={i} className="items-start gap-2.5">
                <View className="w-5 h-5 rounded-full bg-optio-purple/15 items-center justify-center mt-0.5">
                  <UIText size="xs" className="text-optio-purple font-poppins-bold">{i + 1}</UIText>
                </View>
                <UIText size="sm" className="text-typo-600 dark:text-dark-typo-600 flex-1">
                  {step}
                </UIText>
              </HStack>
            ))}
          </VStack>
          {content.footer && (
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
              {content.footer}
            </UIText>
          )}
        </VStack>
      )}
    </Card>
  );
}
