/**
 * MediaModal - Full-screen media viewer.
 * Images fill the screen and support pinch-to-zoom + pan (bug #25). Videos
 * autoplay. Tap backdrop to close; double-tap an image to toggle zoom.
 */

import React from 'react';
import { View, Image, Pressable, Modal, Platform, Dimensions } from 'react-native';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { VideoPlayer } from './VideoPlayer';
import { DocumentViewer } from './DocumentViewer';

interface MediaModalProps {
  visible: boolean;
  onClose: () => void;
  type: 'image' | 'video' | 'document';
  uri: string;
  title?: string;
}

/** Pinch-to-zoom + pan image. Double-tap toggles between fit and 2x. Pinch
 *  scale is clamped to [1, 4]; releasing below 1 snaps back to fit and recenters. */
function ZoomableImage({ uri, width, height }: { uri: string; width: number; height: number }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const reset = () => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(0.5, savedScale.value * e.scale);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        savedScale.value = Math.min(scale.value, 4);
        scale.value = withTiming(savedScale.value);
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value <= 1) return; // only pan while zoomed in
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        reset();
      } else {
        savedScale.value = 2;
        scale.value = withTiming(2);
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={animatedStyle}>
        <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

export function MediaModal({ visible, onClose, type, uri, title }: MediaModalProps) {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  // Cap media width so a portrait image/video doesn't blow up to the full
  // width of a wide desktop monitor. resizeMode="contain" keeps aspect ratio.
  const mediaW = Math.min(screenW, 1100);
  const mediaH = screenH * 0.85;

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
      {/* GestureHandlerRootView is required INSIDE a RN Modal — the app-root one
          doesn't wrap the modal's separate native view tree, so pinch/pan would
          be dead without this. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
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
            {type === 'image' && (
              <ZoomableImage uri={uri} width={mediaW} height={mediaH} />
            )}

            {/* PDFs/documents render page-by-page via DocumentViewer; the old
                code fed them to <Image> (ZoomableImage), which showed nothing. */}
            {type === 'document' && (
              <View style={{ width: Math.min(mediaW, 560), paddingHorizontal: 16 }}>
                <DocumentViewer uri={uri} title={title} />
              </View>
            )}

            {type === 'video' && (
              <View style={{ width: mediaW, height: mediaH }}>
                <VideoPlayer uri={uri} autoPlay fillContainer />
              </View>
            )}
          </View>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}
