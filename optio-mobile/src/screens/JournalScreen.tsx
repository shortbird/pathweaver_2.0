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
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { tokens, PillarKey } from '../theme/tokens';
import { useNavigation } from '@react-navigation/native';
import { GlassCard } from '../components/common/GlassCard';
import { GlassBackground } from '../components/common/GlassBackground';
import api from '../services/api';
import { addToQueue, syncQueue, getPendingCount } from '../utils/offlineQueue';

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
  const [text, setText] = useState('');
  const [selectedPillars, setSelectedPillars] = useState<PillarKey[]>([]);
  const [submitting, setSubmitting] = useState(false);
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

  const togglePillar = (key: PillarKey) => {
    setSelectedPillars((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (trimmed.length < 10) {
      Alert.alert('Too short', 'Please write at least 10 characters.');
      return;
    }

    setSubmitting(true);
    let pillars = selectedPillars as string[];
    try {
      // Get AI pillar suggestion if none selected
      if (pillars.length === 0) {
        try {
          const aiResponse = await api.post('/api/learning-events/ai-suggestions', {
            description: trimmed,
          });
          pillars = aiResponse.data.suggestions?.pillars || ['wellness'];
        } catch {
          pillars = ['wellness'];
        }
      }

      await api.post('/api/learning-events', {
        description: trimmed,
        pillars,
        source_type: 'realtime',
      });

      setText('');
      setSelectedPillars([]);
      setShowCompose(false);
      loadEvents();
    } catch (error: any) {
      // Offline fallback: queue for later sync
      if (!error.response) {
        await addToQueue({ description: trimmed, pillars, source_type: 'realtime' });
        setPendingCount(await getPendingCount());
        Alert.alert('Saved Offline', 'Your entry will sync when you are back online.');
        setText('');
        setSelectedPillars([]);
        setShowCompose(false);
        return;
      }
      Alert.alert('Error', error.response?.data?.error || 'Failed to save entry');
    } finally {
      setSubmitting(false);
    }
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
        <GlassCard style={styles.composeCard}>
          <TextInput
            style={styles.composeInput}
            placeholder="What did you learn today? (min 10 chars)"
            placeholderTextColor={tokens.colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            autoFocus
          />

          <Text style={styles.pillarLabel}>Tag pillars (optional - AI will suggest):</Text>
          <View style={styles.pillarRow}>
            {PILLARS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[
                  styles.pillarChip,
                  {
                    borderColor: tokens.colors.pillars[p.key],
                    backgroundColor: selectedPillars.includes(p.key)
                      ? tokens.colors.pillars[p.key]
                      : 'transparent',
                  },
                ]}
                onPress={() => togglePillar(p.key)}
              >
                <Text
                  style={[
                    styles.pillarChipText,
                    { color: selectedPillars.includes(p.key) ? '#FFF' : tokens.colors.pillars[p.key] },
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.submitText}>Save Entry</Text>
            )}
          </TouchableOpacity>
        </GlassCard>
      )}

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, !filterPillar && styles.filterChipActive]}
          onPress={() => setFilterPillar(null)}
        >
          <Text style={[styles.filterChipText, !filterPillar && styles.filterChipTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {PILLARS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[
              styles.filterChip,
              filterPillar === p.key && {
                backgroundColor: tokens.colors.pillars[p.key],
                borderColor: tokens.colors.pillars[p.key],
              },
            ]}
            onPress={() => setFilterPillar(filterPillar === p.key ? null : p.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                filterPillar === p.key && { color: '#FFF' },
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
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
      <GlassCard style={styles.entryCard}>
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
  composeInput: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.md,
    fontSize: tokens.typography.sizes.md,
    color: tokens.colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: tokens.spacing.sm,
  },
  pillarLabel: {
    fontSize: tokens.typography.sizes.xs,
    color: tokens.colors.textSecondary,
    marginBottom: tokens.spacing.sm,
  },
  pillarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  pillarChip: {
    borderWidth: 1.5,
    borderRadius: tokens.radius.full,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.sm,
  },
  pillarChipText: {
    fontSize: tokens.typography.sizes.xs,
    fontWeight: tokens.typography.weights.medium,
  },
  submitButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    alignItems: 'center',
  },
  submitText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.semiBold,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: tokens.spacing.md,
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
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
