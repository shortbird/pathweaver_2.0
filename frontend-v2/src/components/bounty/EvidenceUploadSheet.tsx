/**
 * EvidenceUploadSheet - Bottom sheet for uploading evidence to a bounty deliverable.
 *
 * Adapts the CaptureSheet pattern: camera, file, description.
 * On save, uploads file to /api/uploads/evidence, then calls onSubmit with evidence data.
 */

import React, { useState } from 'react';
import { Pressable, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { uploadViaSignedUrl } from '@/src/services/signedUpload';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, BottomSheet,
} from '../ui';

// File size limits (must match backend constants).
// Videos use the signed-upload cap (500MB) because uploads go direct to
// Supabase — the backend never buffers the payload.
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB (signed-upload)

interface EvidenceUploadSheetProps {
  visible: boolean;
  deliverableText: string;
  onClose: () => void;
  onSubmit: (evidence: any[]) => Promise<void>;
}

export function EvidenceUploadSheet({ visible, deliverableText, onClose, onSubmit }: EvidenceUploadSheetProps) {
  const [description, setDescription] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [mediaName, setMediaName] = useState<string | null>(null);
  const [mediaSize, setMediaSize] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDescription('');
    setMediaUri(null);
    setMediaType(null);
    setMediaName(null);
    setMediaSize(null);
  };

  const handleClose = () => {
    reset();
    onClose();
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
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
      if (asset.fileSize && asset.fileSize > maxSize) {
        const maxMB = maxSize / (1024 * 1024);
        const fileMB = (asset.fileSize / (1024 * 1024)).toFixed(1);
        Alert.alert('File too large', `${isVideo ? 'Videos' : 'Images'} must be under ${maxMB}MB. This file is ${fileMB}MB.`);
        return;
      }
      setMediaUri(asset.uri);
      setMediaType(isVideo ? 'video' : 'image');
      setMediaName(asset.fileName || (isVideo ? 'Video' : 'Photo'));
      setMediaSize(asset.fileSize ?? null);
    }
  };

  const pickFile = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
      if (asset.fileSize && asset.fileSize > maxSize) {
        const maxMB = maxSize / (1024 * 1024);
        const fileMB = (asset.fileSize / (1024 * 1024)).toFixed(1);
        Alert.alert('File too large', `${isVideo ? 'Videos' : 'Images'} must be under ${maxMB}MB. This file is ${fileMB}MB.`);
        return;
      }
      setMediaUri(asset.uri);
      setMediaType(isVideo ? 'video' : 'image');
      setMediaName(asset.fileName || (isVideo ? 'Video' : 'Photo'));
      setMediaSize(asset.fileSize ?? null);
    }
  };

  const handleSave = async () => {
    if (!description.trim() && !mediaUri) return;

    setSaving(true);
    try {
      const evidenceItems: any[] = [];

      // Add text evidence if provided
      if (description.trim()) {
        evidenceItems.push({
          type: 'text',
          content: { text: description.trim() },
        });
      }

      // Upload file if provided — via signed-upload (direct-to-Supabase).
      if (mediaUri && mediaType) {
        const filename = mediaName || mediaUri.split('/').pop() || `evidence.${mediaType === 'image' ? 'jpg' : 'mp4'}`;
        const mimeType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
        try {
          const result = await uploadViaSignedUrl({
            file: {
              uri: mediaUri,
              name: filename,
              type: mimeType,
              size: mediaSize ?? 0,
            },
            initPath: '/api/uploads/sign',
            finalizePath: '/api/uploads/finalize',
            blockType: mediaType,
          });
          const uploadedUrl = (result.url || result.file_url) as string | undefined;
          if (uploadedUrl) {
            evidenceItems.push({
              type: mediaType === 'video' ? 'video' : 'image',
              content: {
                items: [{ url: uploadedUrl, caption: description.trim() || '', filename }],
              },
            });
          }
        } catch {
          // If upload fails, include as local reference (legacy fallback behavior).
          evidenceItems.push({
            type: mediaType === 'video' ? 'video' : 'image',
            content: {
              items: [{ url: mediaUri, caption: description.trim() || '', filename }],
            },
          });
        }
      }

      await onSubmit(evidenceItems);
      reset();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.response?.data?.error || 'Failed to upload evidence';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const canSave = description.trim().length > 0 || !!mediaUri;

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <VStack space="md">
            {/* Header */}
            <HStack className="items-center justify-between">
              <VStack className="flex-1 mr-3">
                <Heading size="lg">Upload Evidence</Heading>
                <UIText size="sm" className="text-typo-500" numberOfLines={2}>{deliverableText}</UIText>
              </VStack>
              <Pressable onPress={handleClose} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
                <Ionicons name="close" size={18} color="#6B7280" />
              </Pressable>
            </HStack>

            {/* Text input */}
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your evidence..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              className="bg-surface-50 rounded-xl p-4 text-base font-poppins text-typo min-h-[80px]"
              style={{ textAlignVertical: 'top' }}
            />

            {/* Media preview */}
            {mediaUri && (
              <HStack className="items-center gap-3 bg-optio-purple/5 p-3 rounded-xl border border-optio-purple/20">
                <Ionicons
                  name={mediaType === 'video' ? 'videocam' : 'image'}
                  size={20}
                  color="#6D469B"
                />
                <UIText size="sm" className="text-optio-purple flex-1 font-poppins-medium" numberOfLines={1}>
                  {mediaName || 'File attached'}
                </UIText>
                <Pressable onPress={() => { setMediaUri(null); setMediaType(null); setMediaName(null); setMediaSize(null); }}>
                  <Ionicons name="close-circle" size={22} color="#9CA3AF" />
                </Pressable>
              </HStack>
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
                onPress={pickFile}
                className="flex-1 items-center py-3.5 bg-surface-50 rounded-xl active:bg-surface-100"
              >
                <Ionicons name="attach-outline" size={26} color="#6D469B" />
                <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">File</UIText>
              </Pressable>
            </HStack>

            {/* Save button */}
            <Button
              size="lg"
              onPress={handleSave}
              disabled={!canSave || saving}
              loading={saving}
              className="w-full"
            >
              <ButtonText>Upload Evidence</ButtonText>
            </Button>
          </VStack>
    </BottomSheet>
  );
}
