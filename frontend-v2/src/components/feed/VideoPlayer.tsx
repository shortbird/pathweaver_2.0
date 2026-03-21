/**
 * VideoPlayer - Inline video with play/pause controls.
 * Uses expo-av for cross-platform playback.
 */

import React, { useRef, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { UIText } from '../ui/text';

interface VideoPlayerProps {
  uri: string;
  className?: string;
  autoPlay?: boolean;
  fillContainer?: boolean;
}

export function VideoPlayer({ uri, className = '', autoPlay = false, fillContainer = false }: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const handlePlay = async () => {
    if (!hasStarted) {
      setHasStarted(true);
    }
    if (videoRef.current) {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
      }
    }
  };

  return (
    <Pressable onPress={handlePlay} className={`w-full rounded-lg overflow-hidden ${className}`}>
      <View className="w-full bg-black" style={fillContainer ? { flex: 1 } : { aspectRatio: 3 / 4, minHeight: 300 }}>
        <Video
          ref={videoRef}
          source={{ uri }}
          resizeMode={fillContainer ? ResizeMode.CONTAIN : ResizeMode.COVER}
          shouldPlay={autoPlay}
          isLooping={false}
          onPlaybackStatusUpdate={(status) => {
            if (status.isLoaded) {
              setIsPlaying(status.isPlaying);
            }
          }}
          style={{ width: '100%', height: '100%' }}
        />
        {/* Play/pause overlay */}
        {!isPlaying && (
          <View className="absolute inset-0 items-center justify-center bg-black/30">
            <View className="w-14 h-14 rounded-full bg-white/90 items-center justify-center">
              <Ionicons name="play" size={28} color="#1F2937" style={{ marginLeft: 3 }} />
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}
