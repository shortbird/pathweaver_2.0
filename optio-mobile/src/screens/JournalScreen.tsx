/**
 * Journal Screen - Text capture + chronological feed of learning events.
 *
 * Students can create quick text entries and browse their learning journal.
 * Supports pillar + topic filtering, and batch topic assignment via
 * long-press multi-select mode.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens, PillarKey } from '../theme/tokens';
import { pillarIcons } from '../theme/icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SurfaceCard } from '../components/common/SurfaceCard';
import { GlassBackground } from '../components/common/GlassBackground';
import { QuickCapture } from '../components/capture/QuickCapture';
import { TopicAssignModal } from '../components/journal/TopicAssignModal';
import { TopicManageModal } from '../components/journal/TopicManageModal';
import { useThemeStore } from '../stores/themeStore';
import api from '../services/api';
import { syncQueue, getPendingCount } from '../utils/offlineQueue';

const PILLARS: { key: PillarKey; label: string }[] = [
  { key: 'stem', label: 'STEM' },
  { key: 'art', label: 'Art' },
  { key: 'communication', label: 'Comm' },
  { key: 'civics', label: 'Civics' },
  { key: 'wellness', label: 'Wellness' },
];

interface EvidenceBlock {
  block_type: string;
  content: any;
  file_url?: string;
}

interface Topic {
  type: string;
  id: string;
  name: string;
  color?: string;
}

interface LearningEvent {
  id: string;
  title: string | null;
  description: string;
  pillars: string[];
  created_at: string;
  source_type: string;
  evidence_blocks?: EvidenceBlock[];
  topics?: Topic[];
}

interface InterestTrack {
  id: string;
  name: string;
  color: string;
  moment_count: number;
}

export function JournalScreen() {
  const { colors } = useThemeStore();
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [filterPillar, setFilterPillar] = useState<PillarKey | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Topic filter state
  const [availableTracks, setAvailableTracks] = useState<InterestTrack[]>([]);
  const [filterTopicId, setFilterTopicId] = useState<string | null>(null);
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [unassignedEvents, setUnassignedEvents] = useState<LearningEvent[]>([]);
  const [showTopicSheet, setShowTopicSheet] = useState(false);
  const [showManageSheet, setShowManageSheet] = useState(false);

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAssignSheet, setShowAssignSheet] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      // Sync any offline entries first
      const pending = await getPendingCount();
      setPendingCount(pending);
      if (pending > 0) {
        const { synced } = await syncQueue();
        if (synced > 0) setPendingCount(await getPendingCount());
      }

      const [eventsRes, tracksRes] = await Promise.all([
        api.get('/api/learning-events', { params: { limit: 50, offset: 0 } }),
        api.get('/api/interest-tracks'),
      ]);
      setEvents(eventsRes.data.events || []);
      setAvailableTracks(tracksRes.data.tracks || tracksRes.data || []);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadUnassigned = useCallback(async () => {
    try {
      const res = await api.get('/api/learning-events/unassigned');
      setUnassignedEvents(res.data.events || []);
    } catch {
      setUnassignedEvents([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents]),
  );

  // Load unassigned events when that filter is activated
  useFocusEffect(
    useCallback(() => {
      if (filterUnassigned) loadUnassigned();
    }, [filterUnassigned, loadUnassigned]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadEvents();
    if (filterUnassigned) loadUnassigned();
  };

  const handleCaptureSaved = () => {
    setShowCompose(false);
    loadEvents();
  };

  // --- Filtering logic ---
  const getFilteredEvents = (): LearningEvent[] => {
    let base: LearningEvent[];

    if (filterUnassigned) {
      base = unassignedEvents;
    } else if (filterTopicId) {
      base = events.filter((e) => e.topics?.some((t) => t.id === filterTopicId));
    } else {
      base = events;
    }

    if (filterPillar) {
      base = base.filter((e) => e.pillars?.includes(filterPillar));
    }

    return base;
  };

  const filteredEvents = getFilteredEvents();

  // --- Topic filter handlers ---
  const handleTopicFilterTap = (trackId: string) => {
    if (filterTopicId === trackId) {
      setFilterTopicId(null);
    } else {
      setFilterTopicId(trackId);
      setFilterUnassigned(false);
    }
  };

  const handleUnassignedTap = () => {
    if (filterUnassigned) {
      setFilterUnassigned(false);
    } else {
      setFilterUnassigned(true);
      setFilterTopicId(null);
      loadUnassigned();
    }
  };

  // --- Selection mode handlers ---
  const enterSelectionMode = (eventId: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([eventId]));
    setShowCompose(false);
  };

  const toggleSelection = (eventId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      // Auto-exit if nothing selected
      if (next.size === 0) {
        setSelectionMode(false);
      }
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // --- Batch assignment ---
  const handleBatchAssign = async (trackId: string) => {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map((id) =>
        api.post(`/api/learning-events/${id}/assign-topic`, {
          type: 'track',
          topic_id: trackId,
          action: 'add',
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    setShowAssignSheet(false);
    exitSelectionMode();
    await loadEvents();
    if (filterUnassigned) await loadUnassigned();

    if (failed > 0) {
      Alert.alert('Assignment', `${succeeded} assigned, ${failed} failed.`);
    }
  };

  const handleCreateAndAssign = async (name: string) => {
    const ids = Array.from(selectedIds);
    try {
      await api.post('/api/interest-tracks', {
        name,
        moment_ids: ids,
      });
    } catch {
      Alert.alert('Error', 'Failed to create topic.');
      return;
    }

    setShowAssignSheet(false);
    exitSelectionMode();
    await loadEvents();
    if (filterUnassigned) await loadUnassigned();
  };

  // --- Topic management ---
  const handleUpdateTrack = async (trackId: string, name: string, color: string) => {
    await api.put(`/api/interest-tracks/${trackId}`, { name, color });
    await loadEvents();
  };

  const handleDeleteTrack = async (trackId: string) => {
    await api.delete(`/api/interest-tracks/${trackId}`);
    // Clear filter if the deleted track was active
    if (filterTopicId === trackId) setFilterTopicId(null);
    await loadEvents();
    if (filterUnassigned) await loadUnassigned();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <GlassBackground style={styles.container}>
      {pendingCount > 0 && (
        <View style={[styles.pendingBanner, { backgroundColor: colors.warning + '20' }]}>
          <Text style={[styles.pendingText, { color: colors.warning }]}>
            {pendingCount} offline {pendingCount === 1 ? 'entry' : 'entries'} waiting to sync
          </Text>
        </View>
      )}

      {/* Header: normal or selection mode */}
      {selectionMode ? (
        <View style={styles.header}>
          <View style={styles.selectionHeaderLeft}>
            <TouchableOpacity onPress={exitSelectionMode} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.selectionCount, { color: colors.text }]}>{selectedIds.size} selected</Text>
          </View>
          <TouchableOpacity
            style={[styles.assignButton, selectedIds.size === 0 && { opacity: 0.4 }]}
            onPress={() => setShowAssignSheet(true)}
            disabled={selectedIds.size === 0}
          >
            <Text style={styles.assignButtonText}>Assign</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Learning Journal</Text>
          <TouchableOpacity
            style={styles.composeButton}
            onPress={() => setShowCompose(!showCompose)}
          >
            <Text style={styles.composeButtonText}>{showCompose ? 'Cancel' : '+ New'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Compose area (hidden during selection mode) */}
      {showCompose && !selectionMode && (
        <SurfaceCard style={styles.composeCard}>
          <QuickCapture
            initialMode="text"
            onSaved={handleCaptureSaved}
            onCancel={() => setShowCompose(false)}
          />
        </SurfaceCard>
      )}

      {/* Pillar filter row + topic filter button */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[
            styles.filterIcon,
            {
              borderColor: !filterPillar ? colors.primary : colors.border,
              backgroundColor: !filterPillar ? colors.primary : 'transparent',
            },
          ]}
          onPress={() => setFilterPillar(null)}
        >
          <Text style={{ fontSize: 15, color: !filterPillar ? '#FFF' : colors.textMuted, fontFamily: tokens.typography.fonts.semiBold }}>
            All
          </Text>
        </TouchableOpacity>
        {PILLARS.map((p) => {
          const active = filterPillar === p.key;
          const pillarColor = colors.pillars[p.key];
          return (
            <TouchableOpacity
              key={p.key}
              style={[
                styles.filterIcon,
                {
                  borderColor: active ? pillarColor : colors.border,
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
        {/* Topic filter button */}
        {availableTracks.length > 0 && (
          <TouchableOpacity
            style={[
              styles.filterIcon,
              {
                borderColor: (filterTopicId || filterUnassigned) ? colors.primary : colors.border,
                backgroundColor: (filterTopicId || filterUnassigned) ? colors.primary : 'transparent',
              },
            ]}
            onPress={() => setShowTopicSheet(true)}
            accessibilityLabel="Filter by topic"
          >
            <Ionicons
              name="funnel-outline"
              size={20}
              color={(filterTopicId || filterUnassigned) ? '#FFF' : colors.textMuted}
            />
            {(filterTopicId || filterUnassigned) && (
              <View style={[styles.filterBadge, { backgroundColor: colors.accent }]} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Active topic filter label */}
      {(filterTopicId || filterUnassigned) && (
        <TouchableOpacity
          style={styles.activeFilterRow}
          onPress={() => { setFilterTopicId(null); setFilterUnassigned(false); }}
          activeOpacity={0.7}
        >
          <View style={[styles.activeFilterChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {filterUnassigned ? (
              <Ionicons name="help-circle-outline" size={14} color={colors.warning} style={{ marginRight: 4 }} />
            ) : (
              <View style={[styles.activeFilterDot, { backgroundColor: availableTracks.find(t => t.id === filterTopicId)?.color || colors.primary }]} />
            )}
            <Text style={[styles.activeFilterText, { color: colors.text }]}>
              {filterUnassigned ? 'Unassigned' : availableTracks.find(t => t.id === filterTopicId)?.name || 'Topic'}
            </Text>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
          </View>
        </TouchableOpacity>
      )}

      {/* Event list */}
      <FlatList
        data={filteredEvents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <JournalEntry
            event={item}
            selectionMode={selectionMode}
            isSelected={selectedIds.has(item.id)}
            onPress={() => {
              if (selectionMode) {
                toggleSelection(item.id);
              }
            }}
            onLongPress={() => {
              if (!selectionMode) {
                enterSelectionMode(item.id);
              }
            }}
            onNavigate={() => {}}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {filterUnassigned
                ? 'All moments have topics assigned.'
                : filterTopicId
                  ? 'No moments in this topic.'
                  : 'No journal entries yet.'}
            </Text>
            {!filterUnassigned && !filterTopicId && (
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Tap "+ New" to capture a learning moment.</Text>
            )}
          </View>
        }
      />

      {/* Topic assignment modal */}
      <TopicAssignModal
        visible={showAssignSheet}
        onClose={() => setShowAssignSheet(false)}
        tracks={availableTracks}
        selectedCount={selectedIds.size}
        onAssign={handleBatchAssign}
        onCreateAndAssign={handleCreateAndAssign}
      />

      {/* Topic filter sheet */}
      <Modal
        visible={showTopicSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTopicSheet(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowTopicSheet(false)}>
          <View />
        </Pressable>
        <View style={[styles.sheet, { backgroundColor: colors.surfaceOpaque }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Filter by Topic</Text>
            <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
              {/* All topics */}
              <TouchableOpacity
                style={[
                  styles.sheetRow,
                  !filterTopicId && !filterUnassigned && [styles.sheetRowActive, { backgroundColor: colors.primary + '08' }],
                ]}
                onPress={() => {
                  setFilterTopicId(null);
                  setFilterUnassigned(false);
                  setShowTopicSheet(false);
                }}
              >
                <Ionicons
                  name="layers-outline"
                  size={18}
                  color={!filterTopicId && !filterUnassigned ? colors.primary : colors.textMuted}
                />
                <Text style={[
                  styles.sheetRowText,
                  { color: colors.text },
                  !filterTopicId && !filterUnassigned && { color: colors.primary },
                ]}>
                  All Topics
                </Text>
                {!filterTopicId && !filterUnassigned && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>

              {/* Unassigned */}
              <TouchableOpacity
                style={[styles.sheetRow, filterUnassigned && [styles.sheetRowActive, { backgroundColor: colors.primary + '08' }]]}
                onPress={() => {
                  handleUnassignedTap();
                  setShowTopicSheet(false);
                }}
              >
                <Ionicons
                  name="help-circle-outline"
                  size={18}
                  color={filterUnassigned ? colors.warning : colors.textMuted}
                />
                <Text style={[
                  styles.sheetRowText,
                  { color: colors.text },
                  filterUnassigned && { color: colors.warning },
                ]}>
                  Unassigned
                </Text>
                {filterUnassigned && (
                  <Ionicons name="checkmark" size={18} color={colors.warning} />
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

              {/* Individual tracks */}
              {availableTracks.map((track) => {
                const active = filterTopicId === track.id;
                const chipColor = track.color || colors.primary;
                return (
                  <TouchableOpacity
                    key={track.id}
                    style={[styles.sheetRow, active && [styles.sheetRowActive, { backgroundColor: colors.primary + '08' }]]}
                    onPress={() => {
                      handleTopicFilterTap(track.id);
                      setShowTopicSheet(false);
                    }}
                  >
                    <View style={[styles.sheetDot, { backgroundColor: chipColor }]} />
                    <Text
                      style={[styles.sheetRowText, { color: colors.text }, active && { color: chipColor }]}
                      numberOfLines={1}
                    >
                      {track.name}
                    </Text>
                    <Text style={[styles.sheetRowCount, { color: colors.textMuted }]}>{track.moment_count}</Text>
                    {active && (
                      <Ionicons name="checkmark" size={18} color={chipColor} />
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* Manage topics link */}
              <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  setShowTopicSheet(false);
                  setTimeout(() => setShowManageSheet(true), 300);
                }}
              >
                <Ionicons name="settings-outline" size={18} color={colors.textMuted} />
                <Text style={[styles.sheetRowText, { color: colors.textSecondary }]}>
                  Manage Topics
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </ScrollView>
          </View>
      </Modal>

      {/* Topic manage modal */}
      <TopicManageModal
        visible={showManageSheet}
        onClose={() => setShowManageSheet(false)}
        tracks={availableTracks}
        onUpdate={handleUpdateTrack}
        onDelete={handleDeleteTrack}
      />
    </GlassBackground>
  );
}

// --- Journal Entry Component ---

interface JournalEntryProps {
  event: LearningEvent;
  selectionMode: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onNavigate: () => void;
}

function JournalEntry({ event, selectionMode, isSelected, onPress, onLongPress }: JournalEntryProps) {
  const { colors } = useThemeStore();
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

  // Extract first image/video thumbnail from evidence blocks
  const thumbBlock = (event.evidence_blocks || []).find(
    (b) => (b.block_type === 'image' || b.block_type === 'video') && (b.content?.url || b.file_url),
  );
  const thumbUrl = thumbBlock ? (thumbBlock.content?.url || thumbBlock.file_url) : null;

  const handlePress = () => {
    if (selectionMode) {
      onPress();
    } else {
      navigation.navigate('JournalDetail', { eventId: event.id });
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <SurfaceCard
        style={isSelected
          ? { ...styles.entryCard, ...styles.entryCardSelected, borderColor: colors.primary }
          : styles.entryCard
        }
      >
        {/* Selection checkmark overlay */}
        {selectionMode && (
          <View style={styles.checkOverlay}>
            <View
              style={[
                styles.checkCircle,
                isSelected
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: 'transparent', borderColor: colors.textMuted },
              ]}
            >
              {isSelected && (
                <Ionicons name="checkmark" size={14} color="#FFF" />
              )}
            </View>
          </View>
        )}

        {thumbUrl && (
          <View style={styles.entryThumbWrap}>
            <Image source={{ uri: thumbUrl }} style={styles.entryThumb} resizeMode="cover" />
          </View>
        )}
        {event.title ? <Text style={[styles.entryTitle, { color: colors.text }]}>{event.title}</Text> : null}
        <Text style={[styles.entryDescription, { color: colors.textSecondary }]} numberOfLines={4}>
          {event.description}
        </Text>
        <View style={styles.entryFooter}>
          <View style={styles.entryDots}>
            {/* Pillar dots */}
            {event.pillars?.map((p) => (
              <View
                key={`p-${p}`}
                style={[
                  styles.entryPillarDot,
                  { backgroundColor: colors.pillars[p as PillarKey] || colors.textMuted },
                ]}
              />
            ))}
            {/* Topic dots (smaller, after pillar dots) */}
            {event.topics?.map((t) => (
              <View
                key={`t-${t.id}`}
                style={[
                  styles.entryTopicDot,
                  { backgroundColor: t.color || colors.primary },
                ]}
              />
            ))}
          </View>
          <Text style={[styles.entryDate, { color: colors.textMuted }]}>
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
    paddingTop: 60,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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

  // Selection mode header
  selectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  selectionCount: {
    fontSize: tokens.typography.sizes.lg,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  assignButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
  },
  assignButtonText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.semiBold,
  },

  // Pillar filter row
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: tokens.spacing.md,
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  filterIcon: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 9999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Topic filter badge on funnel icon
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Active topic filter label row
  activeFilterRow: {
    paddingHorizontal: tokens.spacing.md,
    marginBottom: tokens.spacing.sm,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.full,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
    borderWidth: 1,
  },
  activeFilterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  activeFilterText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.medium,
  },

  // Topic filter bottom sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    paddingBottom: tokens.spacing.xl,
    maxHeight: '55%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  sheetTitle: {
    fontSize: tokens.typography.sizes.lg,
    fontFamily: tokens.typography.fonts.semiBold,
    paddingHorizontal: tokens.spacing.lg,
    marginBottom: tokens.spacing.sm,
  },
  sheetList: {
    flexGrow: 0,
  },
  sheetListContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: tokens.spacing.sm,
  },
  sheetRowActive: {
    borderRadius: tokens.radius.md,
    marginHorizontal: -tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.sm,
  },
  sheetRowText: {
    flex: 1,
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.medium,
  },
  sheetRowCount: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
  },
  sheetDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sheetDivider: {
    height: 1,
    marginVertical: tokens.spacing.xs,
  },

  // List
  listContent: {
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.xxl,
  },

  // Entry card
  entryCard: {
    marginBottom: tokens.spacing.md,
  },
  entryCardSelected: {
    borderWidth: 2,
    borderRadius: tokens.radius.lg,
  },
  entryThumbWrap: {
    width: '100%',
    height: 160,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    marginBottom: tokens.spacing.sm,
  },
  entryThumb: {
    width: '100%',
    height: '100%',
  },
  entryTitle: {
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.semiBold,
    marginBottom: tokens.spacing.xs,
  },
  entryDescription: {
    fontSize: tokens.typography.sizes.sm,
    lineHeight: 20,
    marginBottom: tokens.spacing.sm,
  },
  entryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  entryPillarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  entryTopicDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    opacity: 0.7,
  },
  entryDate: {
    fontSize: tokens.typography.sizes.xs,
  },

  // Selection overlay
  checkOverlay: {
    position: 'absolute',
    top: tokens.spacing.sm,
    right: tokens.spacing.sm,
    zIndex: 10,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
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

  // Pending sync banner
  pendingBanner: {
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
    marginHorizontal: tokens.spacing.md,
    marginBottom: tokens.spacing.sm,
  },
  pendingText: {
    fontSize: tokens.typography.sizes.xs,
    textAlign: 'center',
    fontWeight: tokens.typography.weights.medium,
  },
});
