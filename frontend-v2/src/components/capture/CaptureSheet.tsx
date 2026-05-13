/**
 * CaptureSheet - Bottom sheet for quick learning moment capture (mobile).
 *
 * Minimal friction: description + multiple media attachments.
 * Creates moment via JSON, then uploads files individually.
 */

import React, { useState, useEffect } from 'react';
import { View, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '@/src/services/api';
import { uploadViaSignedUrl } from '@/src/services/signedUpload';
import { useMyChildren } from '@/src/hooks/useParent';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, BottomSheet, PillarBadge,
  Avatar, AvatarFallbackText, AvatarImage,
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
  /** When set, captures moment for specific student(s) (parent flow with pre-selected kids) */
  studentIds?: string[];
  /** When true, fetches the parent's children and renders a multi-select kid picker
   *  at the top of the sheet. Used by the parent center-capture tab. */
  pickStudents?: boolean;
}

export function CaptureSheet({ visible, onClose, onCaptured, studentIds, pickStudents = false }: CaptureSheetProps) {
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{ task: AttachableTask; questTitle: string } | null>(null);

  // Parent flow: fetch children when pickStudents is on. The hook short-circuits
  // gracefully for non-parent users (empty list, no error toast).
  const { children: parentChildren } = useMyChildren();
  const eligibleChildren = pickStudents ? parentChildren : [];
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Default to all kids selected when the sheet first opens with a non-empty list.
  // Reset whenever the sheet closes so a fresh open starts clean.
  useEffect(() => {
    if (!visible) return;
    if (pickStudents && eligibleChildren.length > 0 && selectedStudentIds.length === 0) {
      setSelectedStudentIds(eligibleChildren.map((c: any) => c.id));
    }
  }, [visible, pickStudents, eligibleChildren, selectedStudentIds.length]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const reset = () => {
    setDescription('');
    setMedia([]);
    setSelectedTask(null);
    setSelectedStudentIds([]);
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

  // Resolve which student IDs to save against: explicit prop > in-sheet picker > self.
  const effectiveStudentIds: string[] | undefined =
    (studentIds && studentIds.length > 0)
      ? studentIds
      : (pickStudents ? selectedStudentIds : undefined);

  const handleSave = async () => {
    if (!description.trim() && media.length === 0) return;
    if (pickStudents && (!effectiveStudentIds || effectiveStudentIds.length === 0)) {
      Alert.alert('Pick a child', 'Select at least one child to capture this moment for.');
      return;
    }

    setSaving(true);
    try {
      if (effectiveStudentIds && effectiveStudentIds.length > 0) {
        for (const sid of effectiveStudentIds) {
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

  const hasContent = description.trim().length > 0 || media.length > 0;
  const hasStudentSelection = !pickStudents || selectedStudentIds.length > 0;
  const canSave = hasContent && hasStudentSelection;

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

            {/* Parent kid multi-select */}
            {pickStudents && eligibleChildren.length > 0 && (
              <VStack space="xs">
                <UIText size="xs" style={{ color: '#6B7280', fontFamily: 'Poppins_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Capture for
                </UIText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
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
                          backgroundColor: active ? '#6D469B' : '#F3F4F6',
                          borderWidth: active ? 0 : 1,
                          borderColor: '#E2DCE8',
                        }}
                      >
                        <Avatar size="xs">
                          {child.avatar_url ? (
                            <AvatarImage source={{ uri: child.avatar_url }} />
                          ) : (
                            <AvatarFallbackText>{initials}</AvatarFallbackText>
                          )}
                        </Avatar>
                        <UIText size="sm" style={{ color: active ? '#FFFFFF' : '#374151', fontFamily: active ? 'Poppins_600SemiBold' : 'Poppins_500Medium' }}>
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
            {!pickStudents && (!studentIds || studentIds.length === 0) ? (
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
