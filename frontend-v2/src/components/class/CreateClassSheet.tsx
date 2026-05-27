/**
 * CreateClassSheet - 3-step wizard to start a transcript class.
 *
 * Steps: Title -> Subject -> Description. Final Create makes an empty class
 * shell (quest_type='class' + transcript_subject) and routes to the new
 * class. Tasks are added on the class detail screen using the regular
 * personalization wizard, which picks up transcript_subject server-side so
 * AI suggestions stay aligned with the class subject.
 */

import React, { useState } from 'react';
import { View, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '@/src/services/api';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, BottomSheet,
} from '../ui';
import { SUBJECTS, type SubjectMeta } from './SUBJECTS';

interface CreateClassSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreated?: (questId: string) => void;
}

type Step = 'title' | 'subject' | 'description';

export function CreateClassSheet({ visible, onClose, onCreated }: CreateClassSheetProps) {
  const [step, setStep] = useState<Step>('title');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<SubjectMeta | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep('title');
    setTitle('');
    setSubject(null);
    setDescription('');
  };
  const handleClose = () => { reset(); onClose(); };

  const goNext = () => {
    if (step === 'title') {
      if (!title.trim()) return;
      setStep('subject');
      return;
    }
    if (step === 'subject') {
      if (!subject) return;
      setStep('description');
      return;
    }
  };

  const goBack = () => {
    if (step === 'subject') setStep('title');
    else if (step === 'description') setStep('subject');
  };

  const handleCreate = async () => {
    if (!title.trim() || !subject) return;
    setSubmitting(true);
    try {
      const { data } = await api.post('/api/quests/create', {
        title: title.trim(),
        description: description.trim() || undefined,
        quest_type: 'class',
        transcript_subject: subject.key,
      });
      const questId = data.quest_id || data.quest?.id;
      if (!questId) throw new Error('No quest id returned');

      reset();
      onClose();
      onCreated?.(questId);
      router.push(`/(app)/quests/${questId}`);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message
        || err.response?.data?.error
        || 'Could not create class.';
      Alert.alert('Error', typeof msg === 'string' ? msg : 'Could not create class.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepLabel = step === 'title' ? 'Step 1 of 3'
    : step === 'subject' ? 'Step 2 of 3'
    : 'Step 3 of 3';

  const canAdvance =
    (step === 'title' && title.trim().length > 0) ||
    (step === 'subject' && !!subject) ||
    (step === 'description');

  const isLastStep = step === 'description';

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <VStack space="md">
        <HStack className="items-center justify-between">
          <VStack>
            <UIText size="xs" className="text-typo-400 uppercase tracking-wider font-poppins-medium">
              {stepLabel}
            </UIText>
            <Heading size="lg">Start a Class</Heading>
          </VStack>
          <Pressable
            onPress={handleClose}
            className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center"
            hitSlop={8}
          >
            <Ionicons name="close" size={18} color="#6B7280" />
          </Pressable>
        </HStack>

        {step === 'title' && (
          <VStack space="md">
            <UIText size="sm" className="text-typo-500">
              Name your class. Make it real — something you actually want to do.
            </UIText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Soccer Conditioning"
              placeholderTextColor="#9CA3AF"
              className="bg-surface-50 rounded-xl p-4 text-base font-poppins"
              maxLength={120}
              autoFocus
              testID="class-title-input"
            />
          </VStack>
        )}

        {step === 'subject' && (
          <VStack space="md">
            <UIText size="sm" className="text-typo-500">
              Pick the transcript subject this class will count toward.
            </UIText>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              <VStack space="xs">
                {SUBJECTS.map((s) => {
                  const selected = subject?.key === s.key;
                  return (
                    <Pressable
                      key={s.key}
                      testID={`subject-${s.key}`}
                      onPress={() => setSubject(s)}
                      className={`rounded-xl p-3 border-2 ${selected ? 'border-optio-purple bg-purple-50' : 'border-surface-200 bg-white'}`}
                    >
                      <HStack className="items-center gap-3">
                        <View
                          style={{ backgroundColor: `${s.accent}1A` }}
                          className="w-10 h-10 rounded-full items-center justify-center"
                        >
                          <Ionicons name={s.icon} size={20} color={s.accent} />
                        </View>
                        <VStack className="flex-1">
                          <UIText size="md" className="font-poppins-semibold">{s.name}</UIText>
                          <UIText size="xs" className="text-typo-400">{s.description}</UIText>
                        </VStack>
                        {selected && <Ionicons name="checkmark-circle" size={22} color="#6D469B" />}
                      </HStack>
                    </Pressable>
                  );
                })}
              </VStack>
            </ScrollView>
          </VStack>
        )}

        {step === 'description' && (
          <VStack space="md">
            <UIText size="sm" className="text-typo-500">
              What are you actually doing for this class? A sentence or two helps us suggest better tasks later.
            </UIText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Training for varsity tryouts and running 3x/week"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              className="bg-surface-50 rounded-xl p-4 text-base font-poppins min-h-[120px]"
              style={{ textAlignVertical: 'top' }}
              maxLength={600}
              testID="class-description-input"
            />
            <UIText size="xs" className="text-typo-300">
              Optional — you can add this later. After creating, you'll add tasks from the class page.
            </UIText>
          </VStack>
        )}

        <HStack className="items-center gap-3">
          {step !== 'title' && (
            <Button
              size="lg"
              variant="outline"
              onPress={goBack}
              disabled={submitting}
            >
              <ButtonText>Back</ButtonText>
            </Button>
          )}
          {!isLastStep ? (
            <Button
              size="lg"
              className="flex-1"
              onPress={goNext}
              disabled={!canAdvance}
              testID="wizard-next-btn"
            >
              <ButtonText>Next</ButtonText>
            </Button>
          ) : (
            <Button
              size="lg"
              className="flex-1"
              onPress={handleCreate}
              disabled={submitting}
              loading={submitting}
              testID="wizard-create-btn"
            >
              <ButtonText>{submitting ? 'Creating…' : 'Create class'}</ButtonText>
            </Button>
          )}
        </HStack>
      </VStack>
    </BottomSheet>
  );
}
