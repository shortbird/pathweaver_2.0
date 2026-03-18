/**
 * QuickCapture - Fast evidence capture. Photo, voice, or text.
 *
 * No pillar selection here -- that happens in the Moment Detail screen
 * after capture. This is purely about getting the moment recorded quickly.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../theme/tokens';
import { icons } from '../../theme/icons';
import { GlassButton } from '../common/GlassButton';
import { useThemeStore } from '../../stores/themeStore';
import { addToQueue } from '../../utils/offlineQueue';
import api from '../../services/api';

export type CaptureMode = 'camera' | 'voice' | 'text';

interface QuickCaptureProps {
  initialMode?: CaptureMode;
  onSaved?: () => void;
  onCancel?: () => void;
  onModeChange?: (mode: CaptureMode) => void;
  compact?: boolean;
}

export function QuickCapture({
  initialMode = 'text',
  onSaved,
  onCancel,
  onModeChange,
  compact = false,
}: QuickCaptureProps) {
  const { colors } = useThemeStore();
  const [mode, setMode] = useState<CaptureMode>(initialMode);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Camera (photo + video)
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null); // Web only
  const [analyzing, setAnalyzing] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null); // Web only
  const [isVideo, setIsVideo] = useState(false);

  // Voice
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  // ── Photo ────────────────────────────────────────────────

  const pickMedia = useCallback(async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/mp4,video/quicktime,.mp4,.mov';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type?.startsWith('video/')) {
          // Video selected
          if (file.size > 50 * 1024 * 1024) {
            Alert.alert('Too large', 'Video must be under 50MB.');
            return;
          }
          setIsVideo(true);
          setVideoFile(file);
          setVideoUri(URL.createObjectURL(file));
          setImageUri(null);
          setImageFile(null);
        } else {
          // Photo selected
          setIsVideo(false);
          setImageFile(file);
          setImageUri(URL.createObjectURL(file));
          setVideoUri(null);
          setVideoFile(null);
          await analyzeImageWeb(file);
        }
      };
      input.click();
    } else {
      try {
        const ImagePicker = await import('expo-image-picker');
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission needed', 'Camera roll access is required.');
          return;
        }
        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.8,
          videoMaxDuration: 180,
          videoQuality: 1, // Medium quality (~720p)
          allowsEditing: true,
        });
        if (!picked.canceled && picked.assets[0]) {
          const asset = picked.assets[0];
          if (asset.type === 'video') {
            // Video selected
            setIsVideo(true);
            setVideoUri(asset.uri);
            setImageUri(null);
          } else {
            // Photo selected
            setIsVideo(false);
            setImageUri(asset.uri);
            setVideoUri(null);
            await analyzeImageNative(asset.uri);
          }
        }
      } catch {
        Alert.alert('Error', 'Could not open media picker');
      }
    }
  }, []);

  const analyzeImageWeb = async (file: File) => {
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const response = await api.post('/api/learning-events/snap-to-learn', formData);
      if (response.data.description && !description) {
        setDescription(response.data.description);
      }
    } catch {
      // Photo analysis is optional -- capture still works
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeImageNative = async (uri: string) => {
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('photo', { uri, type: 'image/jpeg', name: 'capture.jpg' } as any);
      const response = await api.post('/api/learning-events/snap-to-learn', formData);
      if (response.data.description && !description) {
        setDescription(response.data.description);
      }
    } catch {
      // Photo analysis is optional
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Voice ────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
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
  }, []);

  const stopRecording = useCallback(async () => {
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
  }, []);

  const processAudioWeb = async (file: File) => {
    setTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', file);
      const response = await api.post('/api/learning-events/voice', formData);
      const transcription = response.data.transcription || '';
      setDescription((prev) => (prev ? prev + '\n\n' + transcription : transcription));
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
      const response = await api.post('/api/learning-events/voice', formData);
      const transcription = response.data.transcription || '';
      setDescription((prev) => (prev ? prev + '\n\n' + transcription : transcription));
    } catch {
      Alert.alert('Error', 'Failed to transcribe audio.');
    } finally {
      setTranscribing(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────

  const handleSave = async () => {
    const trimmed = description.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      const res = await api.post('/api/learning-events', {
        description: trimmed,
        source_type: 'realtime',
      });
      const eventId = res.data.event?.id;

      // Upload captured media as evidence if present
      if (eventId && (imageUri || videoUri)) {
        try {
          const formData = new FormData();
          if (isVideo && videoUri) {
            // Video upload
            if (Platform.OS === 'web' && videoFile) {
              formData.append('file', videoFile);
            } else {
              formData.append('file', {
                uri: videoUri,
                name: 'capture.mp4',
                type: 'video/mp4',
              } as any);
            }
            formData.append('block_type', 'video');

            const uploadRes = await api.post(
              `/api/learning-events/${eventId}/upload`,
              formData,
              { timeout: 120000 },
            );
            if (uploadRes.data.file_url) {
              await api.post(`/api/learning-events/${eventId}/evidence`, {
                blocks: [{
                  block_type: 'video',
                  content: {
                    url: uploadRes.data.file_url,
                    filename: uploadRes.data.filename,
                    thumbnail_url: uploadRes.data.thumbnail_url,
                    duration_seconds: uploadRes.data.duration_seconds,
                    width: uploadRes.data.width,
                    height: uploadRes.data.height,
                  },
                  order_index: 0,
                }],
              });
            }
          } else if (imageUri) {
            // Photo upload (existing behavior)
            if (Platform.OS === 'web' && imageFile) {
              formData.append('file', imageFile);
            } else {
              formData.append('file', {
                uri: imageUri,
                name: 'capture.jpg',
                type: 'image/jpeg',
              } as any);
            }
            formData.append('block_type', 'image');

            const uploadRes = await api.post(
              `/api/learning-events/${eventId}/upload`,
              formData,
            );
            if (uploadRes.data.file_url) {
              await api.post(`/api/learning-events/${eventId}/evidence`, {
                blocks: [{
                  block_type: 'image',
                  content: { url: uploadRes.data.file_url, filename: uploadRes.data.filename },
                  order_index: 0,
                }],
              });
            }
          }
        } catch {
          // Media upload failed but moment was saved -- don't block
        }
      }

      setDescription('');
      setImageUri(null);
      setImageFile(null);
      setVideoUri(null);
      setVideoFile(null);
      setIsVideo(false);
      onSaved?.();
    } catch (error: any) {
      if (!error.response) {
        await addToQueue({ description: trimmed, pillars: [], source_type: 'realtime' });
        Alert.alert('Saved Offline', 'Your entry will sync when you are back online.');
        setDescription('');
        setImageUri(null);
        setImageFile(null);
        setVideoUri(null);
        setVideoFile(null);
        setIsVideo(false);
        onSaved?.();
        return;
      }
      Alert.alert('Error', error.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const isBusy = analyzing || transcribing || saving;

  return (
    <View style={styles.container}>
      {/* Mode tabs */}
      {!compact && (
        <View style={styles.modeRow}>
          {([
            { key: 'camera' as CaptureMode, icon: icons.photoMode, label: 'Camera' },
            { key: 'voice' as CaptureMode, icon: icons.voiceMode, label: 'Voice' },
            { key: 'text' as CaptureMode, icon: icons.textMode, label: 'Text' },
          ]).map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[
                styles.modeButton,
                { borderColor: colors.border, backgroundColor: colors.surface },
                mode === m.key && { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
              ]}
              onPress={() => { setMode(m.key); onModeChange?.(m.key); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m.key }}
              accessibilityLabel={m.label}
            >
              <Ionicons
                name={m.icon as any}
                size={22}
                color={mode === m.key ? colors.primary : colors.textMuted}
              />
              <Text style={[
                styles.modeLabel,
                { color: colors.textSecondary },
                mode === m.key && { color: colors.primary, fontFamily: tokens.typography.fonts.semiBold },
              ]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Camera (photo + video) */}
      {mode === 'camera' && (
        <View style={styles.section}>
          {imageUri && !isVideo && (
            <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
          )}
          {videoUri && isVideo && Platform.OS !== 'web' && (
            <View style={styles.videoPreviewPlaceholder}>
              <Ionicons name="videocam" size={40} color={colors.pillars.art} />
              <Text style={[styles.videoPreviewText, { color: colors.textSecondary }]}>Video selected</Text>
            </View>
          )}
          {videoUri && isVideo && Platform.OS === 'web' && (
            <View style={styles.imagePreview}>
              <video src={videoUri} controls style={{ width: '100%', height: '100%', borderRadius: 12, objectFit: 'cover' } as any} />
            </View>
          )}
          <TouchableOpacity
            style={[styles.captureAction, { backgroundColor: colors.pillars.art + '15' }, analyzing && styles.disabled]}
            onPress={pickMedia}
            disabled={analyzing}
          >
            {analyzing ? (
              <ActivityIndicator color={colors.pillars.art} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={24} color={colors.pillars.art} />
                <Text style={[styles.captureActionText, { color: colors.pillars.art }]}>
                  {imageUri || videoUri ? 'Change Media' : 'Photo or Video'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Voice */}
      {mode === 'voice' && (
        <View style={styles.section}>
          {recording && (
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={[styles.recordingLabel, { color: tokens.colors.error }]}>Recording...</Text>
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.captureAction,
              { backgroundColor: recording ? tokens.colors.error + '15' : colors.pillars.communication + '15' },
              transcribing && styles.disabled,
            ]}
            onPress={recording ? stopRecording : startRecording}
            disabled={transcribing}
          >
            {transcribing ? (
              <ActivityIndicator color={colors.pillars.communication} />
            ) : (
              <>
                <Ionicons
                  name={recording ? 'stop' : 'mic-outline'}
                  size={24}
                  color={recording ? tokens.colors.error : colors.pillars.communication}
                />
                <Text style={[
                  styles.captureActionText,
                  { color: recording ? tokens.colors.error : colors.pillars.communication },
                ]}>
                  {recording ? 'Stop Recording' : 'Record Audio'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Text input */}
      <TextInput
        style={[
          styles.textInput,
          { color: colors.text, borderColor: colors.glass.borderLight, backgroundColor: colors.inputBg },
        ]}
        placeholder={mode === 'voice' ? 'Transcription appears here...' : 'What did you learn?'}
        placeholderTextColor={colors.textMuted}
        value={description}
        onChangeText={setDescription}
        multiline
        textAlignVertical="top"
      />

      {/* Actions */}
      <View style={styles.actions}>
        {onCancel && (
          <GlassButton title="Cancel" variant="ghost" size="md" onPress={onCancel} />
        )}
        <GlassButton
          title="Save"
          onPress={handleSave}
          loading={saving}
          disabled={isBusy || !description.trim()}
          size="md"
          icon="add-circle-outline"
          style={styles.saveBtn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  modeRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
    borderWidth: 1.5,
  },
  modeLabel: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
  },
  section: {
    marginBottom: tokens.spacing.md,
  },
  imagePreview: {
    width: '100%',
    height: 180,
    borderRadius: tokens.radius.lg,
    marginBottom: tokens.spacing.sm,
  },
  videoPreviewPlaceholder: {
    width: '100%',
    height: 180,
    borderRadius: tokens.radius.lg,
    marginBottom: tokens.spacing.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  videoPreviewText: {
    fontSize: tokens.typography.sizes.sm,
    marginTop: tokens.spacing.xs,
  },
  captureAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
  },
  captureActionText: {
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
  textInput: {
    borderWidth: 0.5,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.regular,
    minHeight: 100,
    marginBottom: tokens.spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  saveBtn: {
    flex: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});
