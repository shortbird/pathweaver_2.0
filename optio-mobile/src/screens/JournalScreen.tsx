/**
 * Journal Screen - Text capture + chronological feed of learning events.
 *
 * Students can create quick text entries and browse their learning journal.
 * Maps to existing learning_events API.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens, PillarKey } from '../theme/tokens';
import { pillarIcons } from '../theme/icons';
import { useNavigation } from '@react-navigation/native';
import { SurfaceCard } from '../components/common/SurfaceCard';
import { GlassBackground } from '../components/common/GlassBackground';
import { QuickCapture } from '../components/capture/QuickCapture';
import api from '../services/api';
import { syncQueue, getPendingCount } from '../utils/offlineQueue';

const PILLARS: { key: PillarKey; label: string }[] = [
  { key: 'stem', label: 'STEM' },
  { key: 'art', label: 'Art' },
  { key: 'communication', label: 'Comm' },
  { key: 'civics', label: 'Civics' },
  { key: 'wellness', label: 'Wellness' },
];

interface LearningEvent {
  id: string;
  title: string | null;
  description: string;
  pillars: string[];
  created_at: string;
  source_type: string;
}

export function JournalScreen() {
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [filterPillar, setFilterPillar] = useState<PillarKey | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const loadEvents = useCallback(async () => {
    try {
      // Sync any offline entries first
      const pending = await getPendingCount();
      setPendingCount(pending);
      if (pending > 0) {
        const { synced } = await syncQueue();
        if (synced > 0) setPendingCount(await getPendingCount());
      }

      const response = await api.get('/api/learning-events', {
        params: { limit: 50, offset: 0 },
      });
      setEvents(response.data.events || []);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadEvents();
  };

  const handleCaptureSaved = () => {
    setShowCompose(false);
    loadEvents();
  };

  const filteredEvents = filterPillar
    ? events.filter((e) => e.pillars?.includes(filterPillar))
    : events;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </View>
    );
  }

  return (
    <GlassBackground style={styles.container}>
      {pendingCount > 0 && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            {pendingCount} offline {pendingCount === 1 ? 'entry' : 'entries'} waiting to sync
          </Text>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.title}>Learning Journal</Text>
        <TouchableOpacity
          style={styles.composeButton}
          onPress={() => setShowCompose(!showCompose)}
        >
          <Text style={styles.composeButtonText}>{showCompose ? 'Cancel' : '+ New'}</Text>
        </TouchableOpacity>
      </View>

      {showCompose && (
        <SurfaceCard style={styles.composeCard}>
          <QuickCapture
            initialMode="text"
            onSaved={handleCaptureSaved}
            onCancel={() => setShowCompose(false)}
          />
        </SurfaceCard>
      )}

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[
            styles.filterIcon,
            {
              borderColor: !filterPillar ? tokens.colors.primary : tokens.colors.border,
              backgroundColor: !filterPillar ? tokens.colors.primary : 'transparent',
            },
          ]}
          onPress={() => setFilterPillar(null)}
        >
          <Text style={{ fontSize: 15, color: !filterPillar ? '#FFF' : tokens.colors.textMuted, fontFamily: tokens.typography.fonts.semiBold }}>
            All
          </Text>
        </TouchableOpacity>
        {PILLARS.map((p) => {
          const active = filterPillar === p.key;
          const pillarColor = tokens.colors.pillars[p.key];
          return (
            <TouchableOpacity
              key={p.key}
              style={[
                styles.filterIcon,
                {
                  borderColor: active ? pillarColor : tokens.colors.border,
                  backgroundColor: active ? pillarColor : 'transparent',
                },
              ]}
              onPress={() => setFilterPillar(active ? null : p.key)}
              accessibilityLabel={p.label}
            >
              <Ionicons
                name={pillarIcons[p.key] as any}
                size={22}
                color={active ? '#FFF' : pillarColor}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filteredEvents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <JournalEntry event={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No journal entries yet.</Text>
            <Text style={styles.emptySubtext}>Tap "+ New" to capture a learning moment.</Text>
          </View>
        }
      />
    </GlassBackground>
  );
}

function JournalEntry({ event }: { event: LearningEvent }) {
  const navigation = useNavigation<any>();
  const date = new Date(event.created_at);
  const dateStr = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const timeStr = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => navigation.navigate('JournalDetail', { eventId: event.id })}
    >
      <SurfaceCard style={styles.entryCard}>
        {event.title ? <Text style={styles.entryTitle}>{event.title}</Text> : null}
        <Text style={styles.entryDescription} numberOfLines={4}>
          {event.description}
        </Text>
        <View style={styles.entryFooter}>
          <View style={styles.entryPillars}>
            {event.pillars?.map((p) => (
              <View
                key={p}
                style={[
                  styles.entryPillarDot,
                  { backgroundColor: tokens.colors.pillars[p as PillarKey] || tokens.colors.textMuted },
                ]}
              />
            ))}
          </View>
          <Text style={styles.entryDate}>
            {dateStr} at {timeStr}
          </Text>
        </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
  },
  title: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
    color: tokens.colors.text,
  },
  composeButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
  },
  composeButtonText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.semiBold,
  },
  composeCard: {
    marginHorizontal: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: tokens.spacing.md,
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  filterIcon: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 9999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.xxl,
  },
  entryCard: {
    marginBottom: tokens.spacing.md,
  },
  entryTitle: {
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.semiBold,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.xs,
  },
  entryDescription: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textSecondary,
    lineHeight: 20,
    marginBottom: tokens.spacing.sm,
  },
  entryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryPillars: {
    flexDirection: 'row',
    gap: tokens.spacing.xs,
  },
  entryPillarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  entryDate: {
    fontSize: tokens.typography.sizes.xs,
    color: tokens.colors.textMuted,
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
  pendingBanner: {
    backgroundColor: tokens.colors.warning + '20',
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
    marginHorizontal: tokens.spacing.md,
    marginBottom: tokens.spacing.sm,
  },
  pendingText: {
    fontSize: tokens.typography.sizes.xs,
    color: tokens.colors.warning,
    textAlign: 'center',
    fontWeight: tokens.typography.weights.medium,
  },
});
