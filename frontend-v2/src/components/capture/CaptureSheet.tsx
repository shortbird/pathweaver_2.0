/**
 * CaptureSheet - Bottom sheet for quick learning moment capture (mobile).
 *
 * Minimal friction: description + multiple media attachments.
 * Creates moment via JSON, then uploads files individually.
 */

import React, { useState } from 'react';
import { View, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '@/src/services/api';
import { uploadViaSignedUrl } from '@/src/services/signedUpload';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, BottomSheet, PillarBadge,
} from '../ui';
import {
  TaskPickerSheet, attachMomentToTask,
  type AttachableTask, type AttachableQuest,
} from '../journal/TaskPickerSheet';

// File size limits (must match backend constants).
// Signed-upload path: videos go direct-to-Supabase and can be up to 500MB.
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB (signed-upload)

interface MediaItem {
  uri: string;
  type: 'image' | 'video';
  name: string;
  fileSize?: number;
}

interface CaptureSheetProps {
  visible: boolean;
  onClose: () => void;
  onCaptured?: () => void;
  /** When set, captures moment for specific student(s) (parent flow) */
  studentIds?: string[];
}

export function CaptureSheet({ visible, onClose, onCaptured, studentIds }: CaptureSheetProps) {
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{ task: AttachableTask; questTitle: string } | null>(null);

  const reset = () => {
    setDescription('');
    setMedia([]);
    setSelectedTask(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const addMedia = (assets: ImagePicker.ImagePickerAsset[]) => {
    const newItems: MediaItem[] = [];
    for (const asset of assets) {
      const isVideo = asset.type === 'video';
      const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
      const maxMB = maxSize / (1024 * 1024);
      if (asset.fileSize && asset.fileSize > maxSize) {
        const fileMB = (asset.fileSize / (1024 * 1024)).toFixed(1);
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
      addMedia(result.assets);
    }
  };

  const pickFiles = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      addMedia(result.assets);
    }
  };

  const uploadAndAttach = async (eventId: string, items: MediaItem[], studentId?: string) => {
    // Upload each item direct-to-Supabase via signed-upload, then save as
    // evidence blocks on the event. Uploads in parallel.
    const initPath = studentId
      ? `/api/parent/children/${studentId}/learning-moments/${eventId}/upload-init`
      : `/api/learning-events/${eventId}/upload-init`;
    const finalizePath = studentId
      ? `/api/parent/children/${studentId}/learning-moments/${eventId}/upload-finalize`
      : `/api/learning-events/${eventId}/upload-finalize`;

    const uploadedFiles = (
      await Promise.all(
        items.map(async (item) => {
          const filename = item.name || item.uri.split('/').pop() || `capture.${item.type === 'image' ? 'jpg' : 'mp4'}`;
          const mimeType = item.type === 'video' ? 'video/mp4' : 'image/jpeg';
          try {
            const result = await uploadViaSignedUrl({
              file: { uri: item.uri, name: filename, type: mimeType, size: item.fileSize ?? 0 },
              initPath,
              finalizePath,
              blockType: item.type,
            });
            return {
              block_type: item.type,
              content: {},
              file_url: (result.file_url || result.url) as string,
              file_name: (result.filename || result.file_name || filename) as string,
            };
          } catch {
            return null;
          }
        }),
      )
    ).filter((x): x is { block_type: 'image' | 'video'; content: Record<string, never>; file_url: string; file_name: string } => Boolean(x));

    if (uploadedFiles.length > 0) {
      const blocks = uploadedFiles.map((f, i) => ({
        ...f,
        order_index: i,
      }));
      await api.post(`/api/learning-events/${eventId}/evidence`, { blocks });
    }
  };

  const createMoment = async (studentId?: string) => {
    const body: Record<string, any> = {
      description: description.trim() || 'Learning moment',
      source_type: studentId ? 'parent' : 'realtime',
    };
    if (studentId) body.student_id = studentId;
    const { data } = await api.post('/api/learning-events/quick', body);
    return data.event?.id;
  };

  const handleSave = async () => {
    if (!description.trim() && media.length === 0) return;

    setSaving(true);
    try {
      if (studentIds && studentIds.length > 0) {
        for (const sid of studentIds) {
          const eventId = await createMoment(sid);
          if (eventId && media.length > 0) {
            await uploadAndAttach(eventId, media, sid);
          }
        }
      } else {
        const eventId = await createMoment();
        if (eventId && media.length > 0) {
          await uploadAndAttach(eventId, media);
        }
        if (eventId && selectedTask) {
          try {
            await attachMomentToTask(eventId, selectedTask.task.id);
          } catch {
            // Non-fatal: moment saved, attach failed — surface softly
            Alert.alert('Heads up', 'Moment saved but could not attach to task. You can attach it from the journal.');
          }
        }
      }

      reset();
      onClose();
      onCaptured?.();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.response?.data?.error || 'Failed to save';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const canSave = description.trim().length > 0 || media.length > 0;

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <VStack space="md">
            {/* Header */}
            <HStack className="items-center justify-between">
              <Heading size="lg">Capture a Moment</Heading>
              <Pressable onPress={handleClose} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
                <Ionicons name="close" size={18} color="#6B7280" />
              </Pressable>
            </HStack>

            {/* Text input */}
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What did you learn?"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              className="bg-surface-50 rounded-xl p-4 text-base font-poppins text-typo min-h-[80px]"
              style={{ textAlignVertical: 'top' }}
            />

            {/* Media previews */}
            {media.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <HStack className="gap-2">
                  {media.map((item, index) => (
                    <View
                      key={index}
                      className="flex-row items-center gap-2 bg-optio-purple/5 px-3 py-2 rounded-xl border border-optio-purple/20"
                    >
                      <Ionicons
                        name={item.type === 'video' ? 'videocam' : 'image'}
                        size={16}
                        color="#6D469B"
                      />
                      <UIText size="xs" className="text-optio-purple font-poppins-medium" numberOfLines={1} style={{ maxWidth: 100 }}>
                        {item.name}
                      </UIText>
                      <Pressable onPress={() => removeMedia(index)}>
                        <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                      </Pressable>
                    </View>
                  ))}
                </HStack>
              </ScrollView>
            )}

            {/* Attach buttons */}
            <HStack className="gap-3">
              <Pressable
                onPress={openCamera}
                className="flex-1 items-center py-3.5 bg-surface-50 rounded-xl active:bg-surface-100"
              >
                <Ionicons name="camera-outline" size={26} color="#6D469B" />
                <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">Camera</UIText>
              </Pressable>
              <Pressable
                className="flex-1 items-center py-3.5 bg-surface-50 rounded-xl active:bg-surface-100 opacity-40"
              >
                <Ionicons name="mic-outline" size={26} color="#6D469B" />
                <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">Voice</UIText>
              </Pressable>
              <Pressable
                onPress={pickFiles}
                className="flex-1 items-center py-3.5 bg-surface-50 rounded-xl active:bg-surface-100"
              >
                <Ionicons name="images-outline" size={26} color="#6D469B" />
                <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">Files</UIText>
              </Pressable>
            </HStack>

            {/* Attach to task (student-only, not parent capture) */}
            {!studentIds || studentIds.length === 0 ? (
              selectedTask ? (
                <View className="bg-optio-purple/5 rounded-xl p-3 border border-optio-purple/20">
                  <HStack className="items-start justify-between gap-2">
                    <VStack className="flex-1 min-w-0">
                      <UIText size="xs" className="text-optio-purple font-poppins-semibold uppercase tracking-wider mb-1">
                        Attaching to
                      </UIText>
                      <UIText size="sm" className="font-poppins-medium" numberOfLines={2}>
                        {selectedTask.task.title}
                      </UIText>
                      <HStack className="items-center gap-2 mt-1">
                        <PillarBadge pillar={selectedTask.task.pillar} size="sm" />
                        <UIText size="xs" className="text-typo-500" numberOfLines={1}>
                          {selectedTask.questTitle}
                        </UIText>
                      </HStack>
                    </VStack>
                    <Pressable
                      onPress={() => setSelectedTask(null)}
                      className="w-7 h-7 rounded-full bg-white items-center justify-center"
                    >
                      <Ionicons name="close" size={14} color="#6B7280" />
                    </Pressable>
                  </HStack>
                </View>
              ) : (
                <Pressable
                  onPress={() => setPickerVisible(true)}
                  className="flex-row items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-surface-300 active:bg-surface-50"
                >
                  <Ionicons name="flag-outline" size={16} color="#6D469B" />
                  <UIText size="sm" className="text-optio-purple font-poppins-medium">
                    Attach to a quest task
                  </UIText>
                </Pressable>
              )
            ) : null}

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

          <TaskPickerSheet
            visible={pickerVisible}
            onClose={() => setPickerVisible(false)}
            onPicked={(task, quest) => {
              setSelectedTask({ task, questTitle: quest.title });
              setPickerVisible(false);
            }}
          />
    </BottomSheet>
  );
}
