/**
 * LessonViewer - Step-by-step lesson content viewer (web only).
 *
 * Renders lesson steps with HTML content, embedded videos (YouTube/Vimeo/Loom),
 * and prev/next navigation. Designed for the course detail page.
 */

import React, { useState, useMemo } from 'react';
import { View, ScrollView, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, Heading, UIText, Card, Button, ButtonText, Divider } from '../ui';
import api from '@/src/services/api';
import type { Lesson, LessonStep } from '@/src/hooks/useCourses';

/** Extract embeddable URL from YouTube/Vimeo/Loom/Drive links. */
function getEmbedUrl(url: string | undefined | null): string | null {
  if (!url) return null;

  // YouTube
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  // Vimeo
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;

  // Loom
  const lm = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  if (lm) return `https://www.loom.com/embed/${lm[1]}`;

  // Google Drive
  const gd = url.match(/drive\.google\.com.*\/d\/([a-zA-Z0-9_-]+)/);
  if (gd) return `https://drive.google.com/file/d/${gd[1]}/preview`;

  return url;
}

/** Renders an embedded video player (iframe, web only). */
function VideoEmbed({ url }: { url: string }) {
  const embedUrl = getEmbedUrl(url);
  if (!embedUrl || Platform.OS !== 'web') return null;

  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', marginVertical: 8 }}>
      <iframe
        src={embedUrl}
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="Video"
      />
    </View>
  );
}

/** Renders HTML content (web only). */
function HtmlContent({ html }: { html: string }) {
  if (!html || Platform.OS !== 'web') return null;

  return (
    <div
      className="lesson-prose"
      style={{
        fontFamily: 'Poppins, system-ui, sans-serif',
        fontSize: 16,
        lineHeight: 1.75,
        color: '#374151',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Step indicator dots. */
function StepIndicator({ total, current, onSelect }: { total: number; current: number; onSelect: (i: number) => void }) {
  if (total <= 1) return null;
  return (
    <HStack className="justify-center gap-1.5 py-2">
      {Array.from({ length: total }).map((_, i) => (
        <Pressable key={i} onPress={() => onSelect(i)}>
          <View
            style={{
              width: i === current ? 24 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: i === current ? '#6D469B' : i < current ? '#C4B5D9' : '#E5E7EB',
            }}
          />
        </Pressable>
      ))}
    </HStack>
  );
}

interface LessonViewerProps {
  lesson: Lesson;
  questId?: string;
  onClose: () => void;
  onComplete?: () => void;
}

export function LessonViewer({ lesson, questId, onClose, onComplete }: LessonViewerProps) {
  const steps = useMemo(() => {
    const raw = lesson.content?.steps || [];
    return [...raw].sort((a, b) => a.order - b.order);
  }, [lesson]);

  const [currentStep, setCurrentStep] = useState(0);
  const [completing, setCompleting] = useState(false);
  const step = steps[currentStep];
  const totalSteps = steps.length;
  const hasSteps = totalSteps > 0;

  const handleDone = async () => {
    const qId = questId || lesson.quest_id;
    if (qId) {
      setCompleting(true);
      try {
        await api.post(`/api/quests/${qId}/curriculum/progress/${lesson.id}`, {
          status: 'completed',
          progress_percentage: 100,
        });
        onComplete?.();
      } catch {
        // Still close even if the API call fails
      } finally {
        setCompleting(false);
      }
    }
    onClose();
  };

  return (
    <Card variant="elevated" size="lg" className="overflow-hidden">
      <VStack space="md">
        {/* Header */}
        <HStack className="items-center justify-between">
          <VStack className="flex-1 mr-3">
            <UIText size="xs" className="text-optio-purple font-poppins-medium uppercase">Lesson</UIText>
            <Heading size="lg">{lesson.title}</Heading>
          </VStack>
          <Pressable onPress={onClose} className="w-9 h-9 rounded-full bg-surface-100 items-center justify-center">
            <Ionicons name="close" size={20} color="#6B7280" />
          </Pressable>
        </HStack>

        {/* Duration */}
        {lesson.estimated_duration_minutes && (
          <HStack className="items-center gap-1.5">
            <Ionicons name="time-outline" size={14} color="#9CA3AF" />
            <UIText size="xs" className="text-typo-400">{lesson.estimated_duration_minutes} min</UIText>
          </HStack>
        )}

        {hasSteps ? (
          <>
            {/* Step indicator */}
            <StepIndicator total={totalSteps} current={currentStep} onSelect={setCurrentStep} />

            {/* Step header */}
            <HStack className="items-center justify-between">
              {step?.title && (
                <UIText size="xs" className="text-optio-purple font-poppins-semibold">{step.title}</UIText>
              )}
              <UIText size="xs" className="text-typo-400 font-poppins-medium">
                Step {currentStep + 1} of {totalSteps}
              </UIText>
            </HStack>

            <Divider />

            {/* Step content */}
            {step && (
              <VStack space="sm">
                {/* Video (if video step or has video_url) */}
                {(step.type === 'video' || step.video_url) && step.video_url && (
                  <VideoEmbed url={step.video_url} />
                )}

                {/* HTML content */}
                {step.content && (
                  <HtmlContent html={step.content} />
                )}
              </VStack>
            )}

            {/* Navigation buttons */}
            <HStack className="gap-3 pt-2">
              <Pressable
                onPress={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
                className={`flex-row items-center gap-1.5 px-4 py-2.5 rounded-lg ${currentStep === 0 ? 'opacity-30' : 'bg-surface-100'}`}
              >
                <Ionicons name="chevron-back" size={16} color="#6D469B" />
                <UIText size="sm" className="text-optio-purple font-poppins-medium">Previous</UIText>
              </Pressable>

              <View className="flex-1" />

              {currentStep < totalSteps - 1 ? (
                <Pressable
                  onPress={() => setCurrentStep(currentStep + 1)}
                  className="flex-row items-center gap-1.5 px-4 py-2.5 rounded-lg bg-optio-purple"
                >
                  <UIText size="sm" className="text-white font-poppins-medium">Next</UIText>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleDone}
                  disabled={completing}
                  className={`flex-row items-center gap-1.5 px-4 py-2.5 rounded-lg bg-green-600 ${completing ? 'opacity-60' : ''}`}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <UIText size="sm" className="text-white font-poppins-medium">{completing ? 'Saving...' : 'Done'}</UIText>
                </Pressable>
              )}
            </HStack>
          </>
        ) : (
          /* No steps - show description or placeholder */
          <VStack space="sm" className="py-4">
            {lesson.description ? (
              <UIText className="text-typo-500">{lesson.description}</UIText>
            ) : (
              <UIText className="text-typo-400 italic">This lesson has no content yet.</UIText>
            )}

            {/* Top-level video */}
            {lesson.video_url && <VideoEmbed url={lesson.video_url} />}

            <Button size="md" variant="outline" onPress={onClose} className="self-start">
              <ButtonText>Close</ButtonText>
            </Button>
          </VStack>
        )}
      </VStack>
    </Card>
  );
}
