/**
 * Reaction Bar - Observer reactions on feed items.
 *
 * Shows 5 reaction types (proud, mind_blown, inspired, love_it, curious).
 * One reaction per observer per item (upsert on POST).
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens, ReactionType } from '../../theme/tokens';
import { useThemeStore } from '../../stores/themeStore';
import api from '../../services/api';

const REACTIONS: { type: ReactionType; iconName: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { type: 'proud', iconName: 'star', label: 'Proud' },
  { type: 'mind_blown', iconName: 'flash', label: 'Wow' },
  { type: 'inspired', iconName: 'bulb', label: 'Inspired' },
  { type: 'love_it', iconName: 'heart', label: 'Love' },
  { type: 'curious', iconName: 'search', label: 'Curious' },
];

interface ReactionBarProps {
  targetType: 'completion' | 'learning_event';
  targetId: string;
}

interface ReactionCounts {
  proud: number;
  mind_blown: number;
  inspired: number;
  love_it: number;
  curious: number;
}

export function ReactionBar({ targetType, targetId }: ReactionBarProps) {
  const { colors } = useThemeStore();
  const [counts, setCounts] = useState<ReactionCounts>({
    proud: 0,
    mind_blown: 0,
    inspired: 0,
    love_it: 0,
    curious: 0,
  });
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null);
  const [myReactionId, setMyReactionId] = useState<string | null>(null);

  useEffect(() => {
    loadReactions();
  }, [targetType, targetId]);

  const loadReactions = async () => {
    try {
      const response = await api.get(`/api/observers/reactions/${targetType}/${targetId}`);
      setCounts(response.data.counts || { proud: 0, mind_blown: 0, inspired: 0, love_it: 0, curious: 0 });
      // Find current user's reaction
      const myR = response.data.reactions?.find((r: any) => r.is_mine);
      if (myR) {
        setMyReaction(myR.reaction_type as ReactionType);
        setMyReactionId(myR.id);
      }
    } catch {
      // Reactions may not be available for all users
    }
  };

  const handleReact = async (reactionType: ReactionType) => {
    try {
      if (myReaction === reactionType && myReactionId) {
        // Remove reaction
        await api.delete(`/api/observers/react/${myReactionId}`);
        setMyReaction(null);
        setMyReactionId(null);
        setCounts((prev) => ({ ...prev, [reactionType]: Math.max(0, prev[reactionType] - 1) }));
      } else {
        // Add/change reaction
        const oldReaction = myReaction;
        const response = await api.post('/api/observers/react', {
          target_type: targetType,
          target_id: targetId,
          reaction_type: reactionType,
        });
        setMyReaction(reactionType);
        setMyReactionId(response.data.reaction?.id);
        setCounts((prev) => ({
          ...prev,
          [reactionType]: prev[reactionType] + 1,
          ...(oldReaction ? { [oldReaction]: Math.max(0, prev[oldReaction] - 1) } : {}),
        }));
      }
    } catch {
      // Silent fail - reaction not critical
    }
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0 && !myReaction) {
    // Show compact reaction trigger
    return (
      <View style={styles.compactRow}>
        {REACTIONS.map((r) => (
          <TouchableOpacity key={r.type} style={styles.compactButton} onPress={() => handleReact(r.type)}>
            <Ionicons name={r.iconName} size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {REACTIONS.map((r) => {
        const count = counts[r.type];
        const isActive = myReaction === r.type;
        if (count === 0 && !isActive) return null;
        return (
          <TouchableOpacity
            key={r.type}
            style={[
              styles.reactionChip,
              { borderColor: colors.border },
              isActive && { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
            ]}
            onPress={() => handleReact(r.type)}
          >
            <Ionicons name={r.iconName} size={14} color={isActive ? colors.reactions[r.type] : colors.textSecondary} />
            <Text style={[
              styles.reactionCount,
              { color: colors.textSecondary },
              isActive && { color: colors.primary },
            ]}>
              {count}
            </Text>
          </TouchableOpacity>
        );
      })}
      {/* Show add button for reactions with 0 count */}
      <TouchableOpacity style={[styles.addReaction, { borderColor: colors.border }]}>
        <Text style={[styles.addReactionText, { color: colors.textMuted }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
    paddingTop: tokens.spacing.sm,
  },
  compactRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    paddingTop: tokens.spacing.sm,
  },
  compactButton: {
    padding: tokens.spacing.xs,
  },
  compactIcon: {
    fontSize: 16,
    opacity: 0.5,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: tokens.radius.full,
    paddingVertical: 2,
    paddingHorizontal: tokens.spacing.sm,
  },
  reactionIcon: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: tokens.typography.sizes.xs,
  },
  addReaction: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addReactionText: {
    fontSize: tokens.typography.sizes.sm,
  },
});
