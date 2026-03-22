/**
 * CaptureModal - Web-optimized centered modal for capturing learning moments.
 * Clean dialog with text input, file attachment, and save.
 */

import React, { useState, useRef } from 'react';
import { View, Modal, Pressable, TextInput, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, PillarBadge,
} from '../ui';
import { pillarKeys, getPillar } from '@/src/config/pillars';

interface CaptureModalProps {
  visible: boolean;
  onClose: () => void;
  onCaptured?: () => void;
}

export function CaptureModal({ visible, onClose, onCaptured }: CaptureModalProps) {
  const [description, setDescription] = useState('');
  const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setDescription('');
    setSelectedPillars([]);
    setFile(null);
    setFilePreview(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const togglePillar = (key: string) => {
    setSelectedPillars((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);

    if (selected.type.startsWith('image/')) {
      const url = URL.createObjectURL(selected);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
  };

  const handleSave = async () => {
    if (!description.trim() && !file) return;

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('description', description.trim() || 'Learning moment');
      formData.append('source_type', 'realtime');

      if (selectedPillars.length > 0) {
        formData.append('pillars', JSON.stringify(selectedPillars));
      }

      if (file) {
        formData.append('file', file);
      }

      await api.post('/api/learning-events/quick', formData);

      reset();
      onClose();
      onCaptured?.();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.response?.data?.error || 'Failed to save';
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const canSave = description.trim().length > 0 || !!file;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <Pressable
        onPress={handleClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}
      >
        {/* Dialog */}
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#fff',
            borderRadius: 20,
            width: '100%',
            maxWidth: 520,
            padding: 28,
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
          }}
        >
          <VStack space="md">
            {/* Header */}
            <HStack className="items-center justify-between">
              <Heading size="lg">Capture a Moment</Heading>
              <Pressable
                onPress={handleClose}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
              >
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
              numberOfLines={4}
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 12,
                padding: 16,
                fontSize: 16,
                fontFamily: 'Poppins_400Regular',
                color: '#1F2937',
                minHeight: 100,
                textAlignVertical: 'top',
              }}
              autoFocus
            />

            {/* File preview */}
            {file && (
              <HStack className="items-center gap-3" style={{ backgroundColor: '#F5F0FF', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E8DFFB' }}>
                {filePreview ? (
                  <Image
                    source={{ uri: filePreview }}
                    style={{ width: 48, height: 48, borderRadius: 8 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: '#6D469B20', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons
                      name={file.type?.startsWith('video/') ? 'videocam' : 'document-attach'}
                      size={22}
                      color="#6D469B"
                    />
                  </View>
                )}
                <VStack className="flex-1 min-w-0">
                  <UIText size="sm" className="font-poppins-medium text-optio-purple" numberOfLines={1}>
                    {file.name}
                  </UIText>
                  <UIText size="xs" className="text-typo-400">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </UIText>
                </VStack>
                <Pressable onPress={() => { setFile(null); setFilePreview(null); }}>
                  <Ionicons name="close-circle" size={22} color="#9CA3AF" />
                </Pressable>
              </HStack>
            )}

            {/* Attach button */}
            <Pressable
              onPress={() => fileInputRef.current?.click()}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 14,
                backgroundColor: '#F9FAFB',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderStyle: 'dashed',
                alignSelf: 'flex-start',
              }}
            >
              <Ionicons name="attach-outline" size={20} color="#6D469B" />
              <UIText size="sm" className="text-optio-purple font-poppins-medium">
                {file ? 'Replace file' : 'Attach photo, video, or file'}
              </UIText>
            </Pressable>

            {/* Hidden file input */}
            <input
              ref={fileInputRef as any}
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx"
              onChange={handleFileSelect as any}
              style={{ display: 'none' }}
            />

            {/* Pillar selection */}
            <VStack space="xs">
              <UIText size="xs" className="text-typo-400 font-poppins-medium">
                Pillars (optional)
              </UIText>
              <HStack className="flex-wrap gap-2">
                {pillarKeys.map((key) => {
                  const pc = getPillar(key);
                  const selected = selectedPillars.includes(key);
                  return (
                    <Pressable
                      key={key}
                      onPress={() => togglePillar(key)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 20,
                        borderWidth: 1.5,
                        borderColor: selected ? pc.color : '#E5E7EB',
                        backgroundColor: selected ? pc.color + '15' : '#fff',
                      }}
                    >
                      <Ionicons
                        name={selected ? pc.iconFilled : pc.icon}
                        size={14}
                        color={selected ? pc.color : '#9CA3AF'}
                      />
                      <UIText
                        size="xs"
                        className="font-poppins-medium"
                        style={{ color: selected ? pc.color : '#6B7280' }}
                      >
                        {pc.label}
                      </UIText>
                    </Pressable>
                  );
                })}
              </HStack>
            </VStack>

            {/* Save button */}
            <Button
              size="lg"
              onPress={handleSave}
              disabled={!canSave || saving}
              loading={saving}
            >
              <ButtonText>Save Moment</ButtonText>
            </Button>
          </VStack>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
