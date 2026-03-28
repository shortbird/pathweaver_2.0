/**
 * CaptureModal - Web-optimized centered modal for capturing learning moments.
 *
 * Minimal friction: description + multiple file attachments + optional pillars.
 * Creates moment via JSON, then uploads files individually.
 */

import React, { useState, useRef } from 'react';
import { View, Modal, Pressable, TextInput, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText,
} from '../ui';
import { pillarKeys, getPillar } from '@/src/config/pillars';

interface FileItem {
  file: File;
  preview: string | null;
}

interface CaptureModalProps {
  visible: boolean;
  onClose: () => void;
  onCaptured?: () => void;
}

export function CaptureModal({ visible, onClose, onCaptured }: CaptureModalProps) {
  const [description, setDescription] = useState('');
  const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setDescription('');
    setSelectedPillars([]);
    // Revoke object URLs to prevent memory leaks
    files.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setFiles([]);
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

  const handleFileSelect = () => {
    const input = fileInputRef.current as HTMLInputElement | null;
    const selected = input?.files;
    if (!selected || selected.length === 0) return;

    // Clone File objects before resetting the input — some browsers
    // invalidate File references when input.value is cleared.
    const clonedFiles: File[] = Array.from(selected).map((f) =>
      new File([f], f.name, { type: f.type, lastModified: f.lastModified })
    );

    const newItems: FileItem[] = clonedFiles.map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));
    setFiles((prev) => [...prev, ...newItems]);

    // Reset input so the same file can be re-selected
    if (input) input.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const item = prev[index];
      if (item.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSave = async () => {
    if (!description.trim() && files.length === 0) return;

    setSaving(true);
    try {
      // Step 1: Create moment via JSON
      const body: Record<string, any> = {
        description: description.trim() || 'Learning moment',
        source_type: 'realtime',
      };

      const { data } = await api.post('/api/learning-events/quick', body);
      const eventId = data.event?.id;

      if (eventId) {
        // Step 2: Upload files via shared /api/uploads/evidence endpoint
        if (files.length > 0) {
          const fd = new FormData();
          files.forEach((item) => fd.append('files', item.file));
          const uploadRes = await api.post('/api/uploads/evidence', fd);
          const uploadedFiles = uploadRes.data?.files || [];

          // Step 3: Save uploaded files as evidence blocks on the event
          if (uploadedFiles.length > 0) {
            const blocks = uploadedFiles.map((f: any, i: number) => {
              const blockType = f.content_type?.startsWith('video/') ? 'video' :
                                f.content_type?.startsWith('image/') ? 'image' : 'document';
              return {
                block_type: blockType,
                content: {},
                file_url: f.url,
                file_name: f.original_name || f.stored_name,
                order_index: i,
              };
            });
            await api.post(`/api/learning-events/${eventId}/evidence`, { blocks });
          }
        }

        // Step 4: Update with pillars if selected
        if (selectedPillars.length > 0) {
          await api.put(`/api/learning-events/${eventId}`, { pillars: selectedPillars });
        }
      }

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

  const canSave = description.trim().length > 0 || files.length > 0;

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

            {/* File previews */}
            {files.length > 0 && (
              <VStack space="xs">
                {files.map((item, index) => (
                  <HStack
                    key={index}
                    className="items-center gap-3"
                    style={{ backgroundColor: '#F5F0FF', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E8DFFB' }}
                  >
                    {item.preview ? (
                      <Image
                        source={{ uri: item.preview }}
                        style={{ width: 40, height: 40, borderRadius: 8 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#6D469B20', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons
                          name={item.file.type?.startsWith('video/') ? 'videocam' : 'document-attach'}
                          size={18}
                          color="#6D469B"
                        />
                      </View>
                    )}
                    <VStack className="flex-1 min-w-0">
                      <UIText size="sm" className="font-poppins-medium text-optio-purple" numberOfLines={1}>
                        {item.file.name}
                      </UIText>
                      <UIText size="xs" className="text-typo-400">
                        {(item.file.size / 1024 / 1024).toFixed(1)} MB
                      </UIText>
                    </VStack>
                    <Pressable onPress={() => removeFile(index)}>
                      <Ionicons name="close-circle" size={22} color="#9CA3AF" />
                    </Pressable>
                  </HStack>
                ))}
              </VStack>
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
                {files.length > 0 ? 'Add more files' : 'Attach photos, videos, or files'}
              </UIText>
            </Pressable>

            {/* Hidden file input (multiple) */}
            <input
              ref={fileInputRef as any}
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            {/* Pillar selection (optional) */}
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
              <ButtonText>{saving ? 'Saving...' : 'Save Moment'}</ButtonText>
            </Button>
          </VStack>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
