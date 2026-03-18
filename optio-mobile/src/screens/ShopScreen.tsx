/**
 * Shop Screen - Browse and purchase Yeti items with Spendable XP.
 *
 * Shows item catalog filtered by category, purchase flow, and inventory.
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
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../theme/tokens';
import { shopCategoryIcons } from '../theme/icons';
import { SurfaceCard } from '../components/common/SurfaceCard';
import { GlassBackground } from '../components/common/GlassBackground';
import { useYetiStore, ShopItem } from '../stores/yetiStore';
import { useThemeStore } from '../stores/themeStore';

const CATEGORIES = [
  { key: null, label: 'All' },
  { key: 'food', label: 'Food' },
  { key: 'toy', label: 'Toys' },
  { key: 'accessory', label: 'Accessories' },
] as const;

export function ShopScreen() {
  const navigation = useNavigation();
  const { colors } = useThemeStore();
  const { shopItems, spendableXp, isLoading, error, loadShop, loadBalance, buyItem, clearError } =
    useYetiStore();
  const [category, setCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    await Promise.all([loadShop(category ?? undefined), loadBalance()]);
  }, [category, loadShop, loadBalance]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleBuy = async (item: ShopItem) => {
    if (spendableXp < item.xp_cost) {
      Alert.alert('Not enough XP', `You need ${item.xp_cost} XP but only have ${spendableXp}.`);
      return;
    }

    setBuying(item.id);
    try {
      await buyItem(item.id);
      await loadBalance();
      Alert.alert('Purchased!', `You bought ${item.name}.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Purchase failed');
    } finally {
      setBuying(null);
    }
  };

  if (isLoading && shopItems.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <GlassBackground style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
          <Text style={[styles.backButton, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Yeti Shop</Text>
        <View style={[styles.balanceBadge, { backgroundColor: colors.accent }]}>
          <Text style={styles.balanceText}>{spendableXp} XP</Text>
        </View>
      </View>

      <View style={styles.categoryRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key ?? 'all'}
            style={[
              styles.categoryChip,
              { borderColor: colors.border },
              category === cat.key && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => setCategory(cat.key)}
          >
            <Text
              style={[
                styles.categoryChipText,
                { color: colors.textSecondary },
                category === cat.key && styles.categoryChipTextActive,
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={shopItems}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => (
          <ShopItemCard
            item={item}
            canAfford={spendableXp >= item.xp_cost}
            buying={buying === item.id}
            onBuy={() => handleBuy(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No items available.</Text>
          </View>
        }
      />
    </GlassBackground>
  );
}

function ShopItemCard({
  item,
  canAfford,
  buying,
  onBuy,
}: {
  item: ShopItem;
  canAfford: boolean;
  buying: boolean;
  onBuy: () => void;
}) {
  const { colors } = useThemeStore();

  const effectLines: string[] = [];
  if (item.effect?.hunger) effectLines.push(`+${item.effect.hunger} Hunger`);
  if (item.effect?.happiness) effectLines.push(`+${item.effect.happiness} Happy`);
  if (item.effect?.energy) effectLines.push(`+${item.effect.energy} Energy`);

  return (
    <SurfaceCard style={styles.itemCard}>
      <View style={[styles.itemIconCircle, { backgroundColor: colors.primary + '10' }]}>
        <Ionicons name={(shopCategoryIcons[item.category] || 'cube-outline') as any} size={28} color={colors.primary} />
      </View>
      <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
        {item.name}
      </Text>
      {item.rarity !== 'common' && (
        <Text style={[styles.rarityBadge, { color: colors.pillars.art }, item.rarity === 'legendary' && { color: colors.warning }]}>
          {item.rarity}
        </Text>
      )}
      {effectLines.length > 0 && (
        <Text style={[styles.itemEffect, { color: colors.textSecondary }]}>{effectLines.join(', ')}</Text>
      )}
      <TouchableOpacity
        style={[styles.buyButton, { backgroundColor: colors.primary }, !canAfford && styles.buyButtonDisabled]}
        onPress={onBuy}
        disabled={!canAfford || buying}
      >
        {buying ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <Text style={styles.buyButtonText}>{item.xp_cost} XP</Text>
        )}
      </TouchableOpacity>
    </SurfaceCard>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backButton: {
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.semiBold,
  },
  title: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
  },
  balanceBadge: {
    borderRadius: tokens.radius.full,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
  },
  balanceText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.bold,
  },
  categoryRow: {
    flexDirection: 'row',
    paddingHorizontal: tokens.spacing.md,
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  categoryChip: {
    borderWidth: 1,
    borderRadius: tokens.radius.full,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
  },
  categoryChipText: {
    fontSize: tokens.typography.sizes.sm,
  },
  categoryChipTextActive: {
    color: '#FFF',
  },
  gridRow: {
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.md,
  },
  listContent: {
    paddingBottom: tokens.spacing.xxl,
  },
  itemCard: {
    width: '48%',
    marginBottom: tokens.spacing.md,
    alignItems: 'center',
  },
  itemIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing.sm,
  },
  itemName: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.semiBold,
    textAlign: 'center',
    marginBottom: tokens.spacing.xs,
  },
  rarityBadge: {
    fontSize: tokens.typography.sizes.xs,
    fontWeight: tokens.typography.weights.medium,
    marginBottom: tokens.spacing.xs,
  },
  itemEffect: {
    fontSize: tokens.typography.sizes.xs,
    textAlign: 'center',
    marginBottom: tokens.spacing.sm,
  },
  buyButton: {
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  buyButtonDisabled: {
    opacity: 0.4,
  },
  buyButtonText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.semiBold,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: tokens.spacing.xxl,
  },
  emptyText: {
    fontSize: tokens.typography.sizes.lg,
  },
});
