/**
 * CaptureSheet - Bottom sheet for quick learning moment capture (mobile).
 *
 * Minimal friction: description + multiple media attachments.
 * Creates moment via JSON, then uploads files individually.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Pressable, TextInput, Alert, ScrollView, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '@/src/services/api';
import { uploadViaSignedUrl } from '@/src/services/signedUpload';
import { haptic } from '@/src/utils/haptics';
import { toast } from '@/src/stores/toastStore';
import { captureException, captureMessage } from '@/src/services/sentry';
import { useMediaUploadStore } from '@/src/stores/mediaUploadStore';
import { scanDocumentToPdf } from '@/src/services/documentScanner';
import { compressMediaAssets, MAX_VIDEO_DURATION_MS } from '@/src/utils/videoCompression';
import { enqueueUpload } from '@/src/services/uploadQueue';
import { useMyChildren } from '@/src/hooks/useParent';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, BottomSheet, PillarBadge,
  Avatar, AvatarFallbackText, AvatarImage,
} from '../ui';
import {
  attachMomentToTask,
  type AttachableTask, type AttachableQuest,
} from '../journal/TaskPickerSheet';
import { InlineQuestTaskPicker } from './InlineQuestTaskPicker';
import { InlineTopicPicker } from './InlineTopicPicker';
import { assignMomentToTopic, type UnifiedTopic } from '@/src/hooks/useJournal';
import { VoiceRecorder, AudioClipPreview, type RecordedClip } from './VoiceRecorder';

// File size limits (must match backend constants).
// Signed-upload path: videos go direct-to-Supabase and can be up to 500MB.
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB (signed-upload)
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;  // 25MB (matches backend MAX_AUDIO_SIZE)

interface MediaItem {
  uri: string;
  type: 'image' | 'video' | 'audio' | 'document';
  name: string;
  fileSize?: number;
  /** Audio only: duration in ms, for the playback chip. */
  durationMs?: number;
  /** Document only: scanned page count, for the preview label. */
  pageCount?: number;
}

interface CaptureSheetProps {
  visible: boolean;
  onClose: () => void;
  onCaptured?: () => void;
  /** When set, captures moment for specific student(s) (parent flow with pre-selected kids) */
  studentIds?: string[];
  /** When true, fetches the parent's children and renders a multi-select kid picker
   *  at the top of the sheet. Used by the parent center-capture tab. */
  pickStudents?: boolean;
  /** When set, the task picker opens pre-scoped to this quest (only its tasks shown)
   *  and the sheet header reflects that we're capturing for this quest. */
  questContext?: { questId: string; questTitle: string };
}

