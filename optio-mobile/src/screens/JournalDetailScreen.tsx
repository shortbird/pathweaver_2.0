/**
 * Journal Detail Screen - Full view of a learning event with edit capabilities.
 *
 * Fetches the full event from GET /api/learning-events/:id (includes evidence blocks),
 * and allows editing title, description, pillars via PUT /api/learning-events/:id.
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
  Dimensions,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { tokens, PillarKey } from '../theme/tokens';
import { GlassCard } from '../components/common/GlassCard';
import { GlassBackground } from '../components/common/GlassBackground';
import { useThemeStore } from '../stores/themeStore';
import api from '../services/api';

const SCREEN_W = Dimensions.get('window').width;
const IMAGE_HEIGHT = 300;

const PILLARS: { key: PillarKey; label: string }[] = [
  { key: 'stem', label: 'STEM' },
  { key: 'art', label: 'Art' },
  { key: 'communication', label: 'Comm' },
  { key: 'civics', label: 'Civics' },
  { key: 'wellness', label: 'Wellness' },
];

function formatPillar(pillar: string): string {
  if (pillar.toLowerCase() === 'stem') return 'STEM';
  return pillar.charAt(0).toUpperCase() + pillar.slice(1);
}

interface EvidenceBlock {
  id: string;
  block_type: string;
  content: any;
  file_url?: string;
  file_name?: string;
  order_index: number;
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
  topics?: { type: string; id: string; name: string }[];
}

export function JournalDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { colors } = useThemeStore();
  const { eventId } = route.params;

  const [event, setEvent] = useState<FullEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Edit state
  type EditMode = 'photo' | 'voice' | 'text';
  const [editMode, setEditMode] = useState<EditMode>('text');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPillars, setEditPillars] = useState<string[]>([]);
  const [editBlocks, setEditBlocks] = useState<EvidenceBlock[]>([]);
  const [blocksChanged, setBlocksChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Voice state
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  // Image error tracking
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const loadEvent = useCallback(async () => {
    try {
      const response = await api.get(`/api/learning-events/${eventId}`);
      if (response.data.success) {
        setEvent(response.data.event);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  const startEditing = () => {
    if (!event) return;
    setEditTitle(event.title || '');
    setEditDescription(event.description || '');
    setEditPillars([...(event.pillars || [])]);
    setEditBlocks([...(event.evidence_blocks || [])]);
    setBlocksChanged(false);
    setEditing(true);
  };

  const toggleEditPillar = (key: string) => {
    setEditPillars((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
  };

  const handleSave = async () => {
    if (!editDescription.trim()) {
      Alert.alert('Required', 'Description cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      // Save text/pillars
      await api.put(`/api/learning-events/${eventId}`, {
        title: editTitle.trim() || null,
        description: editDescription.trim(),
        pillars: editPillars,
      });

      // Save evidence blocks if changed
      if (blocksChanged) {
        await api.post(`/api/learning-events/${eventId}/evidence`, {
          blocks: editBlocks.map((b, i) => ({
            block_type: b.block_type,
            content: b.content || {},
            order_index: i,
          })),
        });
      }

      setEditing(false);
      loadEvent();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveBlock = (index: number) => {
    setEditBlocks((prev) => prev.filter((_, i) => i !== index));
    setBlocksChanged(true);
  };

  const handleAddPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const formData = new FormData();
      const uri = asset.uri;
      const filename = uri.split('/').pop() || 'photo.jpg';
      formData.append('file', {
        uri,
        name: filename,
        type: asset.mimeType || 'image/jpeg',
      } as any);
      formData.append('block_type', 'image');

      const response = await api.post(
        `/api/learning-events/${eventId}/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );

      if (response.data.success && response.data.file_url) {
        setEditBlocks((prev) => [
          ...prev,
          {
            id: `new_${Date.now()}`,
            block_type: 'image',
            content: { url: response.data.file_url },
            order_index: prev.length,
          },
        ]);
        setBlocksChanged(true);
      }
    } catch (err: any) {
      Alert.alert('Upload failed', err.response?.data?.error || 'Could not upload photo.');
    } finally {
      setUploading(false);
    }
  };

  const handleStartRecording = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (file) await processAudioWeb(file);
      };
      input.click();
    } else {
      try {
        const { Audio } = await import('expo-av');
        const perm = await Audio.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission needed', 'Microphone access is required.');
          return;
        }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording: rec } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );
        setRecording(true);
        (globalThis as any).__currentRecording = rec;
      } catch {
        Alert.alert('Error', 'Could not start recording');
      }
    }
  };

  const handleStopRecording = async () => {
    setRecording(false);
    try {
      const rec = (globalThis as any).__currentRecording;
      if (rec) {
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        (globalThis as any).__currentRecording = null;
        if (uri) await processAudioNative(uri);
      }
    } catch {
      Alert.alert('Error', 'Could not process recording');
    }
  };

  const processAudioWeb = async (file: File) => {
    setTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', file);
      const response = await api.post('/api/learning-events/voice', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const transcription = response.data.transcription || '';
      setEditDescription((prev) => (prev ? prev + '\n\n' + transcription : transcription));
      if (response.data.suggested_pillar && editPillars.length === 0) {
        setEditPillars([response.data.suggested_pillar]);
      }
      Alert.alert('Transcribed', 'Voice transcription added to description.');
    } catch {
      Alert.alert('Error', 'Failed to transcribe audio.');
    } finally {
      setTranscribing(false);
    }
  };

  const processAudioNative = async (uri: string) => {
    setTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);
      const response = await api.post('/api/learning-events/voice', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const transcription = response.data.transcription || '';
      setEditDescription((prev) => (prev ? prev + '\n\n' + transcription : transcription));
      if (response.data.suggested_pillar && editPillars.length === 0) {
        setEditPillars([response.data.suggested_pillar]);
      }
      Alert.alert('Transcribed', 'Voice transcription added to description.');
    } catch {
      Alert.alert('Error', 'Failed to transcribe audio.');
    } finally {
      setTranscribing(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Entry', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/learning-events/${eventId}`);
            navigation.goBack();
          } catch {
            Alert.alert('Error', 'Failed to delete entry');
          }
        },
      },
    ]);
  };

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const handleImageError = (url: string) => {
    setFailedImages((prev) => new Set(prev).add(url));
  };

  if (loading) {
    return (
      <GlassBackground style={{ flex: 1 }}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
        </View>
      </GlassBackground>
    );
  }

  if (!event) {
    return (
      <GlassBackground style={{ flex: 1 }}>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Entry not found.
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={{ color: colors.primary, marginTop: tokens.spacing.md }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </GlassBackground>
    );
  }

  // Extract images and links from evidence blocks
  const allImages: string[] = [];
  const links: { type: string; url: string; title?: string }[] = [];

  for (const block of event.evidence_blocks || []) {
    const content = block.content || {};
    const url = content.url || block.file_url;
    if (block.block_type === 'image' && url) {
      allImages.push(url);
    } else if (block.block_type === 'video' && url) {
      links.push({ type: 'video', url, title: content.title });
    } else if (block.block_type === 'link' && url) {
      links.push({ type: 'link', url, title: content.title });
    } else if (block.block_type === 'document' && url) {
      links.push({
        type: 'document',
        url,
        title: content.title || content.filename || block.file_name,
      });
    }
  }
  const images = allImages.filter((u) => !failedImages.has(u));

  const date = new Date(event.created_at);

  return (
    <GlassBackground style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          {!editing && (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={startEditing} style={styles.headerAction}>
                <Ionicons name="pencil" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.headerAction}>
                <Ionicons name="trash-outline" size={20} color={tokens.colors.error} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Timestamp */}
        <Text style={[styles.timestamp, { color: colors.textMuted }]}>
          {date.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>

        {!editing ? (
          <>
            {/* Title */}
            {event.title ? (
              <Text style={[styles.title, { color: colors.text }]}>{event.title}</Text>
            ) : null}

            {/* Image gallery */}
            {images.length > 0 && (
              <View style={styles.gallery}>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => {
                    const idx = Math.round(
                      e.nativeEvent.contentOffset.x / (SCREEN_W - 32),
                    );
                    setActiveImageIndex(idx);
                  }}
                >
                  {images.map((url) => (
                    <Image
                      key={url}
                      source={{ uri: url }}
                      style={[styles.galleryImage, { width: SCREEN_W - 32 }]}
                      resizeMode="cover"
                      onError={() => handleImageError(url)}
                    />
                  ))}
                </ScrollView>
                {images.length > 1 && (
                  <View style={styles.paginationDots}>
                    {images.map((_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.dot,
                          {
                            backgroundColor:
                              i === activeImageIndex ? colors.primary : colors.textMuted,
                          },
                        ]}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Description */}
            <GlassCard style={styles.contentCard}>
              <Text style={[styles.description, { color: colors.textSecondary }]}>
                {event.description}
              </Text>

              {/* Pillars */}
              {event.pillars?.length > 0 && (
                <View style={styles.pillarsRow}>
                  {event.pillars.map((p) => (
                    <View
                      key={p}
                      style={[
                        styles.pillarChip,
                        {
                          backgroundColor:
                            tokens.colors.pillars[p as PillarKey] || colors.textMuted,
                        },
                      ]}
                    >
                      <Text style={styles.pillarChipText}>{formatPillar(p)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Topics */}
              {event.topics && event.topics.length > 0 && (
                <View style={styles.topicsSection}>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Topics</Text>
                  <View style={styles.topicsRow}>
                    {event.topics.map((t) => (
                      <View
                        key={t.id}
                        style={[styles.topicChip, { borderColor: colors.glass.border }]}
                      >
                        <Text style={[styles.topicChipText, { color: colors.text }]}>
                          {t.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </GlassCard>

            {/* Links / videos / documents */}
            {links.length > 0 && (
              <GlassCard style={styles.contentCard}>
                {links.map((link, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.linkRow, { borderColor: colors.border }]}
                    onPress={() => handleOpenLink(link.url)}
                  >
                    <Ionicons
                      name={
                        link.type === 'video'
                          ? 'play-circle-outline'
                          : link.type === 'document'
                            ? 'document-outline'
                            : 'link-outline'
                      }
                      size={20}
                      color={colors.primary}
                    />
                    <Text
                      style={[styles.linkText, { color: colors.primary }]}
                      numberOfLines={1}
                    >
                      {link.title || link.url}
                    </Text>
                    <Ionicons name="open-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </GlassCard>
            )}
          </>
        ) : (
          // ── Edit mode: Photo / Voice / Text tabs ──
          <>
            {/* Mode tabs */}
            <View style={styles.modeRow}>
              {([
                { key: 'photo' as EditMode, icon: 'camera-outline', label: 'Photo' },
                { key: 'voice' as EditMode, icon: 'mic-outline', label: 'Voice' },
                { key: 'text' as EditMode, icon: 'create-outline', label: 'Text' },
              ]).map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={[
                    styles.modeButton,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    editMode === m.key && { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
                  ]}
                  onPress={() => setEditMode(m.key)}
                >
                  <Ionicons
                    name={m.icon as any}
                    size={24}
                    color={editMode === m.key ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.modeLabel,
                      { color: colors.textSecondary },
                      editMode === m.key && { color: colors.primary, fontFamily: tokens.typography.fonts.semiBold },
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Photo mode ── */}
            {editMode === 'photo' && (
              <GlassCard style={styles.contentCard}>
                <View style={styles.mediaGrid}>
                  {editBlocks.map((block, idx) => {
                    const url = block.content?.url || block.file_url;
                    if (!url) return null;
                    return (
                      <View key={block.id || idx} style={styles.mediaThumbnailWrapper}>
                        {block.block_type === 'image' ? (
                          <Image source={{ uri: url }} style={styles.mediaThumbnail} resizeMode="cover" />
                        ) : (
                          <View style={[styles.mediaThumbnail, styles.fileThumbnail, { backgroundColor: colors.surface }]}>
                            <Ionicons
                              name={
                                block.block_type === 'video' ? 'play-circle-outline'
                                  : block.block_type === 'document' ? 'document-outline'
                                    : 'link-outline'
                              }
                              size={24}
                              color={colors.textSecondary}
                            />
                            <Text style={[styles.fileLabel, { color: colors.textMuted }]} numberOfLines={1}>
                              {block.content?.title || block.file_name || block.block_type}
                            </Text>
                          </View>
                        )}
                        <TouchableOpacity style={styles.removeMediaButton} onPress={() => handleRemoveBlock(idx)}>
                          <Ionicons name="close-circle" size={22} color={tokens.colors.error} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                  <TouchableOpacity
                    style={[styles.addMediaButton, { borderColor: colors.glass.border, backgroundColor: colors.inputBg }]}
                    onPress={handleAddPhoto}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={28} color={colors.primary} />
                        <Text style={[styles.addMediaText, { color: colors.primary }]}>Add Photo</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {editBlocks.length === 0 && !uploading && (
                  <Text style={[styles.hintText, { color: colors.textMuted }]}>
                    Add photos of your learning moment.
                  </Text>
                )}
              </GlassCard>
            )}

            {/* ── Voice mode ── */}
            {editMode === 'voice' && (
              <GlassCard style={styles.contentCard}>
                <View style={styles.voiceCenter}>
                  {recording && (
                    <View style={styles.recordingIndicator}>
                      <View style={styles.recordingDot} />
                      <Text style={[styles.recordingLabel, { color: tokens.colors.error }]}>Recording...</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.voiceButton,
                      recording && { backgroundColor: tokens.colors.error },
                      transcribing && styles.buttonDisabled,
                    ]}
                    onPress={recording ? handleStopRecording : handleStartRecording}
                    disabled={transcribing}
                  >
                    {transcribing ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name={recording ? 'stop' : 'mic'} size={28} color="#FFF" />
                        <Text style={styles.voiceButtonText}>
                          {recording
                            ? 'Stop'
                            : Platform.OS === 'web'
                              ? 'Upload Audio'
                              : 'Record'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <Text style={[styles.hintText, { color: colors.textMuted }]}>
                    {transcribing
                      ? 'Transcribing audio...'
                      : 'Record your thoughts and they will be transcribed into the description.'}
                  </Text>
                </View>

                {/* Show current description preview */}
                {editDescription ? (
                  <View style={[styles.transcriptPreview, { backgroundColor: colors.inputBg }]}>
                    <Text style={[styles.transcriptLabel, { color: colors.textMuted }]}>Current description</Text>
                    <Text style={[styles.transcriptText, { color: colors.textSecondary }]} numberOfLines={6}>
                      {editDescription}
                    </Text>
                  </View>
                ) : null}
              </GlassCard>
            )}

            {/* ── Text mode ── */}
            {editMode === 'text' && (
              <GlassCard style={styles.contentCard}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.glass.border, backgroundColor: colors.inputBg }]}
                  placeholder="Title (optional)"
                  placeholderTextColor={colors.textMuted}
                  value={editTitle}
                  onChangeText={setEditTitle}
                />
                <TextInput
                  style={[styles.input, styles.descriptionInput, { color: colors.text, borderColor: colors.glass.border, backgroundColor: colors.inputBg }]}
                  placeholder="What did you learn?"
                  placeholderTextColor={colors.textMuted}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  multiline
                  textAlignVertical="top"
                />
              </GlassCard>
            )}

            {/* Shared: Pillars + Save/Cancel */}
            <GlassCard style={styles.contentCard}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Pillars</Text>
              <View style={styles.editPillarsRow}>
                {PILLARS.map((p) => (
                  <TouchableOpacity
                    key={p.key}
                    style={[
                      styles.editPillarChip,
                      {
                        borderColor: tokens.colors.pillars[p.key],
                        backgroundColor: editPillars.includes(p.key)
                          ? tokens.colors.pillars[p.key]
                          : 'transparent',
                      },
                    ]}
                    onPress={() => toggleEditPillar(p.key)}
                  >
                    <Text
                      style={[
                        styles.editPillarText,
                        {
                          color: editPillars.includes(p.key)
                            ? '#FFF'
                            : tokens.colors.pillars[p.key],
                        },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.editActions}>
                <TouchableOpacity
                  onPress={() => setEditing(false)}
                  style={[styles.cancelButton, { borderColor: colors.glass.border }]}
                >
                  <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.buttonDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </GlassCard>
          </>
        )}
      </ScrollView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 50,
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.xxl + 40,
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
  backButton: {
    padding: tokens.spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  headerAction: {
    padding: tokens.spacing.xs,
  },
  timestamp: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
    marginBottom: tokens.spacing.md,
  },
  title: {
    fontSize: tokens.typography.sizes.lg,
    fontFamily: tokens.typography.fonts.semiBold,
    marginBottom: tokens.spacing.md,
  },

  // Gallery
  gallery: {
    marginBottom: tokens.spacing.md,
  },
  galleryImage: {
    height: IMAGE_HEIGHT,
    borderRadius: tokens.radius.lg,
  },
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    marginTop: tokens.spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Content
  contentCard: {
    marginBottom: tokens.spacing.md,
  },
  description: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    lineHeight: 22,
    marginBottom: tokens.spacing.md,
  },
  pillarsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  pillarChip: {
    borderRadius: tokens.radius.full,
    paddingVertical: 3,
    paddingHorizontal: tokens.spacing.sm,
  },
  pillarChipText: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.medium,
    color: '#FFF',
  },

  // Topics
  topicsSection: {
    marginTop: tokens.spacing.md,
  },
  sectionLabel: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: tokens.spacing.sm,
  },
  topicsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  topicChip: {
    borderWidth: 1,
    borderRadius: tokens.radius.full,
    paddingVertical: 3,
    paddingHorizontal: tokens.spacing.sm,
  },
  topicChipText: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.medium,
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

  // Mode tabs
  modeRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
    borderWidth: 2,
    gap: 2,
  },
  modeLabel: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
  },

  // Voice
  voiceCenter: {
    alignItems: 'center',
    paddingVertical: tokens.spacing.md,
  },
  voiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.lg,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },
  voiceButtonText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: tokens.colors.error,
  },
  recordingLabel: {
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  transcriptPreview: {
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
  },
  transcriptLabel: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: tokens.spacing.xs,
  },
  transcriptText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    lineHeight: 20,
  },
  hintText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    textAlign: 'center',
  },

  // Media management
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  mediaThumbnailWrapper: {
    position: 'relative',
  },
  mediaThumbnail: {
    width: 90,
    height: 90,
    borderRadius: tokens.radius.md,
  },
  fileThumbnail: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  fileLabel: {
    fontSize: 10,
    fontFamily: tokens.typography.fonts.regular,
    marginTop: 2,
    maxWidth: 80,
    textAlign: 'center',
  },
  removeMediaButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFF',
    borderRadius: 11,
  },
  addMediaButton: {
    width: 90,
    height: 90,
    borderRadius: tokens.radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  addMediaText: {
    fontSize: 11,
    fontFamily: tokens.typography.fonts.medium,
  },

  // Edit mode
  input: {
    borderWidth: 0.5,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    marginBottom: tokens.spacing.sm,
  },
  descriptionInput: {
    minHeight: 120,
  },
  editPillarsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  editPillarChip: {
    borderWidth: 1.5,
    borderRadius: tokens.radius.full,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.sm,
  },
  editPillarText: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.medium,
  },
  editActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.sm,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  saveButton: {
    flex: 1,
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.sm,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
