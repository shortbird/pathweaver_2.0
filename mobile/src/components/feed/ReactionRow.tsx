/**
 * ReactionRow -- a friend's one-tap encouragement on a feed card.
 *
 * Renders the fixed palette as chips. Counts are per key and there is no
 * total anywhere: the palette is encouragement, and a number to rank by is
 * the thing core_philosophy forbids. Tapping a chip sets that reaction
 * (replacing a different one); tapping the chip already set clears it.
 *
 * Shown to a peer viewer (who can tap) and to the work's owner and their
 * adults (who see what friends left, and cannot tap -- reacting to your own
 * work, or to your child's, is not the feature).
 */

import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { HStack, UIText } from '../ui';
import { REACTIONS, setReaction, clearReaction, type ReactionKey, type ReactionSummary, type ReactionTarget } from '@/src/hooks/useFriends';
import { haptic } from '@/src/utils/haptics';

interface Props {
  target: ReactionTarget;
  summary: ReactionSummary | undefined;
  /** True when the viewer is a connected peer of the work's owner. */
  canReact: boolean;
}

export function ReactionRow({ target, summary, canReact }: Props) {
  const [byKey, setByKey] = useState<Partial<Record<ReactionKey, number>>>(summary?.by_key || {});
  const [mine, setMine] = useState<ReactionKey | null>(summary?.mine ?? null);
  const [busy, setBusy] = useState(false);

  const tap = useCallback(async (key: ReactionKey) => {
    if (!canReact || busy) return;
    setBusy(true);
    const prevMine = mine;
    const prevByKey = byKey;
    // Optimistic: move my one reaction, or take it back.
    const next = { ...byKey };
    if (prevMine) next[prevMine] = Math.max(0, (next[prevMine] || 1) - 1);
    const clearing = prevMine === key;
    if (!clearing) next[key] = (next[key] || 0) + 1;
    setByKey(next);
    setMine(clearing ? null : key);
    haptic.light();
    try {
      if (clearing) await clearReaction(target);
      else await setReaction(target, key);
    } catch {
      haptic.error();
      setByKey(prevByKey);
      setMine(prevMine);
    } finally {
      setBusy(false);
    }
  }, [canReact, busy, mine, byKey, target]);

  const visible = REACTIONS.filter((r) => canReact || (byKey[r.key] || 0) > 0);
  if (visible.length === 0) return null;

  return (
    <HStack className="flex-wrap gap-2 pt-1">
      {visible.map((r) => {
        const count = byKey[r.key] || 0;
        const active = mine === r.key;
        const chip = (
          <View
            className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 border ${active ? 'bg-optio-purple/10 border-optio-purple' : 'bg-surface-50 border-surface-200 dark:bg-dark-surface-100 dark:border-dark-surface-300'}`}
          >
            <UIText size="sm">{r.emoji}</UIText>
            <UIText size="xs" className={active ? 'text-optio-purple font-poppins-semibold' : 'text-typo-500 dark:text-dark-typo-500'}>
              {r.label}{count > 0 ? ` · ${count}` : ''}
            </UIText>
          </View>
        );
        return canReact ? (
          <Pressable
            key={r.key}
            onPress={(e) => { e?.stopPropagation?.(); tap(r.key); }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={r.label}
            testID={`reaction-${r.key}`}
          >
            {chip}
          </Pressable>
        ) : <View key={r.key}>{chip}</View>;
      })}
    </HStack>
  );
}
