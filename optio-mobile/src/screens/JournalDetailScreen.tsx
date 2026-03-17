/**
 * Journal Detail Screen - Moment detail, classification, and grouping.
 *
 * Opened when tapping a journal entry. Provides:
 *   - View/edit title and description
 *   - Pillar classification (icon circles + Optio AI toggle)
 *   - Topic grouping (interest tracks)
 *   - Evidence gallery (images, links, documents)
 *   - Add evidence (photo upload)
 *   - Delete moment
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { tokens, PillarKey } from '../theme/tokens';
import { pillarIcons } from '../theme/icons';
import { SurfaceCard } from '../components/common/SurfaceCard';
import { GlassButton } from '../components/common/GlassButton';
import { GlassBackground } from '../components/common/GlassBackground';
import { OptioLogo } from '../components/common/OptioLogo';
import { useThemeStore } from '../stores/themeStore';
import api from '../services/api';

const SCREEN_W = Dimensions.get('window').width;

const PILLARS: { key: PillarKey; label: string; icon: string }[] = [
  { key: 'stem', label: 'STEM', icon: pillarIcons.stem },
  { key: 'art', label: 'Art', icon: pillarIcons.art },
  { key: 'communication', label: 'Comm', icon: pillarIcons.communication },
  { key: 'civics', label: 'Civics', icon: pillarIcons.civics },
  { key: 'wellness', label: 'Wellness', icon: pillarIcons.wellness },
];

interface EvidenceBlock {
  id: string;
  block_type: string;
  content: any;
  file_url?: string;
  file_name?: string;
  order_index: number;
}

interface Topic {
  type: string;
  id: string;
  name: string;
  color?: string;
}

interface InterestTrack {
  id: string;
  name: string;
  color: string;
  moment_count: number;
}

interface FullEvent {
  id: string;
  title: string | null;
  description: string;
  pillars: string[];
  created_at: string;
  source_type: string;
  track_id: string | null;
  evidence_blocks: EvidenceBlock[];
  topics?: Topic[];
}

export function JournalDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { colors } = useThemeStore();
  const { eventId } = route.params;

  const [event, setEvent] = useState<FullEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPillars, setSelectedPillars] = useState<PillarKey[]>([]);
  const [aiPillars, setAiPillars] = useState(false);
  const [suggestingPillars, setSuggestingPillars] = useState(false);

  // Topics
  const [availableTracks, setAvailableTracks] = useState<InterestTrack[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [showNewTrack, setShowNewTrack] = useState(false);
  const [newTrackName, setNewTrackName] = useState('');
  const [creatingTrack, setCreatingTrack] = useState(false);

  // Evidence
  const [uploading, setUploading] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Dirty tracking
  const [dirty, setDirty] = useState(false);

  const loadEvent = useCallback(async () => {
    try {
      const response = await api.get(`/api/learning-events/${eventId}`);
      if (response.data.success) {
        const e = response.data.event;
        setEvent(e);
        setTitle(e.title || '');
        setDescription(e.description || '');
        setSelectedPillars(
          (e.pillars || []).filter((p: string): p is PillarKey =>
            PILLARS.some((def) => def.key === p),
          ),
        );
        setSelectedTopicIds((e.topics || []).filter((t: Topic) => t.type === 'topic').map((t: Topic) => t.id));
        setAiPillars((e.pillars || []).length === 0);
      }
    } catch {
      Alert.alert('Error', 'Could not load moment');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const loadTracks = useCallback(async () => {
    try {
      const response = await api.get('/api/interest-tracks');
      setAvailableTracks(response.data.tracks || []);
    } catch {
      // Interest tracks may not exist yet
    }
  }, []);

  useEffect(() => {
    loadEvent();
    loadTracks();
  }, [loadEvent, loadTracks]);

  // ── Pillar handling ────────────────────────────────────────

  const togglePillar = (key: PillarKey) => {
    setAiPillars(false);
    setSelectedPillars((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
    setDirty(true);
  };

  const handleAiPillars = async () => {
    if (aiPillars) {
      // Toggling off
      setAiPillars(false);
      return;
    }
    // Toggling on -- run AI now
    setAiPillars(true);
    const trimmed = description.trim();
    if (!trimmed) return;

    setSuggestingPillars(true);
    try {
      const response = await api.post('/api/learning-events/ai-suggestions', {
        description: trimmed,
      });
      const suggested = response.data?.suggestions?.pillars || [];
      const valid = suggested.filter((p: string): p is PillarKey =>
        PILLARS.some((def) => def.key === p),
      );
      setSelectedPillars(valid.length > 0 ? valid : ['wellness']);
      setDirty(true);
    } catch {
      setSelectedPillars(['wellness']);
      setDirty(true);
    } finally {
      setSuggestingPillars(false);
    }
  };

  // ── Topic handling ─────────────────────────────────────────

  const toggleTopic = (trackId: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId],
    );
    setDirty(true);
  };

  const handleCreateTrack = async () => {
    const name = newTrackName.trim();
    if (!name) return;
    setCreatingTrack(true);
    try {
      const response = await api.post('/api/interest-tracks', { name });
      const track = response.data.track;
      setAvailableTracks((prev) => [...prev, track]);
      setSelectedTopicIds((prev) => [...prev, track.id]);
      setNewTrackName('');
      setShowNewTrack(false);
      setDirty(true);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Could not create topic');
    } finally {
      setCreatingTrack(false);
    }
  };

  // ── Evidence ───────────────────────────────────────────────

  const handleAddPhoto = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Photo library access is required.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;

      setUploading(true);
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.uri.split('/').pop() || 'photo.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any);
      formData.append('block_type', 'image');

      await api.post(`/api/learning-events/${eventId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadEvent();
    } catch (err: any) {
      Alert.alert('Upload failed', err.response?.data?.error || 'Could not upload photo.');
    } finally {
      setUploading(false);
    }
  };

  // ── Save ───────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      let pillars = selectedPillars as string[];
      if (aiPillars && pillars.length === 0) {
        try {
          const aiRes = await api.post('/api/learning-events/ai-suggestions', {
            description: description.trim(),
          });
          pillars = aiRes.data?.suggestions?.pillars || ['wellness'];
        } catch {
          pillars = ['wellness'];
        }
      }

      await api.put(`/api/learning-events/${eventId}`, {
        title: title.trim() || null,
        description: description.trim(),
        pillars,
        topics: selectedTopicIds.map((id) => ({ type: 'topic', id })),
      });
      setDirty(false);
      Alert.alert('Saved', 'Moment updated.');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────

  const handleDelete = () => {
    Alert.alert('Delete Moment', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/learning-events/${eventId}`);
            navigation.goBack();
          } catch {
            Alert.alert('Error', 'Failed to delete');
          }
        },
      },
    ]);
  };

  // ── Loading / empty ────────────────────────────────────────

  if (loading) {
    return (
      <GlassBackground style={{ flex: 1 }}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GlassBackground>
    );
  }

  if (!event) {
    return (
      <GlassBackground style={{ flex: 1 }}>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Moment not found.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={{ color: colors.primary, marginTop: tokens.spacing.md }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </GlassBackground>
    );
  }

  // Extract images and links from evidence
  const images: string[] = [];
  const links: { type: string; url: string; title?: string }[] = [];
  for (const block of event.evidence_blocks || []) {
    const url = block.content?.url || block.file_url;
    if (block.block_type === 'image' && url && !failedImages.has(url)) images.push(url);
    else if (['video', 'link', 'document'].includes(block.block_type) && url) {
      links.push({ type: block.block_type, url, title: block.content?.title || block.file_name });
    }
  }

  const date = new Date(event.created_at);

  return (
    <GlassBackground style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleDelete} style={styles.headerAction}>
              <Ionicons name="trash-outline" size={20} color={tokens.colors.error} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Timestamp */}
        <Text style={[styles.timestamp, { color: colors.textMuted }]}>
          {date.toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit',
          })}
        </Text>

        {/* Evidence gallery */}
        {images.length > 0 && (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.gallery}>
            {images.map((url) => (
              <Image
                key={url}
                source={{ uri: url }}
                style={[styles.galleryImage, { width: SCREEN_W - 32 }]}
                resizeMode="cover"
                onError={() => setFailedImages((prev) => new Set(prev).add(url))}
              />
            ))}
          </ScrollView>
        )}

        {/* Add photo */}
        <TouchableOpacity
          style={[styles.addPhotoBtn, { backgroundColor: colors.pillars.art + '10', borderColor: colors.border }]}
          onPress={handleAddPhoto}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size={16} color={colors.pillars.art} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={18} color={colors.pillars.art} />
              <Text style={[styles.addPhotoText, { color: colors.pillars.art }]}>Add Photo</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Title */}
        <SurfaceCard style={styles.card}>
          <TextInput
            style={[styles.titleInput, { color: colors.text, borderColor: colors.glass.borderLight, backgroundColor: colors.inputBg }]}
            placeholder="Title (optional)"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={(t) => { setTitle(t); setDirty(true); }}
          />
          <TextInput
            style={[styles.descriptionInput, { color: colors.text, borderColor: colors.glass.borderLight, backgroundColor: colors.inputBg }]}
            placeholder="Description"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={(t) => { setDescription(t); setDirty(true); }}
            multiline
            textAlignVertical="top"
          />
        </SurfaceCard>

        {/* Pillar classification */}
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Pillars</Text>
          <View style={styles.pillarRow}>
            <TouchableOpacity
              style={[
                styles.pillarChip,
                {
                  borderColor: aiPillars ? colors.primary : colors.border,
                  backgroundColor: aiPillars ? colors.primary + '15' : 'transparent',
                },
              ]}
              onPress={handleAiPillars}
              activeOpacity={0.6}
              accessibilityLabel="Let AI pick pillars"
            >
              {suggestingPillars ? (
                <ActivityIndicator size={16} color={colors.primary} />
              ) : (
                <View pointerEvents="none">
                  <OptioLogo size={22} background="none" />
                </View>
              )}
            </TouchableOpacity>
            {PILLARS.map((p) => {
              const selected = selectedPillars.includes(p.key);
              const pillarColor = tokens.colors.pillars[p.key];
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[
                    styles.pillarChip,
                    {
                      borderColor: selected ? pillarColor : colors.border,
                      backgroundColor: selected ? pillarColor : 'transparent',
                      opacity: aiPillars ? 0.35 : 1,
                    },
                  ]}
                  onPress={() => togglePillar(p.key)}
                  disabled={aiPillars}
                  accessibilityLabel={p.label}
                >
                  <Ionicons name={p.icon as any} size={16} color={selected ? '#FFF' : pillarColor} />
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.pillarSubtext, { color: colors.textMuted }]}>
            {aiPillars ? 'Optio AI will analyze and set pillars' : 'Select related learning pillars'}
          </Text>
        </SurfaceCard>

        {/* Topic grouping */}
        <SurfaceCard style={styles.card}>
          <View style={styles.topicHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Topics</Text>
            <TouchableOpacity onPress={() => setShowNewTrack(!showNewTrack)}>
              <Text style={[styles.addTopicLink, { color: colors.primary }]}>
                {showNewTrack ? 'Cancel' : '+ New'}
              </Text>
            </TouchableOpacity>
          </View>

          {showNewTrack && (
            <View style={styles.newTrackRow}>
              <TextInput
                style={[styles.newTrackInput, { color: colors.text, borderColor: colors.glass.borderLight, backgroundColor: colors.inputBg }]}
                placeholder="Topic name"
                placeholderTextColor={colors.textMuted}
                value={newTrackName}
                onChangeText={setNewTrackName}
                autoFocus
                onSubmitEditing={handleCreateTrack}
              />
              <TouchableOpacity
                style={[styles.createTrackBtn, { backgroundColor: colors.primary }]}
                onPress={handleCreateTrack}
                disabled={creatingTrack || !newTrackName.trim()}
              >
                {creatingTrack ? (
                  <ActivityIndicator size={14} color="#FFF" />
                ) : (
                  <Ionicons name="add" size={18} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>
          )}

          {availableTracks.length === 0 && !showNewTrack ? (
            <Text style={[styles.emptyTopics, { color: colors.textMuted }]}>
              No topics yet. Create one to group related moments.
            </Text>
          ) : (
            <View style={styles.topicList}>
              {availableTracks.map((track) => {
                const selected = selectedTopicIds.includes(track.id);
                return (
                  <TouchableOpacity
                    key={track.id}
                    style={[
                      styles.topicChip,
                      {
                        borderColor: selected ? (track.color || colors.primary) : colors.border,
                        backgroundColor: selected ? (track.color || colors.primary) + '20' : 'transparent',
                      },
                    ]}
                    onPress={() => toggleTopic(track.id)}
                  >
                    {selected && (
                      <Ionicons name="checkmark" size={14} color={track.color || colors.primary} style={{ marginRight: 4 }} />
                    )}
                    <Text style={[
                      styles.topicChipText,
                      { color: selected ? (track.color || colors.primary) : colors.textSecondary },
                    ]}>
                      {track.name}
                    </Text>
                    <Text style={[styles.topicCount, { color: colors.textMuted }]}>
                      {track.moment_count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </SurfaceCard>

        {/* Links / documents */}
        {links.length > 0 && (
          <SurfaceCard style={styles.card}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Links</Text>
            {links.map((link, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.linkRow, { borderColor: colors.border }]}
                onPress={() => Linking.openURL(link.url).catch(() => {})}
              >
                <Ionicons
                  name={link.type === 'video' ? 'play-circle-outline' : link.type === 'document' ? 'document-outline' : 'link-outline'}
                  size={18}
                  color={colors.primary}
                />
                <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1}>
                  {link.title || link.url}
                </Text>
                <Ionicons name="open-outline" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </SurfaceCard>
        )}

        {/* Save button */}
        {dirty && (
          <GlassButton
            title="Save Changes"
            onPress={handleSave}
            loading={saving}
            disabled={saving || !description.trim()}
            size="lg"
            icon="checkmark-outline"
            style={styles.saveButton}
          />
        )}

        {/* Bottom spacer */}
        <View style={{ height: tokens.spacing.xxl + 40 }} />
      </ScrollView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingTop: 50,
    paddingHorizontal: tokens.spacing.md,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.medium,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing.sm,
  },
  backButton: { padding: tokens.spacing.xs },
  headerActions: { flexDirection: 'row', gap: tokens.spacing.md },
  headerAction: { padding: tokens.spacing.xs },
  timestamp: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
    marginBottom: tokens.spacing.md,
  },

  // Gallery
  gallery: { marginBottom: tokens.spacing.sm },
  galleryImage: {
    height: 240,
    borderRadius: tokens.radius.lg,
    marginRight: tokens.spacing.sm,
  },

  // Add photo
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: tokens.spacing.md,
  },
  addPhotoText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.medium,
  },

  // Cards
  card: { marginBottom: tokens.spacing.md },
  sectionTitle: {
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.semiBold,
    marginBottom: tokens.spacing.sm,
  },

  // Text inputs
  titleInput: {
    borderWidth: 0.5,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.semiBold,
    marginBottom: tokens.spacing.sm,
  },
  descriptionInput: {
    borderWidth: 0.5,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    minHeight: 100,
  },

  // Pillars
  pillarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.xs,
  },
  pillarChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pillarSubtext: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
    textAlign: 'center',
  },

  // Topics
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing.sm,
  },
  addTopicLink: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  newTrackRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  newTrackInput: {
    flex: 1,
    borderWidth: 0.5,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
  },
  createTrackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTopics: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    textAlign: 'center',
    paddingVertical: tokens.spacing.md,
  },
  topicList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  topicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: tokens.radius.full,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
  },
  topicChipText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.medium,
  },
  topicCount: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
    marginLeft: tokens.spacing.xs,
  },

  // Links
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.sm,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    marginBottom: tokens.spacing.sm,
  },
  linkText: {
    flex: 1,
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.medium,
  },

  // Save
  saveButton: {
    marginBottom: tokens.spacing.md,
  },
});
