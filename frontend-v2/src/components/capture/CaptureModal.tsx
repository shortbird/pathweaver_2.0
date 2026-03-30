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

// File size limits (must match backend constants)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024; // 25MB

interface FileItem {
  file: File;
  preview: string | null;
}

interface EvidenceBlock {
  type: 'text' | 'link';
  content: string;
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
  const [evidenceBlocks, setEvidenceBlocks] = useState<EvidenceBlock[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addEvidenceBlock = (type: 'text' | 'link') => {
    setEvidenceBlocks((prev) => [...prev, { type, content: '' }]);
  };

  const updateEvidenceBlock = (index: number, content: string) => {
    setEvidenceBlocks((prev) => prev.map((b, i) => i === index ? { ...b, content } : b));
  };

  const removeEvidenceBlock = (index: number) => {
    setEvidenceBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const reset = () => {
    setDescription('');
    setSelectedPillars([]);
    // Revoke object URLs to prevent memory leaks
    files.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setFiles([]);
    setEvidenceBlocks([]);
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

    const newItems: FileItem[] = [];
    for (const file of clonedFiles) {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      const maxSize = isVideo ? MAX_VIDEO_SIZE : isImage ? MAX_IMAGE_SIZE : MAX_DOCUMENT_SIZE;
      const maxMB = maxSize / (1024 * 1024);
      if (file.size > maxSize) {
        const fileMB = (file.size / (1024 * 1024)).toFixed(1);
        const fileType = isVideo ? 'videos' : isImage ? 'images' : 'documents';
        alert(`"${file.name}" is too large (${fileMB}MB). Maximum for ${fileType} is ${maxMB}MB.`);
        continue;
      }
      newItems.push({
        file,
        preview: isImage ? URL.createObjectURL(file) : null,
      });
    }
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
        const allBlocks: any[] = [];
        let orderIdx = 0;

        // Step 2: Upload files via shared /api/uploads/evidence endpoint
        if (files.length > 0) {
          const fd = new FormData();
          files.forEach((item) => fd.append('files', item.file));
          const uploadRes = await api.post('/api/uploads/evidence', fd);
          const uploadedFiles = uploadRes.data?.files || [];

          uploadedFiles.forEach((f: any) => {
            const blockType = f.content_type?.startsWith('video/') ? 'video' :
                              f.content_type?.startsWith('image/') ? 'image' : 'document';
            allBlocks.push({
              block_type: blockType,
              content: {},
              file_url: f.url,
              file_name: f.original_name || f.stored_name,
              order_index: orderIdx++,
            });
          });
        }

        // Step 3: Add text/link evidence blocks
        evidenceBlocks.forEach((block) => {
          if (!block.content.trim()) return;
          allBlocks.push({
            block_type: block.type,
            content: block.type === 'link' ? { url: block.content.trim() } : { text: block.content.trim() },
            order_index: orderIdx++,
          });
        });

        // Save all evidence blocks
        if (allBlocks.length > 0) {
          await api.post(`/api/learning-events/${eventId}/evidence`, { blocks: allBlocks });
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

  const canSave = description.trim().length > 0 || files.length > 0 || evidenceBlocks.some((b) => b.content.trim().length > 0);

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

            {/* Attach buttons row */}
            <HStack className="flex-wrap gap-2">
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
                }}
              >
                <Ionicons name="attach-outline" size={18} color="#6D469B" />
                <UIText size="xs" className="text-optio-purple font-poppins-medium">
                  {files.length > 0 ? 'More files' : 'Files'}
                </UIText>
              </Pressable>
              <Pressable
                onPress={() => addEvidenceBlock('text')}
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
                }}
              >
                <Ionicons name="document-text-outline" size={18} color="#6D469B" />
                <UIText size="xs" className="text-optio-purple font-poppins-medium">Text Note</UIText>
              </Pressable>
              <Pressable
                onPress={() => addEvidenceBlock('link')}
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
                }}
              >
                <Ionicons name="link-outline" size={18} color="#6D469B" />
                <UIText size="xs" className="text-optio-purple font-poppins-medium">Link</UIText>
              </Pressable>
            </HStack>

            {/* Evidence blocks (text/link) */}
            {evidenceBlocks.length > 0 && (
              <VStack space="xs">
                {evidenceBlocks.map((block, idx) => (
                  <HStack key={idx} className="items-start gap-2" style={{ backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
                    <Ionicons
                      name={block.type === 'link' ? 'link-outline' : 'document-text-outline'}
                      size={18}
                      color="#6D469B"
                      style={{ marginTop: 4 }}
                    />
                    <TextInput
                      value={block.content}
                      onChangeText={(val) => updateEvidenceBlock(idx, val)}
                      placeholder={block.type === 'link' ? 'https://...' : 'Add a text note...'}
                      placeholderTextColor="#9CA3AF"
                      multiline={block.type === 'text'}
                      numberOfLines={block.type === 'text' ? 3 : 1}
                      keyboardType={block.type === 'link' ? 'url' : 'default'}
                      autoCapitalize={block.type === 'link' ? 'none' : 'sentences'}
                      style={{
                        flex: 1,
                        fontSize: 14,
                        fontFamily: 'Poppins_400Regular',
                        color: '#1F2937',
                        minHeight: block.type === 'text' ? 60 : undefined,
                        textAlignVertical: block.type === 'text' ? 'top' : undefined,
                      }}
                    />
                    <Pressable onPress={() => removeEvidenceBlock(idx)} style={{ marginTop: 2 }}>
                      <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                    </Pressable>
                  </HStack>
                ))}
              </VStack>
            )}

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