export function CaptureSheet({ visible, onClose, onCaptured, studentIds, pickStudents = false, questContext }: CaptureSheetProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{ task: AttachableTask; questTitle: string } | null>(null);
  // "Add as new task in <quest>" intent — mutually exclusive with selectedTask.
  const [pendingNewTask, setPendingNewTask] = useState<AttachableQuest | null>(null);
  const [topicOpen, setTopicOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<UnifiedTopic | null>(null);
  const [recording, setRecording] = useState(false);
  // Video transcode runs after the picker closes; surface progress so the UI
  // doesn't appear frozen during the (multi-second) compression.
  const [compressPct, setCompressPct] = useState<number | null>(null);

  // Parent flow: fetch children when pickStudents is on. The hook short-circuits
  // gracefully for non-parent users (empty list, no error toast).
  const { children: parentChildren } = useMyChildren();
  const c = useThemeColors();
  const eligibleChildren = pickStudents ? parentChildren : [];
  // Starts empty by design: parents pick which kids the moment applies to.
  // A "Select all" chip is offered alongside the per-kid chips below.
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  const toggleStudent = (id: string) => {
    haptic.light();
    setSelectedStudentIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const allKidsSelected =
    eligibleChildren.length > 0 && selectedStudentIds.length === eligibleChildren.length;

  const toggleAllKids = () => {
    haptic.light();
    setSelectedStudentIds(allKidsSelected ? [] : eligibleChildren.map((c: any) => c.id));
  };

  // Parent flow: default-select all eligible children when the sheet opens, so
  // the "Save Moment" button isn't disabled-on-arrival (previously a parent had
  // to manually tap a child chip first, which read as a broken button). Parents
  // can still deselect to narrow it down. No-op for the student flow (pickStudents
  // false) and when an explicit studentIds prop drives the selection.
  useEffect(() => {
    if (!visible || !pickStudents) return;
    if (studentIds && studentIds.length > 0) return;
    if (eligibleChildren.length === 0) return;
    setSelectedStudentIds((prev) =>
      prev.length === 0 ? eligibleChildren.map((c: any) => c.id) : prev,
    );
  }, [visible, pickStudents, studentIds, eligibleChildren]);

  const reset = useCallback(() => {
    setTitle('');
    setDescription('');
    setLinkUrl('');
    setMedia([]);
    setSelectedTask(null);
    setPendingNewTask(null);
    setAttachOpen(false);
    setSelectedTopic(null);
    setTopicOpen(false);
    setSelectedStudentIds([]);
    setRecording(false);
    setCompressPct(null);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  // Always clear the sheet when it's hidden — by the X, a swipe-down, or the
  // parent flipping `visible` after navigation. Previously a save that errored
  // (or an external dismiss) left the picked media in component state, so the
  // NEXT time the sheet opened the user saw a stale video from the last attempt
  // ("I see the last video I tried uploading in this new moment capture").
  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  // Native pickers (camera, photo library, document scanner) must run with the
  // sheet's Modal fully dismissed. On Android, launching them while the RN Modal
  // is mounted crashes with "Attempting to launch an unregistered
  // ActivityResultLauncher" (the "Scan unavailable / Camera won't open / files
  // won't open" reports); iOS can also drop the first launch. We hide the sheet,
  // run the picker once it's fully gone (BottomSheet.onClosed), then re-present.
  // The in-progress moment survives because reset() is keyed on the parent
  // `visible` prop above, not this internal suspension.
  const [pickerSuspended, setPickerSuspended] = useState(false);
  const pendingPickerRef = useRef<null | (() => Promise<void>)>(null);

  const runWithSheetHidden = (action: () => Promise<void>) => {
    // Android needs the Modal fully dismissed before launching a native picker,
    // or it crashes with "unregistered ActivityResultLauncher". iOS has no such
    // problem, and dismissing first there introduces a "no view controller to
    // present from" race that makes the picker silently fail to open (the sheet
    // just closes). So only do the close-then-launch dance on Android; launch
    // directly from the open sheet on iOS (the original, working behavior).
    if (Platform.OS !== 'android') {
      action().catch((err) => captureException(err, { stage: 'capture-picker-launch' }));
      return;
    }
    pendingPickerRef.current = action;
    setPickerSuspended(true);
  };

  const handleSheetClosed = () => {
    const action = pendingPickerRef.current;
    pendingPickerRef.current = null;
    if (!action) return; // a real close, not a picker suspension
    (async () => {
      try {
        await action();
      } catch (err) {
        captureException(err, { stage: 'capture-picker-launch' });
      } finally {
        setPickerSuspended(false); // re-present the sheet with state intact
      }
    })();
  };

  const addMedia = (assets: ImagePicker.ImagePickerAsset[]) => {
    const newItems: MediaItem[] = [];
    for (const asset of assets) {
      const isVideo = asset.type === 'video';
      const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
      const maxMB = maxSize / (1024 * 1024);
      if (asset.fileSize && asset.fileSize > maxSize) {
        const fileMB = (asset.fileSize / (1024 * 1024)).toFixed(1);
        captureMessage('Evidence media rejected: over size limit', {
          surface: 'capture', type: asset.type, fileSize: asset.fileSize, limit: maxSize,
        });
        Alert.alert('File too large', `${asset.fileName || (isVideo ? 'Video' : 'Photo')} is ${fileMB}MB. Maximum for ${isVideo ? 'videos' : 'images'} is ${maxMB}MB.`);
        continue;
      }
      newItems.push({
        uri: asset.uri,
        type: isVideo ? 'video' : 'image',
        name: asset.fileName || (isVideo ? 'Video' : 'Photo'),
        fileSize: asset.fileSize,
      });
    }
    if (newItems.length > 0) {
      setMedia((prev) => [...prev, ...newItems]);
    }
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  // Gate over-long videos BEFORE the expensive transcode, then compress
  // (images + video) with progress, then attach. Shared by camera + library.
  const processAndAdd = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const allowed = assets.filter((a) => {
      if (a.type === 'video' && a.duration && a.duration > MAX_VIDEO_DURATION_MS) {
        const mins = (a.duration / 60000).toFixed(1);
        const maxMins = MAX_VIDEO_DURATION_MS / 60000;
        captureMessage('Evidence video rejected: over duration limit', {
          surface: 'capture', durationMs: a.duration, fileSize: a.fileSize, limitMs: MAX_VIDEO_DURATION_MS,
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
      // Cap so a parent who taps "select all" in Photos can't queue 200
      // uploads at once. Practical evidence/moment ceiling.
      selectionLimit: 10,
    });
    if (!result.canceled && result.assets.length > 0) {
      await processAndAdd(result.assets);
    }
  };

  // Scan pages with the OS document scanner (auto edge-detect, de-skew,
  // brighten/de-shadow) and attach as a single multi-page PDF.
  const scanDocument = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Scan documents', 'Document scanning works in the mobile app — try it on iOS or Android.');
      return;
    }
    try {
      const doc = await scanDocumentToPdf();
      if (!doc) return; // user cancelled / no pages
      // size is backfilled by signedUpload's native pre-flight if omitted.
      setMedia((prev) => [...prev, { uri: doc.uri, type: 'document', name: doc.name, pageCount: doc.pageCount }]);
    } catch (err: any) {
      // Report the real native failure. Previously this catch only showed an
      // Alert, so device-side scanner failures (e.g. build 19 "Could not start
      // document scanner") reached Sentry as a vague user bug report with no
      // stack — we had no idea WHY the ML Kit scanner rejected. Capture it.
      captureException(err, { stage: 'capture-document-scan' });
      Alert.alert('Scan unavailable', err?.message || 'Could not start the document scanner. Please try again, or add the photo from Files.');
    }
  };

  const createMoment = async (studentId?: string) => {
    const body: Record<string, any> = {
      description: description.trim() || 'Learning moment',
      source_type: studentId ? 'parent' : 'realtime',
    };
    if (title.trim()) body.title = title.trim();
    if (studentId) body.student_id = studentId;
    const { data } = await api.post('/api/learning-events/quick', body);
    return data.event?.id;
  };

  // Resolve which student IDs to save against: explicit prop > in-sheet picker > self.
  const effectiveStudentIds: string[] | undefined =
    (studentIds && studentIds.length > 0)
      ? studentIds
      : (pickStudents ? selectedStudentIds : undefined);

  const handleSave = async () => {
    if (!description.trim() && !title.trim() && media.length === 0 && !linkUrl.trim()) return;
    if (pickStudents && (!effectiveStudentIds || effectiveStudentIds.length === 0)) {
      Alert.alert('Pick a child', 'Select at least one child to capture this moment for.');
      return;
    }

    setSaving(true);
    // Snapshot what the background upload needs before reset() clears the sheet.
    const mediaSnapshot = media;
    const taskSnapshot = selectedTask;
    const newTaskSnapshot = pendingNewTask;
    const topicSnapshot = selectedTopic;
    const studentIdsSnapshot = effectiveStudentIds;
    const hasMedia = mediaSnapshot.length > 0;
    // A link is part of the SAME moment as its title/description — saved as one
    // link evidence block on the event (not a separate item).
    const linkSnapshot = linkUrl.trim();
    const extraBlocks = linkSnapshot
      ? [{ block_type: 'link', content: { url: linkSnapshot, title: linkSnapshot } }]
      : [];
    const hasAttachables = hasMedia || extraBlocks.length > 0;

    try {
      // Phase 1 (awaited, fast): create the moment(s) + any task link, and
      // collect upload jobs. Media upload is deferred to phase 2 so the user
      // isn't held on the capture screen while a video uploads — the reporter's
      // ask: "show immediately and continue to upload in the background."
      const jobs: Array<{ eventId: string; studentId?: string }> = [];
      if (studentIdsSnapshot && studentIdsSnapshot.length > 0) {
        for (const sid of studentIdsSnapshot) {
          const eventId = await createMoment(sid);
          if (eventId && hasAttachables) jobs.push({ eventId, studentId: sid });
        }
      } else {
        const eventId = await createMoment();
        if (eventId && hasAttachables) jobs.push({ eventId });
        if (eventId && taskSnapshot) {
          try {
            await attachMomentToTask(eventId, taskSnapshot.task.id);
          } catch {
            toast.info('Moment saved, but couldn\'t attach to the task. You can attach it from the journal.', { title: 'Heads up' });
          }
        } else if (eventId && newTaskSnapshot) {
          try {
            await api.post(`/api/learning-events/${eventId}/convert-to-task`, {
              quest_id: newTaskSnapshot.id,
            });
          } catch {
            toast.info('Moment saved, but couldn\'t add it as a new task. You can do that from the journal.', { title: 'Heads up' });
          }
        }
        if (eventId && topicSnapshot) {
          try {
            await assignMomentToTopic(eventId, 'track', topicSnapshot.id, 'add');
          } catch {
            toast.info('Moment saved, but couldn\'t attach to the topic. You can attach it from the journal.', { title: 'Heads up' });
          }
        }
      }

      // Moment(s) exist — free the UI immediately and refresh so the moment
      // appears now (its media fills in when the background upload completes).
      haptic.success();
      const childCount = studentIdsSnapshot?.length ?? 0;
      toast.success(
        hasMedia
          ? 'Your media is uploading in the background.'
          : (childCount > 1 ? `Moment captured for ${childCount} kids` : 'Moment captured'),
        { title: hasMedia ? 'Moment saved' : 'Saved to the journal' },
      );
      reset();
      onClose();
      onCaptured?.();

      // Phase 2 (background, DURABLE): hand each moment's media to the persistent
      // upload queue. It copies the files to persistent storage and retries on
      // app start / foreground, so a video can't be lost if the app is killed or
      // the network blips mid-upload (the video-attach reliability fix). The
      // queue notifies registered screens to refetch when an upload completes.
      for (const job of jobs) {
        void enqueueUpload({
          eventId: job.eventId,
          studentId: job.studentId,
          items: mediaSnapshot,
          extraBlocks,
        });
      }
    } catch (err: any) {
      // Moment creation failed — keep the sheet open so the user can retry.
      haptic.error();
      const msg = err.response?.data?.error?.message || err.response?.data?.error || 'Failed to save';
      toast.error(msg, { title: 'Could not save moment' });
    } finally {
      setSaving(false);
    }
  };

  const hasContent = description.trim().length > 0 || title.trim().length > 0 || media.length > 0 || linkUrl.trim().length > 0;
  const hasStudentSelection = !pickStudents || selectedStudentIds.length > 0;
  const canSave = hasContent && hasStudentSelection;

  return (
    <BottomSheet visible={visible && !pickerSuspended} onClose={handleClose} onClosed={handleSheetClosed}>
      <VStack space="md">
            {/* Header */}
            <HStack className="items-center justify-between">
              <VStack className="flex-1 min-w-0">
                <Heading size="lg">Capture a Moment</Heading>
                {questContext && (
                  <HStack className="items-center gap-1.5 mt-0.5">
                    <Ionicons name="rocket" size={12} color="#6D469B" />
                    <UIText size="xs" className="text-optio-purple font-poppins-medium" numberOfLines={1}>
                      For: {questContext.questTitle}
                    </UIText>
                  </HStack>
                )}
              </VStack>
              <Pressable
                onPress={handleClose}
                className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={c.icon} />
              </Pressable>
            </HStack>

            {/* Parent kid multi-select — defaults to none selected. Parent
                picks per-kid; "All kids" chip is a shortcut for "applies to
                everyone." Multi-kid families: each picked kid gets the same
                moment posted to their journal. */}
            {pickStudents && eligibleChildren.length > 0 && (
              <VStack space="xs">
                <HStack className="items-center justify-between">
                  <UIText size="xs" style={{ color: c.textMuted, fontFamily: 'Poppins_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Capture for
                  </UIText>
                  {selectedStudentIds.length > 0 && (
                    <UIText size="xs" style={{ color: '#6D469B', fontFamily: 'Poppins_500Medium' }}>
                      {selectedStudentIds.length} {selectedStudentIds.length === 1 ? 'kid' : 'kids'}
                    </UIText>
                  )}
                </HStack>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {eligibleChildren.length > 1 && (
                    <Pressable
                      testID="capture-select-all-kids"
                      onPress={toggleAllKids}
                      accessibilityLabel={allKidsSelected ? 'Clear all kids' : 'Select all kids'}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: allKidsSelected ? '#1F1F2E' : c.card,
                        borderWidth: 1,
                        borderColor: allKidsSelected ? '#1F1F2E' : '#6D469B',
                      }}
                    >
                      <Ionicons
                        name={allKidsSelected ? 'checkmark-done' : 'people-outline'}
                        size={14}
                        color={allKidsSelected ? '#FFFFFF' : '#6D469B'}
                      />
                      <UIText size="sm" style={{ color: allKidsSelected ? '#FFFFFF' : '#6D469B', fontFamily: 'Poppins_600SemiBold' }}>
                        {allKidsSelected ? 'Clear' : 'All kids'}
                      </UIText>
                    </Pressable>
                  )}
                  {eligibleChildren.map((child: any) => {
                    const active = selectedStudentIds.includes(child.id);
                    const initials = `${child.first_name?.[0] || ''}${child.last_name?.[0] || ''}`.toUpperCase()
                      || (child.display_name?.[0] || '?').toUpperCase();
                    return (
                      <Pressable
                        key={child.id}
                        onPress={() => toggleStudent(child.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          backgroundColor: active ? '#6D469B' : c.surfaceMuted,
                          borderWidth: active ? 0 : 1,
                          borderColor: c.border,
                        }}
                      >
                        <Avatar size="xs">
                          {child.avatar_url ? (
                            <AvatarImage source={{ uri: child.avatar_url }} />
                          ) : (
                            <AvatarFallbackText>{initials}</AvatarFallbackText>
                          )}
                        </Avatar>
                        <UIText size="sm" style={{ color: active ? '#FFFFFF' : c.text, fontFamily: active ? 'Poppins_600SemiBold' : 'Poppins_500Medium' }}>
                          {child.first_name || child.display_name || 'Student'}
                        </UIText>
                        {active && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </VStack>
            )}

            {pickStudents && eligibleChildren.length === 0 && (
              <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12 }}>
                <UIText size="sm" style={{ color: '#92400E', fontFamily: 'Poppins_500Medium' }}>
                  Link a child first before capturing a moment for them. You can add a child from the Family tab.
                </UIText>
              </View>
            )}

            {/* Optional title — gives the moment (and any task it's promoted to)
                a real name instead of defaulting to "Learning moment"
                (bug #13/#14). */}
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title (optional)"
              placeholderTextColor={c.textFaint}
              maxLength={120}
              className="bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-4 text-base font-poppins-semibold text-typo dark:text-dark-typo"
            />

            {/* Text input */}
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What did you learn?"
              placeholderTextColor={c.textFaint}
              multiline
              numberOfLines={3}
              className="bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-4 text-base font-poppins text-typo dark:text-dark-typo min-h-[80px]"
              style={{ textAlignVertical: 'top' }}
            />

            {/* Optional link — saved as a single link evidence block on THIS
                moment (with its title/description), not a separate item. */}
            <View className="flex-row items-center gap-2 bg-surface-50 dark:bg-dark-surface-50 rounded-xl px-3">
              <Ionicons name="link-outline" size={16} color="#6D469B" />
              <TextInput
                value={linkUrl}
                onChangeText={setLinkUrl}
                placeholder="Add a link (optional)"
                placeholderTextColor={c.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                className="flex-1 py-3 text-base font-poppins text-typo dark:text-dark-typo"
              />
            </View>

            {/* Media previews — real thumbnails / audio playback chips */}
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
                          <View
                            style={{
                              width: 96, height: 96, borderRadius: 12,
                              backgroundColor: '#6D469B',
                              alignItems: 'center', justifyContent: 'center', padding: 6,
                            }}
                          >
                            <Ionicons name="document-text" size={32} color="#FFFFFF" />
                            <UIText size="xs" className="text-white font-poppins-medium mt-1">
                              PDF{item.pageCount ? ` · ${item.pageCount}p` : ''}
                            </UIText>
                          </View>
                        ) : (
                          <View
                            style={{
                              width: 96, height: 96, borderRadius: 12,
                              backgroundColor: '#1F1F2E',
                              alignItems: 'center', justifyContent: 'center',
                            }}
                          >
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


            {/* Voice recorder — appears between previews and the attach button row when active. */}
            {recording && (
              <VoiceRecorder
                active={recording}
                onCancel={() => setRecording(false)}
                onRecorded={(clip) => {
                  if (clip.fileSize > MAX_AUDIO_SIZE) {
                    const mb = (clip.fileSize / (1024 * 1024)).toFixed(1);
                    Alert.alert('Recording too long', `That clip is ${mb}MB. Voice notes are limited to ${MAX_AUDIO_SIZE / (1024 * 1024)}MB — try a shorter recording.`);
                  } else {
                    setMedia((prev) => [
                      ...prev,
                      {
                        uri: clip.uri,
                        type: 'audio',
                        name: clip.name,
                        fileSize: clip.fileSize,
                        durationMs: clip.durationMs,
                      },
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
                    Alert.alert(
                      'Voice notes',
                      'Voice recording works in the mobile app — try it on iOS or Android.',
                    );
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

            {/* Attach to quest — inline (no extra drawer). Tapping the header
                expands a list of the (student's | selected kid's) active
                quests; each quest expands to show its pending tasks plus an
                "Add as new task" tile.
                Available when:
                  - Student capture for themselves (no pickStudents, no studentIds)
                  - Parent capture with exactly one kid selected (so the picker
                    has a single, unambiguous student scope). Multi-kid attach
                    is intentionally not supported — a single moment can only
                    attach to one student's task. */}
            {((!pickStudents && (!studentIds || studentIds.length === 0))
              || (pickStudents && selectedStudentIds.length === 1)) && (
              <VStack space="xs">
                <Pressable
                  onPress={() => setAttachOpen((v) => !v)}
                  className="flex-row items-center justify-between gap-2 py-3 px-3 rounded-xl border border-dashed border-surface-300 dark:border-dark-surface-300 active:bg-surface-50"
                  style={{ minHeight: 44 }}
                >
                  <HStack className="items-center gap-2 flex-1 min-w-0">
                    <Ionicons name="rocket-outline" size={16} color="#6D469B" />
                    {selectedTask ? (
                      <VStack className="flex-1 min-w-0">
                        <UIText size="xs" className="text-optio-purple font-poppins-semibold uppercase tracking-wider">
                          Attaching to
                        </UIText>
                        <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
                          {selectedTask.task.title}
                        </UIText>
                      </VStack>
                    ) : pendingNewTask ? (
                      <VStack className="flex-1 min-w-0">
                        <UIText size="xs" className="text-optio-purple font-poppins-semibold uppercase tracking-wider">
                          New task in
                        </UIText>
                        <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
                          {pendingNewTask.title}
                        </UIText>
                      </VStack>
                    ) : (
                      <UIText size="sm" className="text-optio-purple font-poppins-medium">
                        {questContext ? 'Attach to a task in this quest' : 'Attach to a quest task'}
                      </UIText>
                    )}
                  </HStack>
                  {(selectedTask || pendingNewTask) && (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation?.();
                        setSelectedTask(null);
                        setPendingNewTask(null);
                      }}
                      hitSlop={8}
                      className="w-7 h-7 rounded-full bg-white dark:bg-dark-surface-100 items-center justify-center"
                    >
                      <Ionicons name="close" size={14} color={c.icon} />
                    </Pressable>
                  )}
                  <Ionicons name={attachOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.iconMuted} />
                </Pressable>

                <InlineQuestTaskPicker
                  visible={attachOpen}
                  questIdFilter={questContext?.questId}
                  studentId={pickStudents ? selectedStudentIds[0] : undefined}
                  selectedTaskId={selectedTask?.task.id || null}
                  selectedNewTaskQuestId={pendingNewTask?.id || null}
                  onPickTask={(task, quest) => {
                    setSelectedTask({ task, questTitle: quest.title });
                    setPendingNewTask(null);
                  }}
                  onPickNewTask={(quest) => {
                    setPendingNewTask(quest);
                    setSelectedTask(null);
                  }}
                />
              </VStack>
            )}

            {/* Attach to a journal topic — self-capture only (parent flows
                attach via the kid's journal). Lists the student's journal
                topics; tagging a moment to one files it under that topic. */}
            {!pickStudents && (!studentIds || studentIds.length === 0) && (
              <VStack space="xs">
                <Pressable
                  onPress={() => setTopicOpen((v) => !v)}
                  className="flex-row items-center justify-between gap-2 py-3 px-3 rounded-xl border border-dashed border-surface-300 dark:border-dark-surface-300 active:bg-surface-50"
                  style={{ minHeight: 44 }}
                >
                  <HStack className="items-center gap-2 flex-1 min-w-0">
                    <Ionicons name="book-outline" size={16} color="#6D469B" />
                    {selectedTopic ? (
                      <VStack className="flex-1 min-w-0">
                        <UIText size="xs" className="text-optio-purple font-poppins-semibold uppercase tracking-wider">
                          Attaching to topic
                        </UIText>
                        <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
                          {selectedTopic.name}
                        </UIText>
                      </VStack>
                    ) : (
                      <UIText size="sm" className="text-optio-purple font-poppins-medium">
                        Attach to a journal topic
                      </UIText>
                    )}
                  </HStack>
                  {selectedTopic && (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation?.();
                        setSelectedTopic(null);
                      }}
                      hitSlop={8}
                      className="w-7 h-7 rounded-full bg-white dark:bg-dark-surface-100 items-center justify-center"
                    >
                      <Ionicons name="close" size={14} color={c.icon} />
                    </Pressable>
                  )}
                  <Ionicons name={topicOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.iconMuted} />
                </Pressable>

                <InlineTopicPicker
                  visible={topicOpen}
                  selectedTopicId={selectedTopic?.id || null}
                  onPickTopic={(topic) => {
                    setSelectedTopic(topic);
                    setTopicOpen(false);
                  }}
                />
              </VStack>
            )}

            {/* Save button */}
            <Button
              size="lg"
              onPress={handleSave}
              disabled={!canSave || saving}
              loading={saving}
              className="w-full"
            >
              <ButtonText>{saving ? 'Saving...' : 'Save Moment'}</ButtonText>
            </Button>
          </VStack>

    </BottomSheet>
  );
}
