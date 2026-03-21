/**
 * MediaModal - Full-screen media viewer.
 * Images fill the screen. Videos autoplay. Tap backdrop to close.
 */

import React from 'react';
import { View, Image, Pressable, Modal, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoPlayer } from './VideoPlayer';

interface MediaModalProps {
  visible: boolean;
  onClose: () => void;
  type: 'image' | 'video' | 'document';
  uri: string;
  title?: string;
}

export function MediaModal({ visible, onClose, type, uri, title }: MediaModalProps) {
  const { width: screenW, height: screenH } = Dimensions.get('window');

  // For documents/PDFs on web, just open in a new tab
  if (type === 'document' && Platform.OS === 'web') {
    if (visible) {
      window.open(uri, '_blank');
      setTimeout(onClose, 100);
    }
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable onPress={onClose} className="flex-1 bg-black">
        {/* Close button */}
        <Pressable
          onPress={onClose}
          className="absolute top-12 right-4 z-10 w-10 h-10 rounded-full bg-white/20 items-center justify-center"
        >
          <Ionicons name="close" size={24} color="white" />
        </Pressable>

        {/* Media */}
        <View className="flex-1 items-center justify-center">
          {(type === 'image' || type === 'document') && (
            <Image
              source={{ uri }}
              style={{ width: screenW, height: screenH * 0.85 }}
              resizeMode="contain"
            />
          )}

          {type === 'video' && (
            <View style={{ width: screenW, height: screenH * 0.85 }}>
              <VideoPlayer uri={uri} autoPlay fillContainer />
            </View>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}
