/**
 * VideoPlayer - Inline video with play/pause controls.
 * Uses expo-video for cross-platform playback.
 */

import React, { useState, useEffect } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';

interface VideoPlayerProps {
  uri: string;
  className?: string;
  autoPlay?: boolean;
  fillContainer?: boolean;
  /** When false (e.g. the card scrolled out of view in the feed), the video is
   *  paused so audio doesn't keep playing off-screen. Defaults to true. */
  isActive?: boolean;
}

export function VideoPlayer({ uri, className = '', autoPlay = false, fillContainer = false, isActive = true }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [errored, setErrored] = useState(false);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    if (autoPlay) {
      p.play();
    }
  });

  // Pause when this player goes inactive (scrolled out of view). Guard the
  // native call so a released player during unmount can't throw.
  useEffect(() => {
    if (!isActive && isPlaying) {
      try { player?.pause(); } catch { /* player may be released */ }
      setIsPlaying(false);
    }
  }, [isActive, isPlaying, player]);

  // Recover from a transient load failure (e.g. a just-uploaded video whose URL
  // isn't served yet) without forcing an app restart — the "video isn't
  // available… shows after I closed and reopened the app" report. On error we
  // surface a tap-to-retry that re-loads the source via replaceAsync.
  useEffect(() => {
    if (!player?.addListener) return;
    const sub = player.addListener('statusChange', (payload: { status?: string }) => {
      setErrored(payload?.status === 'error');
    });
    return () => { try { sub?.remove?.(); } catch { /* already removed */ } };
  }, [player]);

  const retry = () => {
    setErrored(false);
    try { player?.replaceAsync?.(uri); } catch { /* will re-error and show retry again */ }
  };

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
    <View className={`w-full rounded-lg overflow-hidden ${fillContainer ? 'flex-1' : ''} ${className}`}>
      <View className="w-full bg-black" style={fillContainer ? { flex: 1 } : { aspectRatio: 3 / 4, minHeight: 300 }}>
        <VideoView
          player={player}
          style={{ width: '100%', height: '100%' }}
          contentFit={fillContainer ? 'contain' : 'cover'}
          nativeControls={false}
        />
        {errored ? (
          /* Load failed (e.g. URL not ready yet) — let the user retry in place. */
          <Pressable onPress={retry} className="absolute inset-0 items-center justify-center bg-black/40">
            <View className="items-center justify-center">
              <Ionicons name="refresh" size={28} color="#FFFFFF" />
              <Text className="text-white text-xs mt-1 font-poppins-medium">Tap to retry</Text>
            </View>
          </Pressable>
        ) : (
          /* Tap overlay - always present so pause works even while playing */
          <Pressable onPress={handlePlay} className="absolute inset-0 items-center justify-center">
            {!isPlaying && (
              <View className="items-center justify-center bg-black/30 absolute inset-0">
                <View className="w-14 h-14 rounded-full bg-white/90 items-center justify-center">
                  <Ionicons name="play" size={28} color="#1F2937" style={{ marginLeft: 3 }} />
                </View>
              </View>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}
