/**
 * Bounty Board Screen - Browse and filter bounties.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { tokens, PillarKey } from '../theme/tokens';
import { useThemeStore } from '../stores/themeStore';
import { SurfaceCard } from '../components/common/SurfaceCard';
import { GlassBackground } from '../components/common/GlassBackground';
import { useBountyStore, Bounty } from '../stores/bountyStore';

const PILLARS: { key: string; label: string }[] = [
  { key: 'stem', label: 'STEM' },
  { key: 'art', label: 'Art' },
  { key: 'communication', label: 'Comm' },
  { key: 'civics', label: 'Civics' },
  { key: 'wellness', label: 'Wellness' },
];

const TYPES: { key: string; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'challenge', label: 'Challenge' },
  { key: 'family', label: 'Family' },
  { key: 'org', label: 'Org' },
  { key: 'sponsored', label: 'Sponsored' },
];

export function BountyBoardScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useThemeStore();
  const { bounties, isLoading, loadBounties } = useBountyStore();
  const [filterPillar, setFilterPillar] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    await loadBounties({
      pillar: filterPillar ?? undefined,
      type: filterType ?? undefined,
    });
  }, [filterPillar, filterType, loadBounties]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (isLoading && bounties.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <GlassBackground style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>Bounty Board</Text>

      {/* Pillar filters */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, { borderColor: colors.border }, !filterPillar && { backgroundColor: colors.primary, borderColor: colors.primary }]}
          onPress={() => setFilterPillar(null)}
        >
          <Text style={[styles.filterChipText, { color: colors.textSecondary }, !filterPillar && styles.filterChipTextActive]}>All</Text>
        </TouchableOpacity>
        {PILLARS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[
              styles.filterChip,
              { borderColor: colors.border },
              filterPillar === p.key && {
                backgroundColor: colors.pillars[p.key as PillarKey],
                borderColor: colors.pillars[p.key as PillarKey],
              },
            ]}
            onPress={() => setFilterPillar(filterPillar === p.key ? null : p.key)}
          >
            <Text style={[styles.filterChipText, { color: colors.textSecondary }, filterPillar === p.key && { color: '#FFF' }]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Type filters */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, { borderColor: colors.border }, !filterType && { backgroundColor: colors.primary, borderColor: colors.primary }]}
          onPress={() => setFilterType(null)}
        >
          <Text style={[styles.filterChipText, { color: colors.textSecondary }, !filterType && styles.filterChipTextActive]}>All Types</Text>
        </TouchableOpacity>
        {TYPES.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.filterChip, { borderColor: colors.border }, filterType === t.key && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => setFilterType(filterType === t.key ? null : t.key)}
          >
            <Text style={[styles.filterChipText, { color: colors.textSecondary }, filterType === t.key && styles.filterChipTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={bounties}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BountyCard bounty={item} onPress={() => navigation.navigate('BountyDetail', { bountyId: item.id })} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No bounties found.</Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Try changing your filters or check back later.</Text>
          </View>
        }
      />
    </GlassBackground>
  );
}

function BountyCard({ bounty, onPress }: { bounty: Bounty; onPress: () => void }) {
  const { colors } = useThemeStore();
  const deadline = new Date(bounty.deadline);
  const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const pillarColor = colors.pillars[bounty.pillar as PillarKey] || colors.textMuted;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <SurfaceCard style={styles.bountyCard}>
        <View style={styles.bountyHeader}>
          <View style={[styles.pillarDot, { backgroundColor: pillarColor }]} />
          <Text style={[styles.bountyType, { color: colors.textMuted }]}>{bounty.bounty_type}</Text>
          {bounty.sponsored_reward && (
            <Text style={[styles.sponsoredBadge, { color: colors.warning, backgroundColor: colors.warning + '15' }]}>Sponsored</Text>
          )}
        </View>

        <Text style={[styles.bountyTitle, { color: colors.text }]} numberOfLines={2}>{bounty.title}</Text>
        <Text style={[styles.bountyDesc, { color: colors.textSecondary }]} numberOfLines={2}>{bounty.description}</Text>

        <View style={styles.bountyFooter}>
          <Text style={[styles.xpReward, { color: colors.accent }]}>+{bounty.xp_reward} XP</Text>
          <Text style={[styles.deadline, { color: colors.textMuted }]}>
            {daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}
          </Text>
        </View>

        {bounty.sponsored_reward && (
          <View style={[styles.rewardRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.rewardLabel, { color: colors.success }]}>Prize: {bounty.sponsored_reward}</Text>
          </View>
        )}
      </SurfaceCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    // backgroundColor handled by GlassBackground
    paddingTop: 60,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor handled by GlassBackground
  },
  title: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
    paddingHorizontal: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: tokens.spacing.md,
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.sm,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: tokens.radius.full,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.sm,
  },
  filterChipTextActive: {
    color: '#FFF',
  },
  filterChipText: {
    fontSize: tokens.typography.sizes.xs,
  },
  listContent: {
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.xxl,
  },
  bountyCard: {
    marginBottom: tokens.spacing.md,
  },
  bountyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  pillarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  bountyType: {
    fontSize: tokens.typography.sizes.xs,
    textTransform: 'capitalize',
    flex: 1,
  },
  sponsoredBadge: {
    fontSize: tokens.typography.sizes.xs,
    fontWeight: tokens.typography.weights.semiBold,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 1,
    borderRadius: tokens.radius.full,
  },
  bountyTitle: {
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.semiBold,
    marginBottom: tokens.spacing.xs,
  },
  bountyDesc: {
    fontSize: tokens.typography.sizes.sm,
    lineHeight: 20,
    marginBottom: tokens.spacing.sm,
  },
  bountyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xpReward: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.bold,
  },
  deadline: {
    fontSize: tokens.typography.sizes.xs,
  },
  rewardRow: {
    marginTop: tokens.spacing.sm,
    paddingTop: tokens.spacing.sm,
    borderTopWidth: 1,
  },
  rewardLabel: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.medium,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: tokens.spacing.xxl,
  },
  emptyText: {
    fontSize: tokens.typography.sizes.lg,
    marginBottom: tokens.spacing.sm,
  },
  emptySubtext: {
    fontSize: tokens.typography.sizes.sm,
  },
});
