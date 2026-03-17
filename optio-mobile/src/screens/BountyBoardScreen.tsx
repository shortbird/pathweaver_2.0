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
import { GlassCard } from '../components/common/GlassCard';
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
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </View>
    );
  }

  return (
    <GlassBackground style={styles.container}>
      <Text style={styles.title}>Bounty Board</Text>

      {/* Pillar filters */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, !filterPillar && styles.filterChipActive]}
          onPress={() => setFilterPillar(null)}
        >
          <Text style={[styles.filterChipText, !filterPillar && styles.filterChipTextActive]}>All</Text>
        </TouchableOpacity>
        {PILLARS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[
              styles.filterChip,
              filterPillar === p.key && {
                backgroundColor: tokens.colors.pillars[p.key as PillarKey],
                borderColor: tokens.colors.pillars[p.key as PillarKey],
              },
            ]}
            onPress={() => setFilterPillar(filterPillar === p.key ? null : p.key)}
          >
            <Text style={[styles.filterChipText, filterPillar === p.key && { color: '#FFF' }]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Type filters */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, !filterType && styles.filterChipActive]}
          onPress={() => setFilterType(null)}
        >
          <Text style={[styles.filterChipText, !filterType && styles.filterChipTextActive]}>All Types</Text>
        </TouchableOpacity>
        {TYPES.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.filterChip, filterType === t.key && styles.filterChipActive]}
            onPress={() => setFilterType(filterType === t.key ? null : t.key)}
          >
            <Text style={[styles.filterChipText, filterType === t.key && styles.filterChipTextActive]}>
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
            <Text style={styles.emptyText}>No bounties found.</Text>
            <Text style={styles.emptySubtext}>Try changing your filters or check back later.</Text>
          </View>
        }
      />
    </GlassBackground>
  );
}

function BountyCard({ bounty, onPress }: { bounty: Bounty; onPress: () => void }) {
  const deadline = new Date(bounty.deadline);
  const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const pillarColor = tokens.colors.pillars[bounty.pillar as PillarKey] || tokens.colors.textMuted;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <GlassCard style={styles.bountyCard}>
        <View style={styles.bountyHeader}>
          <View style={[styles.pillarDot, { backgroundColor: pillarColor }]} />
          <Text style={styles.bountyType}>{bounty.bounty_type}</Text>
          {bounty.sponsored_reward && <Text style={styles.sponsoredBadge}>Sponsored</Text>}
        </View>

        <Text style={styles.bountyTitle} numberOfLines={2}>{bounty.title}</Text>
        <Text style={styles.bountyDesc} numberOfLines={2}>{bounty.description}</Text>

        <View style={styles.bountyFooter}>
          <Text style={styles.xpReward}>+{bounty.xp_reward} XP</Text>
          <Text style={styles.deadline}>
            {daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}
          </Text>
        </View>

        {bounty.sponsored_reward && (
          <View style={styles.rewardRow}>
            <Text style={styles.rewardLabel}>Prize: {bounty.sponsored_reward}</Text>
          </View>
        )}
      </GlassCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    color: tokens.colors.text,
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
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.full,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.sm,
  },
  filterChipActive: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
  filterChipText: {
    fontSize: tokens.typography.sizes.xs,
    color: tokens.colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFF',
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
    color: tokens.colors.textMuted,
    textTransform: 'capitalize',
    flex: 1,
  },
  sponsoredBadge: {
    fontSize: tokens.typography.sizes.xs,
    fontWeight: tokens.typography.weights.semiBold,
    color: tokens.colors.warning,
    backgroundColor: tokens.colors.warning + '15',
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 1,
    borderRadius: tokens.radius.full,
  },
  bountyTitle: {
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.semiBold,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.xs,
  },
  bountyDesc: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textSecondary,
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
    color: tokens.colors.accent,
  },
  deadline: {
    fontSize: tokens.typography.sizes.xs,
    color: tokens.colors.textMuted,
  },
  rewardRow: {
    marginTop: tokens.spacing.sm,
    paddingTop: tokens.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
  },
  rewardLabel: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.medium,
    color: tokens.colors.success,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: tokens.spacing.xxl,
  },
  emptyText: {
    fontSize: tokens.typography.sizes.lg,
    color: tokens.colors.textSecondary,
    marginBottom: tokens.spacing.sm,
  },
  emptySubtext: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textMuted,
  },
});
