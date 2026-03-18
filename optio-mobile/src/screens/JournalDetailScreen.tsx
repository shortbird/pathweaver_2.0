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

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { tokens, PillarKey } from '../theme/tokens';
import { pillarIcons } from '../theme/icons';
import { SurfaceCard } from '../components/common/SurfaceCard';

import { GlassBackground } from '../components/common/GlassBackground';
import { useThemeStore } from '../stores/themeStore';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';

const SCREEN_W = Dimensions.get('window').width;

const TRACK_COLORS = [
  '#6D469B', '#EF597B', '#2469D1', '#AF56E5', '#3DA24A',
  '#FF9028', '#E65C5C', '#2BA5A5', '#8B9A3C', '#3366CC',
];

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
  const [eventDate, setEventDate] = useState('');
  const [editingDate, setEditingDate] = useState(false);
  const [selectedPillars, setSelectedPillars] = useState<PillarKey[]>([]);

  // Topics
  const [availableTracks, setAvailableTracks] = useState<InterestTrack[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [showNewTrack, setShowNewTrack] = useState(false);
  const [newTrackName, setNewTrackName] = useState('');
  const [newTrackColor, setNewTrackColor] = useState('#6D469B');
  const [creatingTrack, setCreatingTrack] = useState(false);

  // Evidence
  const [uploading, setUploading] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [showTextEvidence, setShowTextEvidence] = useState(false);
  const [textEvidence, setTextEvidence] = useState('');
  const [recordingAudio, setRecordingAudio] = useState(false);

  // Auto-save
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    try {
      const response = await api.get(`/api/learning-events/${eventId}`);
      if (response.data.success) {
        const e = response.data.event;
        setEvent(e);
        setTitle(e.title || '');
        setDescription(e.description || '');
        setEventDate(e.event_date || e.created_at || '');
        setSelectedPillars(
          (e.pillars || []).filter((p: string): p is PillarKey =>
            PILLARS.some((def) => def.key === p),
          ),
        );
        setSelectedTopicIds((e.topics || []).filter((t: Topic) => t.type === 'topic').map((t: Topic) => t.id));
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
    setSelectedPillars((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
    scheduleAutoSave();
  };

  // ── Topic handling ─────────────────────────────────────────

  const toggleTopic = (trackId: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId],
    );
    scheduleAutoSave();
  };

  const handleCreateTrack = async () => {
    const name = newTrackName.trim();
    if (!name) return;
    setCreatingTrack(true);
    try {
      const response = await api.post('/api/interest-tracks', { name, color: newTrackColor });
      const track = response.data.track;
      setAvailableTracks((prev) => [...prev, track]);
      setSelectedTopicIds((prev) => [...prev, track.id]);
      setNewTrackName('');
      setNewTrackColor('#6D469B');
      setShowNewTrack(false);
      scheduleAutoSave();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Could not create topic');
    } finally {
      setCreatingTrack(false);
    }
  };

  // ── Evidence helpers ────────────────────────────────────────

  const existingBlocksPayload = () =>
    (event?.evidence_blocks || []).map((b, i) => ({
      block_type: b.block_type,
      content: b.content || { url: b.file_url },
      order_index: i,
    }));

  const appendEvidenceBlock = async (block: { block_type: string; content: any }) => {
    const existing = existingBlocksPayload();
    await api.post(`/api/learning-events/${eventId}/evidence`, {
      blocks: [...existing, { ...block, order_index: existing.length }],
    });
    await loadEvent();
  };

  // ── Photo evidence ────────────────────────────────────────

  const uploadFileEvidence = async (
    fileOrUri: File | { uri: string; name: string; type: string },
    blockType: 'image' | 'document' | 'video',
  ) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', fileOrUri as any);
      formData.append('block_type', blockType);

      const uploadRes = await api.post(
        `/api/learning-events/${eventId}/upload`,
        formData,
        blockType === 'video' ? { timeout: 120000 } : undefined,
      );

      const content: any = { url: uploadRes.data.file_url, filename: uploadRes.data.filename };
      if (blockType === 'video') {
        if (uploadRes.data.thumbnail_url) content.thumbnail_url = uploadRes.data.thumbnail_url;
        if (uploadRes.data.duration_seconds) content.duration_seconds = uploadRes.data.duration_seconds;
        if (uploadRes.data.width) content.width = uploadRes.data.width;
        if (uploadRes.data.height) content.height = uploadRes.data.height;
      }

      await appendEvidenceBlock({
        block_type: blockType,
        content,
      });
    } catch (err: any) {
      Alert.alert('Upload failed', err.response?.data?.error || 'Could not upload file.');
    } finally {
      setUploading(false);
    }
  };

  const handleAddMedia = async () => {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,video/mp4,video/quicktime,.mp4,.mov';
        input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.type?.startsWith('video/')) {
            if (file.size > 50 * 1024 * 1024) {
              Alert.alert('Too large', 'Video must be under 50MB.');
              return;
            }
            await uploadFileEvidence(file, 'video');
          } else {
            await uploadFileEvidence(file, 'image');
          }
        };
        input.click();
        return;
      }
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Camera roll access is required.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
        videoMaxDuration: 180,
        videoQuality: 1,
        allowsEditing: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.type === 'video') {
        await uploadFileEvidence(
          { uri: asset.uri, name: asset.uri.split('/').pop() || 'video.mp4', type: asset.mimeType || 'video/mp4' } as any,
          'video',
        );
      } else {
        await uploadFileEvidence(
          { uri: asset.uri, name: asset.uri.split('/').pop() || 'photo.jpg', type: asset.mimeType || 'image/jpeg' } as any,
          'image',
        );
      }
    } catch {
      Alert.alert('Error', 'Could not open media picker.');
    }
  };

  // ── Audio evidence ────────────────────────────────────────

  const handleAddAudio = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          setUploading(true);
          try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('block_type', 'document');
            const uploadRes = await api.post(`/api/learning-events/${eventId}/upload`, formData);
            await appendEvidenceBlock({
              block_type: 'video', // audio stored as video type
              content: { url: uploadRes.data.file_url, filename: uploadRes.data.filename, title: file.name },
            });
          } catch (err: any) {
            Alert.alert('Upload failed', err.response?.data?.error || 'Could not upload audio.');
          } finally {
            setUploading(false);
          }
        }
      };
      input.click();
      return;
    }

    // Native: record audio
    if (recordingAudio) {
      // Stop recording
      setRecordingAudio(false);
      try {
        const rec = (globalThis as any).__detailRecording;
        if (rec) {
          await rec.stopAndUnloadAsync();
          const uri = rec.getURI();
          (globalThis as any).__detailRecording = null;
          if (uri) {
            setUploading(true);
            try {
              const formData = new FormData();
              formData.append('file', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);
              formData.append('block_type', 'document');
              const uploadRes = await api.post(`/api/learning-events/${eventId}/upload`, formData);
              await appendEvidenceBlock({
                block_type: 'video',
                content: { url: uploadRes.data.file_url, filename: 'recording.m4a', title: 'Audio recording' },
              });
            } catch (err: any) {
              Alert.alert('Upload failed', err.response?.data?.error || 'Could not upload recording.');
            } finally {
              setUploading(false);
            }
          }
        }
      } catch {
        Alert.alert('Error', 'Could not save recording.');
      }
    } else {
      // Start recording
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
        (globalThis as any).__detailRecording = rec;
        setRecordingAudio(true);
      } catch {
        Alert.alert('Error', 'Could not start recording.');
      }
    }
  };

  // ── Text evidence ─────────────────────────────────────────

  const handleSaveTextEvidence = async () => {
    const trimmed = textEvidence.trim();
    if (!trimmed) return;
    setUploading(true);
    try {
      await appendEvidenceBlock({
        block_type: 'text',
        content: { text: trimmed },
      });
      setTextEvidence('');
      setShowTextEvidence(false);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Could not save text evidence.');
    } finally {
      setUploading(false);
    }
  };

  // ── Remove evidence block ────────────────────────────────

  const handleRemoveEvidence = (blockIndex: number) => {
    Alert.alert('Remove Evidence', 'Remove this piece of evidence?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const blocks = existingBlocksPayload().filter((_, i) => i !== blockIndex);
          const reindexed = blocks.map((b, i) => ({ ...b, order_index: i }));
          try {
            await api.post(`/api/learning-events/${eventId}/evidence`, { blocks: reindexed });
            await loadEvent();
          } catch {
            Alert.alert('Error', 'Could not remove evidence.');
          }
        },
      },
    ]);
  };

  // ── Save ───────────────────────────────────────────────────

  const saveNow = useCallback(async () => {
    if (!description.trim()) return;
    setSaving(true);
    try {
      await api.put(`/api/learning-events/${eventId}`, {
        title: title.trim() || null,
        description: description.trim(),
        pillars: selectedPillars as string[],
        topics: selectedTopicIds.map((id) => ({ type: 'topic', id })),
        event_date: eventDate || undefined,
      });
      setLastSaved('Saved');
      setTimeout(() => setLastSaved(null), 2000);
    } catch {
      setLastSaved('Save failed');
      setTimeout(() => setLastSaved(null), 3000);
    } finally {
      setSaving(false);
    }
  }, [eventId, title, description, selectedPillars, selectedTopicIds, eventDate]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveNow(), 1500);
  }, [saveNow]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, []);

  const handleDone = async () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    await saveNow();
    navigation.goBack();
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

  // Categorise evidence blocks
  const evidenceBlocks = event.evidence_blocks || [];
  const imageBlocks: { url: string; index: number }[] = [];
  const videoBlocks: { url: string; thumbnailUrl?: string; durationSeconds?: number; index: number }[] = [];
  const audioBlocks: { url: string; title: string; index: number }[] = [];
  const textBlocks: { text: string; index: number }[] = [];
  const linkBlocks: { type: string; url: string; title?: string; index: number }[] = [];

  evidenceBlocks.forEach((block, idx) => {
    const url = block.content?.url || block.file_url;
    const contentType = block.content?.content_type || '';
    const filename = block.content?.filename || '';
    const isActualVideo = contentType.startsWith('video/') ||
      filename.endsWith('.mp4') || filename.endsWith('.mov') ||
      block.content?.duration_seconds != null;

    if (block.block_type === 'image' && url && !failedImages.has(url)) {
      imageBlocks.push({ url, index: idx });
    } else if (block.block_type === 'video' && url && isActualVideo) {
      videoBlocks.push({
        url,
        thumbnailUrl: block.content?.thumbnail_url,
        durationSeconds: block.content?.duration_seconds,
        index: idx,
      });
    } else if (block.block_type === 'video' && url) {
      // Legacy audio stored as video type
      audioBlocks.push({ url, title: block.content?.title || block.file_name || 'Audio', index: idx });
    } else if (block.block_type === 'text' && block.content?.text) {
      textBlocks.push({ text: block.content.text, index: idx });
    } else if (['link', 'document'].includes(block.block_type) && url) {
      linkBlocks.push({ type: block.block_type, url, title: block.content?.title || block.file_name, index: idx });
    }
  });

  const displayDate = new Date(eventDate || event.created_at);

  const handleDateChange = (newDateStr: string) => {
    if (newDateStr) {
      setEventDate(new Date(newDateStr).toISOString());
      scheduleAutoSave();
      setEditingDate(false);
    }
  };

  return (
    <GlassBackground key={eventId} style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Title, Description, Date */}
        <SurfaceCard style={styles.card}>
          <TextInput
            style={[styles.titleInput, { color: colors.text }]}
            placeholder="Title (optional)"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={(t) => { setTitle(t); scheduleAutoSave(); }}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <TextInput
            style={[styles.descriptionInput, { color: colors.text }]}
            placeholder="What did you learn?"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={(t) => { setDescription(t); scheduleAutoSave(); }}
            multiline
            textAlignVertical="top"
          />
          {/* Date below description */}
          {editingDate ? (
            Platform.OS === 'web' ? (
              <View style={styles.dateEditRow}>
                <input
                  type="datetime-local"
                  defaultValue={displayDate.toISOString().slice(0, 16)}
                  onChange={(e: any) => handleDateChange(e.target.value)}
                  onBlur={() => setEditingDate(false)}
                  autoFocus
                  style={{ fontSize: 13, padding: 6, borderRadius: 8, border: '1px solid #ccc', width: '100%' } as any}
                />
              </View>
            ) : (
              <View style={styles.dateEditRow}>
                <TextInput
                  style={[styles.dateInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                  defaultValue={displayDate.toISOString().slice(0, 16).replace('T', ' ')}
                  placeholder="YYYY-MM-DD HH:MM"
                  placeholderTextColor={colors.textMuted}
                  onSubmitEditing={(e) => handleDateChange(e.nativeEvent.text.replace(' ', 'T'))}
                  onBlur={() => setEditingDate(false)}
                  autoFocus
                  returnKeyType="done"
                />
              </View>
            )
          ) : (
            <TouchableOpacity onPress={() => setEditingDate(true)} style={styles.timestampRow}>
              <Text style={[styles.timestamp, { color: colors.textMuted }]}>
                {displayDate.toLocaleDateString(undefined, {
                  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                })}
              </Text>
              <Ionicons name="pencil-outline" size={12} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </SurfaceCard>

        {/* Evidence section */}
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Evidence</Text>

          {/* Add evidence buttons */}
          <View style={styles.evidenceBtnRow}>
            <TouchableOpacity
              style={[styles.evidenceBtn, { backgroundColor: colors.pillars.art + '15' }]}
              onPress={handleAddMedia}
              disabled={uploading}
              activeOpacity={0.7}
            >
              <Ionicons name="camera-outline" size={20} color={colors.pillars.art} />
              <Text style={[styles.evidenceBtnText, { color: colors.pillars.art }]}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.evidenceBtn, {
                backgroundColor: recordingAudio ? tokens.colors.error + '20' : colors.pillars.communication + '15',
              }]}
              onPress={handleAddAudio}
              disabled={uploading && !recordingAudio}
              activeOpacity={0.7}
            >
              <Ionicons
                name={recordingAudio ? 'stop-circle' : 'mic-outline'}
                size={20}
                color={recordingAudio ? tokens.colors.error : colors.pillars.communication}
              />
              <Text style={[styles.evidenceBtnText, { color: recordingAudio ? tokens.colors.error : colors.pillars.communication }]}>
                {recordingAudio ? 'Stop' : 'Audio'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.evidenceBtn, { backgroundColor: colors.pillars.stem + '15' }]}
              onPress={() => setShowTextEvidence(!showTextEvidence)}
              disabled={uploading}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={20} color={colors.pillars.stem} />
              <Text style={[styles.evidenceBtnText, { color: colors.pillars.stem }]}>Text</Text>
            </TouchableOpacity>
          </View>

          {uploading && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size={16} color={colors.primary} />
              <Text style={[styles.uploadingText, { color: colors.textMuted }]}>Uploading...</Text>
            </View>
          )}

          {/* Text evidence input */}
          {showTextEvidence && (
            <View style={styles.textEvidenceWrap}>
              <TextInput
                style={[styles.textEvidenceInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                placeholder="Add a note, reflection, or written evidence..."
                placeholderTextColor={colors.textMuted}
                value={textEvidence}
                onChangeText={setTextEvidence}
                multiline
                textAlignVertical="top"
                autoFocus
              />
              <View style={styles.textEvidenceActions}>
                <TouchableOpacity onPress={() => { setShowTextEvidence(false); setTextEvidence(''); }}>
                  <Text style={{ color: colors.textMuted, fontSize: tokens.typography.sizes.sm }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.textEvidenceSave, { backgroundColor: colors.primary, opacity: textEvidence.trim() ? 1 : 0.4 }]}
                  onPress={handleSaveTextEvidence}
                  disabled={!textEvidence.trim() || uploading}
                >
                  <Text style={{ color: '#FFF', fontSize: tokens.typography.sizes.sm, fontFamily: tokens.typography.fonts.semiBold }}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Attached images */}
          {imageBlocks.length > 0 && (
            <View style={styles.gallery}>
              {imageBlocks.map((img) => (
                <TouchableOpacity key={img.url} onLongPress={() => handleRemoveEvidence(img.index)} style={styles.galleryImageWrap}>
                  <Image
                    source={{ uri: img.url }}
                    style={styles.galleryImage}
                    resizeMode="cover"
                    onError={() => setFailedImages((prev) => new Set(prev).add(img.url))}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Attached videos */}
          {videoBlocks.map((vid) => (
            <TouchableOpacity
              key={vid.index}
              style={styles.videoEvidenceWrap}
              onLongPress={() => handleRemoveEvidence(vid.index)}
              activeOpacity={1}
            >
              {Platform.OS === 'web' ? (
                <video
                  src={vid.url}
                  controls
                  poster={vid.thumbnailUrl}
                  style={{ width: '100%', height: 200, borderRadius: 12, backgroundColor: '#000' } as any}
                />
              ) : (
                <View style={styles.videoNativePlaceholder}>
                  <Ionicons name="videocam" size={32} color={colors.pillars.art} />
                  <Text style={[styles.videoNativeText, { color: colors.textSecondary }]}>
                    {vid.durationSeconds
                      ? `Video (${Math.floor(vid.durationSeconds / 60)}:${String(Math.round(vid.durationSeconds % 60)).padStart(2, '0')})`
                      : 'Video'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => Linking.openURL(vid.url).catch(() => {})}
                    style={[styles.videoPlayBtn, { backgroundColor: colors.primary }]}
                  >
                    <Ionicons name="play" size={16} color="#FFF" />
                    <Text style={styles.videoPlayBtnText}>Play</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          ))}

          {/* Attached audio */}
          {audioBlocks.map((audio) => (
            <TouchableOpacity
              key={audio.index}
              style={[styles.evidenceItem, { borderColor: colors.border }]}
              onPress={() => Linking.openURL(audio.url).catch(() => {})}
              onLongPress={() => handleRemoveEvidence(audio.index)}
            >
              <Ionicons name="musical-notes-outline" size={18} color={colors.pillars.communication} />
              <Text style={[styles.evidenceItemText, { color: colors.text }]} numberOfLines={1}>{audio.title}</Text>
              <Ionicons name="play-circle-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}

          {/* Attached text evidence */}
          {textBlocks.map((tb) => (
            <TouchableOpacity
              key={tb.index}
              style={[styles.evidenceItem, { borderColor: colors.border }]}
              onLongPress={() => handleRemoveEvidence(tb.index)}
            >
              <Ionicons name="document-text-outline" size={18} color={colors.pillars.stem} />
              <Text style={[styles.evidenceItemText, { color: colors.text }]} numberOfLines={3}>{tb.text}</Text>
            </TouchableOpacity>
          ))}

          {/* Attached links / documents */}
          {linkBlocks.map((link) => (
            <TouchableOpacity
              key={link.index}
              style={[styles.evidenceItem, { borderColor: colors.border }]}
              onPress={() => Linking.openURL(link.url).catch(() => {})}
              onLongPress={() => handleRemoveEvidence(link.index)}
            >
              <Ionicons
                name={link.type === 'document' ? 'document-outline' : 'link-outline'}
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.evidenceItemText, { color: colors.primary }]} numberOfLines={1}>
                {link.title || link.url}
              </Text>
              <Ionicons name="open-outline" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          ))}

          {imageBlocks.length === 0 && videoBlocks.length === 0 && audioBlocks.length === 0 && textBlocks.length === 0 && linkBlocks.length === 0 && !showTextEvidence && (
            <Text style={[styles.emptyEvidence, { color: colors.textMuted }]}>
              No evidence yet. Add photos, videos, audio, or text.
            </Text>
          )}
        </SurfaceCard>

        {/* Pillar classification */}
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Pillars</Text>
          <View style={styles.pillarRow}>
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
                      backgroundColor: selected ? pillarColor + '30' : 'transparent',
                    },
                  ]}
                  onPress={() => togglePillar(p.key)}
                  accessibilityLabel={p.label}
                  activeOpacity={0.7}
                >
                  <Ionicons name={p.icon as any} size={16} color={pillarColor} />
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.pillarSubtext, { color: colors.textMuted }]}>
            {selectedPillars.length === 0
              ? 'Select related learning pillars'
              : selectedPillars.map((k) => ({ stem: 'STEM', art: 'Art', communication: 'Communication', civics: 'Civics', wellness: 'Wellness' }[k] ?? k)).join(', ')}
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
            <View style={styles.newTrackCard}>
              <View style={styles.newTrackRow}>
                <TextInput
                  style={[styles.newTrackInput, { color: colors.text, borderColor: colors.glass.borderLight, backgroundColor: colors.inputBg }]}
                  placeholder="Topic name"
                  placeholderTextColor={colors.textMuted}
                  value={newTrackName}
                  onChangeText={setNewTrackName}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.createTrackBtn, { backgroundColor: newTrackColor }]}
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
              <View style={styles.colorPickerRow}>
                {TRACK_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      newTrackColor === c && styles.colorSwatchActive,
                    ]}
                    onPress={() => setNewTrackColor(c)}
                  >
                    {newTrackColor === c && (
                      <Ionicons name="checkmark" size={12} color="#FFF" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
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

        {/* Done */}
        <TouchableOpacity onPress={handleDone} activeOpacity={0.85} style={styles.doneBtn}>
          <LinearGradient
            colors={['#6D469B', '#EF597B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.doneBtnGradient}
          >
            {saving ? (
              <ActivityIndicator size={16} color="#FFF" />
            ) : (
              <Text style={styles.doneBtnText}>Done</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Save status */}
        {lastSaved && (
          <Text style={[styles.saveStatus, { color: lastSaved === 'Saved' ? colors.textMuted : tokens.colors.error }]}>{lastSaved}</Text>
        )}

        {/* Delete */}
        <TouchableOpacity style={[styles.deleteBtn, { backgroundColor: tokens.colors.error + '12' }]} onPress={handleDelete} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={16} color={tokens.colors.error} />
          <Text style={styles.deleteBtnText}>Delete Moment</Text>
        </TouchableOpacity>

        {/* Bottom spacer */}
        <View style={{ height: tokens.spacing.xxl + 40 }} />
      </ScrollView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingTop: tokens.spacing.lg,
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

  // Done button
  doneBtn: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    marginBottom: tokens.spacing.sm,
  },
  doneBtnGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: tokens.radius.lg,
  },
  doneBtnText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  saveStatus: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
    textAlign: 'center',
    marginBottom: tokens.spacing.sm,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
  },
  timestamp: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
  },
  dateEditRow: {
    marginTop: tokens.spacing.sm,
  },
  dateInput: {
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
  },

  // Gallery
  gallery: { marginBottom: tokens.spacing.sm },
  galleryImageWrap: {
    width: '100%',
    height: 220,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    marginBottom: tokens.spacing.sm,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
    borderRadius: tokens.radius.lg,
  },

  // Evidence
  evidenceBtnRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  evidenceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
  },
  evidenceBtnText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.medium,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  uploadingText: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
  },
  textEvidenceWrap: {
    marginBottom: tokens.spacing.md,
  },
  textEvidenceInput: {
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    minHeight: 80,
    marginBottom: tokens.spacing.sm,
  },
  textEvidenceActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  textEvidenceSave: {
    paddingVertical: 6,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: tokens.radius.md,
  },
  evidenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.sm,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    marginBottom: tokens.spacing.sm,
  },
  evidenceItemText: {
    flex: 1,
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
  },
  emptyEvidence: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    textAlign: 'center',
    paddingVertical: tokens.spacing.sm,
  },
  videoEvidenceWrap: {
    marginBottom: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  videoNativePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    gap: tokens.spacing.sm,
  },
  videoNativeText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.medium,
  },
  videoPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.full,
    marginTop: tokens.spacing.xs,
  },
  videoPlayBtnText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.semiBold,
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
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xs,
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  divider: {
    height: 0.5,
    marginVertical: tokens.spacing.xs,
  },
  descriptionInput: {
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xs,
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    minHeight: 80,
    lineHeight: 22,
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
  newTrackCard: {
    marginBottom: tokens.spacing.md,
  },
  newTrackRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  colorPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  colorSwatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchActive: {
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    ...tokens.shadows.sm,
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

  // Delete
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: 12,
    borderRadius: tokens.radius.lg,
    marginTop: tokens.spacing.sm,
  },
  deleteBtnText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.medium,
    color: tokens.colors.error,
  },
});
