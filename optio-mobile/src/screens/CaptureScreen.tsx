/**
 * Capture Screen - Multi-mode learning capture (Photo / Voice / Text).
 *
 * Photo mode: Snap-to-Learn with AI pillar suggestion.
 * Voice mode: Audio recording with transcription.
 * Text mode: Quick text entry (redirects to Journal).
 *
 * Camera and audio use expo-camera and expo-av respectively.
 * On web, shows file picker fallbacks.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens, PillarKey } from '../theme/tokens';
import { icons } from '../theme/icons';
import { GlassCard } from '../components/common/GlassCard';
import { GlassBackground } from '../components/common/GlassBackground';
import api from '../services/api';

type CaptureMode = 'photo' | 'voice' | 'text';

const PILLARS: { key: PillarKey; label: string }[] = [
  { key: 'stem', label: 'STEM' },
  { key: 'art', label: 'Art' },
  { key: 'communication', label: 'Comm' },
  { key: 'civics', label: 'Civics' },
  { key: 'wellness', label: 'Wellness' },
];

export function CaptureScreen() {
  const [mode, setMode] = useState<CaptureMode>('photo');

  return (
    <GlassBackground style={styles.container}>
      <Text style={styles.title}>Capture</Text>

      <View style={styles.modeRow}>
        {(['photo', 'voice', 'text'] as CaptureMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modeButton, mode === m && styles.modeButtonActive]}
            onPress={() => setMode(m)}
          >
            <Ionicons
              name={(m === 'photo' ? icons.photoMode : m === 'voice' ? icons.voiceMode : icons.textMode) as any}
              size={24}
              color={mode === m ? tokens.colors.primary : tokens.colors.textMuted}
            />
            <Text style={[styles.modeLabel, mode === m && styles.modeLabelActive]}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'photo' && <PhotoCapture />}
      {mode === 'voice' && <VoiceCapture />}
      {mode === 'text' && <TextCapture />}
    </GlassBackground>
  );
}

function PhotoCapture() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    suggested_pillar: string;
    description: string;
    reflection_prompts: string[];
  } | null>(null);
  const [selectedPillar, setSelectedPillar] = useState<PillarKey | null>(null);
  const [reflection, setReflection] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);

  const pickImage = async () => {
    if (Platform.OS === 'web') {
      // Web: use file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (file) {
          setImageUri(URL.createObjectURL(file));
          await analyzeImage(file);
        }
      };
      input.click();
    } else {
      // Native: use expo-image-picker
      try {
        const ImagePicker = await import('expo-image-picker');
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission needed', 'Camera roll access is required.');
          return;
        }
        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
        if (!picked.canceled && picked.assets[0]) {
          setImageUri(picked.assets[0].uri);
          await analyzeImageNative(picked.assets[0].uri);
        }
      } catch {
        Alert.alert('Error', 'Could not open image picker');
      }
    }
  };

  const analyzeImage = async (file: File) => {
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const response = await api.post('/api/learning-events/snap-to-learn', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(response.data);
      setSelectedPillar(response.data.suggested_pillar as PillarKey);
    } catch {
      Alert.alert('Error', 'Failed to analyze image. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const analyzeImageNative = async (uri: string) => {
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('photo', {
        uri,
        type: 'image/jpeg',
        name: 'capture.jpg',
      } as any);
      const response = await api.post('/api/learning-events/snap-to-learn', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(response.data);
      setSelectedPillar(response.data.suggested_pillar as PillarKey);
    } catch {
      Alert.alert('Error', 'Failed to analyze image. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const saveEntry = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const description = reflection.trim() || result.description;
      await api.post('/api/learning-events', {
        description,
        pillars: [selectedPillar || result.suggested_pillar],
        source_type: 'realtime',
      });
      Alert.alert('Saved!', 'Learning moment captured.');
      setResult(null);
      setReflection('');
      setImageUri(null);
      setSelectedPillar(null);
    } catch {
      Alert.alert('Error', 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.captureContent} contentContainerStyle={styles.captureScroll}>
      {!result ? (
        <View style={styles.capturePrompt}>
          {imageUri && <Image source={{ uri: imageUri }} style={styles.previewImage} />}
          <TouchableOpacity
            style={[styles.captureButton, uploading && styles.buttonDisabled]}
            onPress={pickImage}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.captureButtonText}>
                {imageUri ? 'Analyzing...' : 'Select Photo'}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.captureHint}>Take or select a photo of a learning moment</Text>
        </View>
      ) : (
        <GlassCard>
          {imageUri && <Image source={{ uri: imageUri }} style={styles.resultImage} />}
          <Text style={styles.resultLabel}>AI Suggestion</Text>
          <Text style={styles.resultDescription}>{result.description}</Text>

          <Text style={styles.resultLabel}>Pillar</Text>
          <View style={styles.pillarRow}>
            {PILLARS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[
                  styles.pillarChip,
                  {
                    borderColor: tokens.colors.pillars[p.key],
                    backgroundColor:
                      selectedPillar === p.key ? tokens.colors.pillars[p.key] : 'transparent',
                  },
                ]}
                onPress={() => setSelectedPillar(p.key)}
              >
                <Text
                  style={{
                    fontSize: tokens.typography.sizes.xs,
                    color: selectedPillar === p.key ? '#FFF' : tokens.colors.pillars[p.key],
                  }}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {result.reflection_prompts?.length > 0 && (
            <>
              <Text style={styles.resultLabel}>Reflect</Text>
              <Text style={styles.promptText}>{result.reflection_prompts[0]}</Text>
            </>
          )}

          <TextInput
            style={styles.reflectionInput}
            placeholder="Add your reflection (optional)..."
            placeholderTextColor={tokens.colors.textMuted}
            value={reflection}
            onChangeText={setReflection}
            multiline
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={saveEntry}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>Save Entry</Text>
            )}
          </TouchableOpacity>
        </GlassCard>
      )}
    </ScrollView>
  );
}

function VoiceCapture() {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    transcription: string;
    suggested_pillar: string;
    reflection_prompts: string[];
  } | null>(null);
  const [editedText, setEditedText] = useState('');
  const [selectedPillar, setSelectedPillar] = useState<PillarKey | null>(null);
  const [saving, setSaving] = useState(false);

  const startRecording = async () => {
    if (Platform.OS === 'web') {
      // Web: use file input for audio
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (file) await processAudio(file);
      };
      input.click();
    } else {
      // Native: use expo-av for recording
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
        // Store recording ref for stop
        (globalThis as any).__currentRecording = rec;
      } catch {
        Alert.alert('Error', 'Could not start recording');
      }
    }
  };

  const stopRecording = async () => {
    setRecording(false);
    try {
      const rec = (globalThis as any).__currentRecording;
      if (rec) {
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        if (uri) await processAudioNative(uri);
        (globalThis as any).__currentRecording = null;
      }
    } catch {
      Alert.alert('Error', 'Could not process recording');
    }
  };

  const processAudio = async (file: File) => {
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('audio', file);
      const response = await api.post('/api/learning-events/voice', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(response.data);
      setEditedText(response.data.transcription);
      setSelectedPillar(response.data.suggested_pillar as PillarKey);
    } catch {
      Alert.alert('Error', 'Failed to transcribe audio. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const processAudioNative = async (uri: string) => {
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('audio', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);
      const response = await api.post('/api/learning-events/voice', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(response.data);
      setEditedText(response.data.transcription);
      setSelectedPillar(response.data.suggested_pillar as PillarKey);
    } catch {
      Alert.alert('Error', 'Failed to transcribe audio. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const saveEntry = async () => {
    if (!editedText.trim()) return;
    setSaving(true);
    try {
      await api.post('/api/learning-events', {
        description: editedText.trim(),
        pillars: [selectedPillar || result?.suggested_pillar || 'wellness'],
        source_type: 'realtime',
      });
      Alert.alert('Saved!', 'Voice journal entry saved.');
      setResult(null);
      setEditedText('');
      setSelectedPillar(null);
    } catch {
      Alert.alert('Error', 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.captureContent} contentContainerStyle={styles.captureScroll}>
      {!result ? (
        <View style={styles.capturePrompt}>
          {recording && (
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>Recording...</Text>
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.captureButton,
              recording && { backgroundColor: tokens.colors.error },
              uploading && styles.buttonDisabled,
            ]}
            onPress={recording ? stopRecording : startRecording}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.captureButtonText}>
                {recording ? 'Stop Recording' : Platform.OS === 'web' ? 'Select Audio File' : 'Start Recording'}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.captureHint}>Record or upload audio of what you learned</Text>
        </View>
      ) : (
        <GlassCard>
          <Text style={styles.resultLabel}>Transcription</Text>
          <TextInput
            style={styles.transcriptionInput}
            value={editedText}
            onChangeText={setEditedText}
            multiline
          />

          <Text style={styles.resultLabel}>Pillar</Text>
          <View style={styles.pillarRow}>
            {PILLARS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[
                  styles.pillarChip,
                  {
                    borderColor: tokens.colors.pillars[p.key],
                    backgroundColor:
                      selectedPillar === p.key ? tokens.colors.pillars[p.key] : 'transparent',
                  },
                ]}
                onPress={() => setSelectedPillar(p.key)}
              >
                <Text
                  style={{
                    fontSize: tokens.typography.sizes.xs,
                    color: selectedPillar === p.key ? '#FFF' : tokens.colors.pillars[p.key],
                  }}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={saveEntry}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>Save Entry</Text>
            )}
          </TouchableOpacity>
        </GlassCard>
      )}
    </ScrollView>
  );
}

function TextCapture() {
  const [text, setText] = useState('');
  const [selectedPillars, setSelectedPillars] = useState<PillarKey[]>([]);
  const [saving, setSaving] = useState(false);

  const togglePillar = (key: PillarKey) => {
    setSelectedPillars((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
  };

  const handleSave = async () => {
    if (text.trim().length < 10) {
      Alert.alert('Too short', 'Please write at least 10 characters.');
      return;
    }
    setSaving(true);
    try {
      let pillars = selectedPillars as string[];
      if (pillars.length === 0) {
        try {
          const aiRes = await api.post('/api/learning-events/ai-suggestions', {
            description: text.trim(),
          });
          pillars = aiRes.data.suggestions?.pillars || ['wellness'];
        } catch {
          pillars = ['wellness'];
        }
      }
      await api.post('/api/learning-events', {
        description: text.trim(),
        pillars,
        source_type: 'realtime',
      });
      Alert.alert('Saved!', 'Learning moment captured.');
      setText('');
      setSelectedPillars([]);
    } catch {
      Alert.alert('Error', 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.captureContent} contentContainerStyle={styles.captureScroll}>
      <GlassCard>
        <TextInput
          style={styles.textInput}
          placeholder="What did you learn today? (min 10 chars)"
          placeholderTextColor={tokens.colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
        />

        <Text style={styles.resultLabel}>Pillars (optional)</Text>
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
                style={{
                  fontSize: tokens.typography.sizes.xs,
                  color: selectedPillars.includes(p.key) ? '#FFF' : tokens.colors.pillars[p.key],
                }}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save Entry</Text>
          )}
        </TouchableOpacity>
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor handled by GlassBackground
    paddingTop: 60,
    paddingHorizontal: tokens.spacing.md,
  },
  title: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.md,
  },
  modeRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    marginBottom: tokens.spacing.lg,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    borderWidth: 2,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  modeButtonActive: {
    borderColor: tokens.colors.primary,
    backgroundColor: tokens.colors.primary + '10',
  },
  modeIcon: {
    fontSize: 24,
    marginBottom: tokens.spacing.xs,
  },
  modeIconActive: {},
  modeLabel: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textSecondary,
  },
  modeLabelActive: {
    color: tokens.colors.primary,
    fontWeight: tokens.typography.weights.semiBold,
  },
  captureContent: {
    flex: 1,
  },
  captureScroll: {
    paddingBottom: tokens.spacing.xxl,
  },
  capturePrompt: {
    alignItems: 'center',
    paddingTop: tokens.spacing.xl,
  },
  captureButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.lg,
    paddingVertical: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },
  captureButtonText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.lg,
    fontWeight: tokens.typography.weights.semiBold,
  },
  captureHint: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textMuted,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  previewImage: {
    width: 200,
    height: 200,
    borderRadius: tokens.radius.md,
    marginBottom: tokens.spacing.md,
  },
  resultImage: {
    width: '100%',
    height: 180,
    borderRadius: tokens.radius.sm,
    marginBottom: tokens.spacing.md,
  },
  resultLabel: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.semiBold,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.xs,
    marginTop: tokens.spacing.sm,
  },
  resultDescription: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textSecondary,
    lineHeight: 20,
  },
  promptText: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.primary,
    fontStyle: 'italic',
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
  reflectionInput: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.md,
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
    marginTop: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  transcriptionInput: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.md,
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: tokens.spacing.md,
  },
  textInput: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.md,
    fontSize: tokens.typography.sizes.md,
    color: tokens.colors.text,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: tokens.spacing.md,
  },
  saveButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.semiBold,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.lg,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: tokens.colors.error,
  },
  recordingText: {
    fontSize: tokens.typography.sizes.md,
    color: tokens.colors.error,
    fontWeight: tokens.typography.weights.semiBold,
  },
});
