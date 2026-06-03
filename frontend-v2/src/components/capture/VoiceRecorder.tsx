/**
 * VoiceRecorder - inline voice-note recording widget for the CaptureSheet.
 *
 * Two states:
 *  - "recording": shows a pulsing red dot + elapsed time + STOP button.
 *  - "idle":      not visible (the parent shows the Voice button instead).
 *
 * On stop, we hand the resulting file (uri + name + size + duration) up to the
 * parent via onRecorded(); the parent stores it alongside its image/video
 * media[] and uploads the clip when the user taps "Save Moment".
 *
 * iOS records to .m4a (AAC in MP4 container) — matches our backend's
 * ALLOWED_AUDIO_EXTENSIONS set. Android records to .m4a too via the
 * HIGH_QUALITY preset.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Alert, Animated, Easing, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import { VStack, HStack, UIText, Heading, Button, ButtonText } from '../ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

export interface RecordedClip {
  uri: string;
  name: string;
  fileSize: number;
  durationMs: number;
}

interface Props {
  /** When true, the recorder is mounted and the user is mid-recording. Parent
   *  toggles this from the "Voice" button in CaptureSheet. */
  active: boolean;
  /** Called when the user stops; passes the resulting clip back to the parent. */
  onRecorded: (clip: RecordedClip) => void;
  /** Called when the user cancels mid-recording. */
  onCancel: () => void;
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(1, '0')}:${s.toString().padStart(2, '0')}`;
}

export function VoiceRecorder({ active, onRecorded, onCancel }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;
  const c = useThemeColors();

  // Configure the audio session for recording (iOS) once we go active.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setStarting(true);
    (async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            'Microphone access needed',
            'To record voice notes, please allow microphone access in Settings.',
          );
          onCancel();
          return;
        }
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          // Duck other audio while we're recording so the parent's Spotify /
          // podcast doesn't bleed into the voice note. Both keys are noisy in
          // the expo-audio types depending on version, so we cast through any.
          interruptionMode: 'duckOthers',
          shouldDuckAndroid: true,
        } as any);
        if (cancelled) return;
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch (err) {
        Alert.alert('Could not start recording', 'Try again in a moment.');
        onCancel();
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally do not depend on recorder; we want a single-shot start when
    // active flips true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Pulse animation while recording.
  useEffect(() => {
    if (!active || !state.isRecording) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, state.isRecording, pulse]);

  const handleStop = useCallback(async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await recorder.stop();
      // After stop(), recorder.uri is the file path on disk.
      const uri = recorder.uri;
      if (!uri) {
        Alert.alert('Recording failed', 'No audio was captured.');
        onCancel();
        return;
      }
      // Probe size via expo-file-system. Duration comes from state.durationMillis,
      // which is the last sample we got from the recorder hook.
      let fileSize = 0;
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && typeof info.size === 'number') {
          fileSize = info.size;
        }
      } catch {
        // Non-fatal — backend will still receive the file; size guard upstream.
      }
      const durationMs = state.durationMillis || 0;
      // Reset audio mode so subsequent media playback in the sheet works.
      try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }); } catch { /* ignore */ }
      const ext = Platform.OS === 'ios' ? 'm4a' : 'm4a';
      const name = `voice-${Date.now()}.${ext}`;
      onRecorded({ uri, name, fileSize, durationMs });
    } catch (err) {
      Alert.alert('Could not save recording', 'Try recording again.');
      onCancel();
    } finally {
      setStopping(false);
    }
  }, [recorder, state.durationMillis, stopping, onRecorded, onCancel]);

  const handleCancel = useCallback(async () => {
    try {
      if (state.isRecording) {
        await recorder.stop();
      }
    } catch { /* ignore */ }
    try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }); } catch { /* ignore */ }
    onCancel();
  }, [recorder, state.isRecording, onCancel]);

  if (!active) return null;

  return (
    <View
      style={{
        backgroundColor: '#FEE2E2',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#FCA5A5',
      }}
    >
      <VStack space="md">
        <HStack className="items-center justify-between">
          <HStack className="items-center gap-3">
            <Animated.View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#DC2626',
                transform: [{ scale: pulse }],
              }}
            />
            <UIText size="sm" className="font-poppins-semibold" style={{ color: '#991B1B' }}>
              {starting ? 'Starting…' : state.isRecording ? 'Recording' : 'Ready'}
            </UIText>
          </HStack>
          <UIText
            size="lg"
            className="font-poppins-bold"
            style={{ color: '#991B1B', fontVariant: ['tabular-nums'] as any }}
          >
            {formatTime(state.durationMillis || 0)}
          </UIText>
        </HStack>

        <HStack className="gap-3">
          <Pressable
            onPress={handleCancel}
            disabled={starting || stopping}
            style={{
              flex: 1,
              minHeight: 48,
              backgroundColor: c.card,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: starting || stopping ? 0.6 : 1,
            }}
          >
            <UIText size="sm" className="font-poppins-medium" style={{ color: c.textMuted }}>
              Cancel
            </UIText>
          </Pressable>
          <Pressable
            onPress={handleStop}
            disabled={!state.isRecording || stopping}
            style={{
              flex: 2,
              minHeight: 48,
              backgroundColor: '#DC2626',
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
              opacity: !state.isRecording || stopping ? 0.6 : 1,
            }}
          >
            <Ionicons name="stop-circle" size={22} color="#FFFFFF" />
            <UIText size="sm" className="font-poppins-semibold" style={{ color: '#FFFFFF' }}>
              {stopping ? 'Saving…' : 'Stop & save'}
            </UIText>
          </Pressable>
        </HStack>
      </VStack>
    </View>
  );
}

interface PlaybackProps {
  clip: RecordedClip;
  /** When omitted, the X button is hidden — use this for read-only display
   *  (e.g. rendering an audio evidence block in a quest detail view). */
  onRemove?: () => void;
}

/**
 * AudioClipPreview — chip shown in the media row after a recording is captured.
 * Lets the student play it back before saving the moment. Also reused as a
 * read-only player when displaying audio evidence blocks (omit onRemove).
 */
export function AudioClipPreview({ clip, onRemove }: PlaybackProps) {
  const player = useAudioPlayer(clip.uri);
  const status = useAudioPlayerStatus(player);
  const c = useThemeColors();

  useEffect(() => {
    return () => {
      try { player.pause(); } catch { /* ignore */ }
    };
  }, [player]);

  const togglePlay = () => {
    if (status.playing) {
      player.pause();
    } else {
      // Seek to start if we're at the end.
      if (status.duration > 0 && status.currentTime >= status.duration - 0.05) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  const totalMs = (status.duration || clip.durationMs / 1000 || 0) * 1000;
  const currentMs = (status.currentTime || 0) * 1000;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#F3E8FF',
        borderRadius: 12,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: 'rgba(109, 70, 155, 0.25)',
        height: 56,
        minWidth: 180,
      }}
    >
      <Pressable
        onPress={togglePlay}
        hitSlop={8}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: '#6D469B',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color="#FFFFFF" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <UIText size="xs" className="text-optio-purple font-poppins-semibold">
          Voice note
        </UIText>
        <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500" style={{ fontVariant: ['tabular-nums'] as any }}>
          {formatTime(currentMs)} / {formatTime(totalMs)}
        </UIText>
      </View>
      {onRemove && (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: c.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={14} color={c.icon} />
        </Pressable>
      )}
    </View>
  );
}
