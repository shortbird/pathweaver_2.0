/**
 * CaptureSheet - Bottom sheet for quick learning moment capture.
 *
 * Backdrop appears instantly, sheet slides up.
 * Options: text, camera, voice, file. At least one required to save.
 */

import React, { useState } from 'react';
import { View, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '@/src/services/api';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText,
} from '../ui';

interface CaptureSheetProps {
  visible: boolean;
  onClose: () => void;
  onCaptured?: () => void;
}

export function CaptureSheet({ visible, onClose, onCaptured }: CaptureSheetProps) {
  const [description, setDescription] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'file' | null>(null);
  const [mediaName, setMediaName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDescription('');
    setMediaUri(null);
    setMediaType(null);
    setMediaName(null);
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
      setMediaUri(asset.uri);
      setMediaType(asset.type === 'video' ? 'video' : 'image');
      setMediaName(asset.fileName || (asset.type === 'video' ? 'Video' : 'Photo'));
    }
  };

  const pickFile = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setMediaUri(asset.uri);
      setMediaType(asset.type === 'video' ? 'video' : 'image');
      setMediaName(asset.fileName || (asset.type === 'video' ? 'Video' : 'Photo'));
    }
  };

  const handleSave = async () => {
    if (!description.trim() && !mediaUri) return;

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('description', description.trim() || 'Learning moment');
      formData.append('source_type', 'realtime');

      if (mediaUri && mediaType) {
        const filename = mediaUri.split('/').pop() || `capture.${mediaType === 'image' ? 'jpg' : 'mp4'}`;
        const mimeType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
        formData.append('file', {
          uri: mediaUri,
          name: filename,
          type: mimeType,
        } as any);
      }

      await api.post('/api/learning-events/quick', formData);

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

  const canSave = description.trim().length > 0 || !!mediaUri;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        className="flex-1 justify-end"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Backdrop - tap to close */}
        <Pressable
          className="flex-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={handleClose}
        />

        {/* Sheet */}
        <View
          style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}
        >
            {/* Handle */}
            <View className="w-10 h-1 bg-surface-300 rounded-full self-center mb-4" />

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

              {/* Media preview */}
              {mediaUri && (
                <HStack className="items-center gap-3 bg-optio-purple/5 p-3 rounded-xl border border-optio-purple/20">
                  <Ionicons
                    name={mediaType === 'video' ? 'videocam' : mediaType === 'file' ? 'document-attach' : 'image'}
                    size={20}
                    color="#6D469B"
                  />
                  <UIText size="sm" className="text-optio-purple flex-1 font-poppins-medium" numberOfLines={1}>
                    {mediaName || 'File attached'}
                  </UIText>
                  <Pressable onPress={() => { setMediaUri(null); setMediaType(null); setMediaName(null); }}>
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
                  className="flex-1 items-center py-3.5 bg-surface-50 rounded-xl active:bg-surface-100 opacity-40"
                >
                  <Ionicons name="mic-outline" size={26} color="#6D469B" />
                  <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">Voice</UIText>
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
                <ButtonText>Save Moment</ButtonText>
              </Button>
            </VStack>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
