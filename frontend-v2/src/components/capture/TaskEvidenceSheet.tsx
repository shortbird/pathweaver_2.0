/**
 * TaskEvidenceSheet - Bottom sheet for adding evidence to a quest task.
 *
 * Same look + feel as CaptureSheet, but targeted at a specific task: media is
 * uploaded straight into the task's evidence document (no separate moment
 * created). Supports photo/video, voice notes, text, and links in one flow.
 *
 * Caller passes taskId + taskTitle, and an onSaved callback that should
 * refetch the task's evidence after we add blocks to it.
 */

import React, { useState, useRef } from 'react';
import { View, Pressable, TextInput, Alert, ScrollView, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '@/src/services/api';
import { uploadViaSignedUrl } from '@/src/services/signedUpload';
import { haptic } from '@/src/utils/haptics';
import { captureException, captureMessage } from '@/src/services/sentry';
import { compressMediaAssets, MAX_VIDEO_DURATION_MS } from '@/src/utils/videoCompression';
import { scanDocumentToPdf } from '@/src/services/documentScanner';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, BottomSheet,
} from '../ui';
import { VoiceRecorder, AudioClipPreview, type RecordedClip } from './VoiceRecorder';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;

interface MediaItem {
  uri: string;
  type: 'image' | 'video' | 'audio' | 'document';
  name: string;
  fileSize?: number;
  durationMs?: number;
  /** Document only: scanned page count, for the preview label. */
  pageCount?: number;
}

interface TaskEvidenceSheetProps {
  visible: boolean;
  /** Title shown in the sheet header ("For: <taskTitle>"). For bounty
   *  deliverables, pass the deliverable text. */
  taskTitle: string;
  /** Existing evidence blocks (used to compute next order_index). */
  existingBlocks: any[];
  onClose: () => void;
  onSaved?: () => void;
  /** Quest task id. Used to build the default upload + save endpoints when
   *  no overrides are provided. Optional when `uploadInitPath` /
   *  `uploadFinalizePath` / `onSave` are all supplied (e.g. bounty deliverable). */
  taskId?: string;
  /** Signed-upload init endpoint. Defaults to the task evidence document
   *  init endpoint when `taskId` is set. */
  uploadInitPath?: string;
  /** Signed-upload finalize endpoint. Defaults to the task evidence document
   *  finalize endpoint when `taskId` is set. */
  uploadFinalizePath?: string;
  /** Extra body fields appended to the signed-upload init POST. Used by the
   *  helper-evidence flow to pass `{ student_id, task_id }` through since
   *  the helper init route doesn't carry a task id in the URL. */
  extraInitBody?: Record<string, unknown>;
  /** Extra body fields appended to the signed-upload finalize POST (same
   *  reason as `extraInitBody`). */
  extraFinalizeBody?: Record<string, unknown>;
  /** Persistence override. Receives both the newly-composed blocks and the
   *  full merged list (existing + new). When omitted, falls back to a POST
   *  of the combined list to `/api/evidence/documents/<taskId>` (the legacy
   *  quest-task behavior). */
  onSave?: (newBlocks: any[], combinedBlocks: any[]) => Promise<void>;
}

function normalizeBlockForSave(block: any) {
  const { block_type, ...rest } = block;
  return { ...rest, type: block.type || block_type };
}

