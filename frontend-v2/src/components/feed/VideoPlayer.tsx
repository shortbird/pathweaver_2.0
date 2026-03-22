/**
 * VideoPlayer - Inline video with play/pause controls.
 * Uses expo-video for cross-platform playback.
 */

import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';

interface VideoPlayerProps {
  uri: string;
  className?: string;
  autoPlay?: boolean;
  fillContainer?: boolean;
}

export function VideoPlayer({ uri, className = '', autoPlay = false, fillContainer = false }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(autoPlay);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    if (autoPlay) {
      p.play();
    }
  });

  const handlePlay = () => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  return (
    <Pressable onPress={handlePlay} className={`w-full rounded-lg overflow-hidden ${className}`}>
      <View className="w-full bg-black" style={fillContainer ? { flex: 1 } : { aspectRatio: 3 / 4, minHeight: 300 }}>
        <VideoView
          player={player}
          style={{ width: '100%', height: '100%' }}
          contentFit={fillContainer ? 'contain' : 'cover'}
          nativeControls={false}
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