export function TaskEvidenceSheet({
  visible,
  taskId,
  taskTitle,
  existingBlocks,
  onClose,
  onSaved,
  uploadInitPath,
  uploadFinalizePath,
  extraInitBody,
  extraFinalizeBody,
  onSave,
}: TaskEvidenceSheetProps) {
  // Resolve effective endpoints. Default to the quest-task evidence document
  // paths when a taskId is supplied; otherwise the override props must be set.
  const initPath = uploadInitPath || (taskId ? `/api/evidence/documents/${taskId}/upload-init` : '');
  const finalizePath = uploadFinalizePath || (taskId ? `/api/evidence/documents/${taskId}/upload-finalize` : '');
  const c = useThemeColors();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [textNote, setTextNote] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  // Video transcode is slow (seconds) and runs after the picker closes; track
  // it so the UI shows "Optimizing video…" instead of appearing frozen.
  const [compressPct, setCompressPct] = useState<number | null>(null);

  const reset = () => {
    setMedia([]);
    setTextNote('');
    setLinkUrl('');
    setRecording(false);
    setCompressPct(null);
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  // Native pickers must run with the sheet's Modal fully dismissed, or Android
  // crashes with "unregistered ActivityResultLauncher" (and iOS can drop the
  // first launch). Hide the sheet, launch once it's gone, then re-present.
  // State is preserved because reset() only runs on an explicit handleClose.
  const [pickerSuspended, setPickerSuspended] = useState(false);
  const pendingPickerRef = useRef<null | (() => Promise<void>)>(null);

  const runWithSheetHidden = (action: () => Promise<void>) => {
    // Android-only close-then-launch dance (avoids the unregistered
    // ActivityResultLauncher crash). On iOS, dismissing the Modal first makes
    // the picker silently fail to present, so launch directly there.
    if (Platform.OS !== 'android') {
      action().catch((err) => captureException(err, { stage: 'task-evidence-picker-launch' }));
      return;
    }
    pendingPickerRef.current = action;
    setPickerSuspended(true);
  };

  const handleSheetClosed = () => {
    const action = pendingPickerRef.current;
    pendingPickerRef.current = null;
    if (!action) return;
    (async () => {
      try {
        await action();
      } catch (err) {
        captureException(err, { stage: 'task-evidence-picker-launch' });
      } finally {
        setPickerSuspended(false);
      }
    })();
  };

  const addMedia = (assets: ImagePicker.ImagePickerAsset[]) => {
    const next: MediaItem[] = [];
    for (const a of assets) {
      const isVideo = a.type === 'video';
      const max = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
      if (a.fileSize && a.fileSize > max) {
        const mb = (a.fileSize / (1024 * 1024)).toFixed(1);
        const maxMB = max / (1024 * 1024);
        captureMessage('Evidence media rejected: over size limit', {
          surface: 'task-evidence', type: a.type, fileSize: a.fileSize, limit: max,
        });
        Alert.alert('File too large', `${a.fileName || 'File'} is ${mb}MB. Max is ${maxMB}MB.`);
        continue;
      }
      next.push({
        uri: a.uri,
        type: isVideo ? 'video' : 'image',
        name: a.fileName || (isVideo ? 'Video.mp4' : 'Photo.jpg'),
        fileSize: a.fileSize,
      });
    }
    if (next.length) setMedia((prev) => [...prev, ...next]);
  };

  // Gate over-long videos BEFORE the expensive transcode, then compress
  // (images + video) with progress, then attach. Shared by camera + library.
  const processAndAdd = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const allowed = assets.filter((a) => {
      if (a.type === 'video' && a.duration && a.duration > MAX_VIDEO_DURATION_MS) {
        const mins = (a.duration / 60000).toFixed(1);
        const maxMins = MAX_VIDEO_DURATION_MS / 60000;
        captureMessage('Evidence video rejected: over duration limit', {
          surface: 'task-evidence', durationMs: a.duration, fileSize: a.fileSize, limitMs: MAX_VIDEO_DURATION_MS,
        });
        Alert.alert('Video too long', `${a.fileName || 'That video'} is ${mins} min. Videos are limited to ${maxMins} min.`);
        return false;
      }
      return true;
    });
    if (allowed.length === 0) return;
    const hasVideo = allowed.some((a) => a.type === 'video');
    if (hasVideo) setCompressPct(0);
    try {
      const compressed = await compressMediaAssets(allowed, setCompressPct);
      addMedia(compressed);
    } finally {
      setCompressPct(null);
    }
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      videoMaxDuration: 120,
    });
    if (!result.canceled && result.assets.length > 0) {
      await processAndAdd(result.assets);
    }
  };

  const pickFiles = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (!result.canceled && result.assets.length > 0) {
      await processAndAdd(result.assets);
    }
  };

  // Scan pages with the OS document scanner and attach as a single PDF.
  const scanDocument = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Scan documents', 'Document scanning works in the mobile app — try it on iOS or Android.');
      return;
    }
    try {
      const doc = await scanDocumentToPdf();
      if (!doc) return; // user cancelled / no pages
      setMedia((prev) => [...prev, { uri: doc.uri, type: 'document', name: doc.name, pageCount: doc.pageCount }]);
    } catch (err: any) {
      Alert.alert('Scan unavailable', err?.message || 'Could not start the document scanner. Make sure the app has camera access.');
    }
  };

  const removeMedia = (idx: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== idx));
  };

  const hasAnything =
    media.length > 0 || textNote.trim().length > 0 || linkUrl.trim().length > 0;

  const handleSave = async () => {
    if (!hasAnything || saving) return;
    setSaving(true);
    try {
      // Upload media in parallel via the task's signed-upload endpoints.
      const uploadResults = await Promise.all(
        media.map(async (item) => {
          const mime =
            item.type === 'video' ? 'video/mp4' :
            item.type === 'audio' ? 'audio/m4a' :
            item.type === 'document' ? 'application/pdf' :
            'image/jpeg';
          try {
            const result = await uploadViaSignedUrl({
              file: { uri: item.uri, name: item.name, type: mime, size: item.fileSize ?? 0 },
              initPath,
              finalizePath,
              blockType: item.type,
              extraInitBody,
              extraFinalizeBody,
            });
            return {
              type: item.type,
              content: {
                url: (result.file_url || result.url) as string,
                filename: (result.filename || result.file_name || item.name) as string,
                ...(item.type === 'audio' && item.durationMs ? { duration_ms: item.durationMs } : {}),
              },
            };
          } catch (uploadErr) {
            // Report instead of silently dropping, so a failed upload surfaces to
            // the user rather than vanishing ("uploads disappear" complaint).
            captureException(uploadErr, {
              stage: 'task-evidence-upload',
              extra: { type: item.type, name: item.name },
            });
            return null;
          }
        }),
      );
      const uploaded = uploadResults.filter((x): x is { type: string; content: Record<string, any> } => Boolean(x));
      const failedUploads = uploadResults.length - uploaded.length;

      // Assemble the new block list: existing + media + text + link.
      const startIdx = existingBlocks.length;
      const newBlocks: any[] = uploaded.map((b, i) => ({
        ...b,
        order_index: startIdx + i,
      }));
      // A link plus its note is ONE labeled link block, not a separate text +
      // link pair. The feed renders one card per evidence block, so two blocks
      // split into two cards ("Working with Gemini" + the bare URL); folding the
      // note in as the link's title keeps them as a single labeled link.
      const note = textNote.trim();
      const url = linkUrl.trim();
      if (url) {
        newBlocks.push({
          type: 'link',
          content: { url, title: note || url },
          order_index: startIdx + newBlocks.length,
        });
      } else if (note) {
        newBlocks.push({
          type: 'text',
          content: { text: note },
          order_index: startIdx + newBlocks.length,
        });
      }

      if (newBlocks.length === 0) {
        // Nothing actually saved. Distinguish "user added nothing" from "every
        // upload failed" so a failed upload doesn't read as an empty form.
        Alert.alert(
          failedUploads > 0 ? 'Upload failed' : 'Nothing to save',
          failedUploads > 0
            ? "Your evidence couldn't be uploaded. Check your connection and try again."
            : 'Add some evidence and try again.',
        );
        setSaving(false);
        return;
      }

      const combined = [
        ...existingBlocks.map(normalizeBlockForSave),
        ...newBlocks,
      ];
      if (onSave) {
        await onSave(newBlocks, combined);
      } else if (taskId) {
        // Legacy quest-task flow: post the combined block list to the task's
        // evidence document.
        await api.post(`/api/evidence/documents/${taskId}`, {
          blocks: combined,
          status: 'draft',
        });
      } else {
        throw new Error('TaskEvidenceSheet: either onSave or taskId is required.');
      }
      if (failedUploads > 0) {
        // Partial success: the rest saved, but tell the user some files didn't.
        Alert.alert(
          'Some files not saved',
          `${failedUploads} file${failedUploads > 1 ? 's' : ''} couldn't be uploaded. The rest of your evidence was saved.`,
        );
      }
      haptic.success();
      reset();
      onClose();
      onSaved?.();
    } catch (err: any) {
      haptic.error();
      const msg = err.response?.data?.error?.message || err.response?.data?.error || 'Failed to save evidence';
      Alert.alert('Error', typeof msg === 'string' ? msg : 'Failed to save evidence');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible && !pickerSuspended} onClose={handleClose} onClosed={handleSheetClosed}>
      <VStack space="md">
        {/* Header */}
        <HStack className="items-center justify-between">
          <VStack className="flex-1 min-w-0">
            <Heading size="lg">Add Evidence</Heading>
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mt-0.5" numberOfLines={1}>
              For: {taskTitle}
            </UIText>
          </VStack>
          <Pressable
            onPress={handleClose}
            className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
            hitSlop={8}
          >
            <Ionicons name="close" size={18} color={c.icon} />
          </Pressable>
        </HStack>

        {/* Text note */}
        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase tracking-wider">
            What you did
          </UIText>
          <TextInput
            value={textNote}
            onChangeText={setTextNote}
            placeholder="Describe what you did, what you learned..."
            placeholderTextColor={c.textFaint}
            multiline
            numberOfLines={3}
            className="bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-4 text-base font-poppins text-typo dark:text-dark-typo min-h-[80px]"
            style={{ textAlignVertical: 'top' }}
          />
        </VStack>

        {/* Media previews */}
        {media.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <HStack className="gap-2 items-center">
              {media.map((item, index) => {
                if (item.type === 'audio') {
                  return (
                    <AudioClipPreview
                      key={index}
                      clip={{
                        uri: item.uri,
                        name: item.name,
                        fileSize: item.fileSize ?? 0,
                        durationMs: item.durationMs ?? 0,
                      }}
                      onRemove={() => removeMedia(index)}
                    />
                  );
                }
                return (
                  <View key={index} style={{ width: 96, height: 96 }}>
                    {item.type === 'image' ? (
                      <Image
                        source={{ uri: item.uri }}
                        style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: c.surfaceMuted }}
                        resizeMode="cover"
                      />
                    ) : item.type === 'document' ? (
                      <View style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: '#6D469B', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                        <Ionicons name="document-text" size={32} color="#FFFFFF" />
                        <UIText size="xs" className="text-white font-poppins-medium mt-1">
                          PDF{item.pageCount ? ` · ${item.pageCount}p` : ''}
                        </UIText>
                      </View>
                    ) : (
                      <View style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: '#1F1F2E', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="play-circle" size={36} color="#FFFFFF" />
                        <UIText size="xs" className="text-white font-poppins-medium mt-1">Video</UIText>
                      </View>
                    )}
                    <Pressable
                      onPress={() => removeMedia(index)}
                      hitSlop={6}
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        width: 24, height: 24, borderRadius: 12,
                        backgroundColor: c.card,
                        alignItems: 'center', justifyContent: 'center',
                        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
                        elevation: 2,
                      }}
                    >
                      <Ionicons name="close-circle" size={22} color={c.icon} />
                    </Pressable>
                  </View>
                );
              })}
            </HStack>
          </ScrollView>
        )}

        {/* Video compression progress */}
        {compressPct !== null && (
          <HStack className="items-center gap-2 px-1">
            <Ionicons name="film-outline" size={16} color={c.icon} />
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">
              Optimizing video… {compressPct}%
            </UIText>
          </HStack>
        )}

        {/* Voice recorder */}
        {recording && (
          <VoiceRecorder
            active={recording}
            onCancel={() => setRecording(false)}
            onRecorded={(clip: RecordedClip) => {
              if (clip.fileSize > MAX_AUDIO_SIZE) {
                const mb = (clip.fileSize / (1024 * 1024)).toFixed(1);
                Alert.alert('Recording too long', `That clip is ${mb}MB. Voice notes are limited to ${MAX_AUDIO_SIZE / (1024 * 1024)}MB.`);
              } else {
                setMedia((prev) => [
                  ...prev,
                  { uri: clip.uri, type: 'audio', name: clip.name, fileSize: clip.fileSize, durationMs: clip.durationMs },
                ]);
              }
              setRecording(false);
            }}
          />
        )}

        {/* Attach buttons */}
        <HStack className="gap-3">
          <Pressable
            onPress={() => runWithSheetHidden(openCamera)}
            className="flex-1 items-center py-3.5 bg-surface-50 dark:bg-dark-surface-50 rounded-xl active:bg-surface-100"
            style={{ minHeight: 44 }}
          >
            <Ionicons name="camera-outline" size={26} color="#6D469B" />
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mt-1 font-poppins-medium">Camera</UIText>
          </Pressable>
          <Pressable
            onPress={() => {
              if (Platform.OS === 'web') {
                Alert.alert('Voice notes', 'Voice recording works in the mobile app.');
                return;
              }
              setRecording(true);
            }}
            disabled={recording}
            className="flex-1 items-center py-3.5 bg-surface-50 dark:bg-dark-surface-50 rounded-xl active:bg-surface-100"
            style={{ minHeight: 44, opacity: recording ? 0.4 : 1 }}
          >
            <Ionicons name={recording ? 'mic' : 'mic-outline'} size={26} color="#6D469B" />
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mt-1 font-poppins-medium">Voice</UIText>
          </Pressable>
          <Pressable
            onPress={() => runWithSheetHidden(pickFiles)}
            className="flex-1 items-center py-3.5 bg-surface-50 dark:bg-dark-surface-50 rounded-xl active:bg-surface-100"
            style={{ minHeight: 44 }}
          >
            <Ionicons name="images-outline" size={26} color="#6D469B" />
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mt-1 font-poppins-medium">Files</UIText>
          </Pressable>
          <Pressable
            onPress={() => runWithSheetHidden(scanDocument)}
            className="flex-1 items-center py-3.5 bg-surface-50 dark:bg-dark-surface-50 rounded-xl active:bg-surface-100"
            style={{ minHeight: 44 }}
          >
            <Ionicons name="scan-outline" size={26} color="#6D469B" />
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mt-1 font-poppins-medium">Scan</UIText>
          </Pressable>
        </HStack>

        {/* Optional link */}
        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase tracking-wider">
            Add a link (optional)
          </UIText>
          <View className="flex-row items-center gap-2 bg-surface-50 dark:bg-dark-surface-50 rounded-xl px-3">
            <Ionicons name="link-outline" size={16} color="#6D469B" />
            <TextInput
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://"
              placeholderTextColor={c.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              className="flex-1 py-3 text-base font-poppins"
            />
          </View>
        </VStack>

        {/* Save */}
        <Button
          size="lg"
          onPress={handleSave}
          disabled={!hasAnything || saving}
          loading={saving}
          className="w-full"
        >
          <ButtonText>{saving ? 'Saving…' : 'Save Evidence'}</ButtonText>
        </Button>
      </VStack>
    </BottomSheet>
  );
}
