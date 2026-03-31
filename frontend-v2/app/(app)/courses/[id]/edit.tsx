/**
 * Course Edit - Superadmin-only course editing page.
 *
 * Allows editing title, description, status, and visibility.
 * Mirrors the core editing functionality from v1 CourseBuilder's details modal.
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCourseDetail } from '@/src/hooks/useCourses';
import { useAuthStore } from '@/src/stores/authStore';
import api from '@/src/services/api';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText, Divider,
} from '@/src/components/ui';

const STATUS_OPTIONS = ['draft', 'published', 'archived'] as const;
const VISIBILITY_OPTIONS = ['public', 'private', 'organization'] as const;

function OptionPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <VStack space="xs">
      <UIText size="sm" className="font-poppins-medium text-typo-600">{label}</UIText>
      <HStack className="gap-2 flex-wrap">
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              className={`px-4 py-2 rounded-lg border ${
                selected
                  ? 'bg-optio-purple border-optio-purple'
                  : 'bg-surface-50 border-outline-200'
              }`}
            >
              <UIText
                size="sm"
                className={`capitalize font-poppins-medium ${
                  selected ? 'text-white' : 'text-typo-500'
                }`}
              >
                {opt}
              </UIText>
            </Pressable>
          );
        })}
      </HStack>
    </VStack>
  );
}

export default function CourseEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { course, loading, error } = useCourseDetail(id || null);
  const user = useAuthStore((s) => s.user);

  const effectiveRole = user?.role === 'org_managed' ? user?.org_role : user?.role;
  const isSuperadmin = effectiveRole === 'superadmin';
  const isCreator = !!course && !!user && course.created_by === user.id;
  const canEdit = isSuperadmin || isCreator;

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('draft');
  const [visibility, setVisibility] = useState('public');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Populate form when course loads
  useEffect(() => {
    if (course) {
      setTitle(course.title || '');
      setDescription(course.description || '');
      setStatus(course.status || 'draft');
      setVisibility(course.visibility || 'public');
    }
  }, [course]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await api.put(`/api/courses/${id}`, {
        title,
        description,
        status,
        visibility,
      });
      setSaveMessage('Course updated successfully.');
    } catch (err: any) {
      setSaveMessage(err.response?.data?.error || 'Failed to save course.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center">
        <ActivityIndicator size="large" color="#6D469B" />
      </SafeAreaView>
    );
  }

  if (error || !course) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-6">
        <Ionicons name="alert-circle-outline" size={48} color="#9CA3AF" />
        <Heading size="md" className="text-typo-500 mt-4">Course not found</Heading>
        <UIText size="sm" className="text-typo-400 mt-2 text-center">{error || 'This course may have been removed.'}</UIText>
        <Button className="mt-6" onPress={() => router.back()}>
          <ButtonText>Go Back</ButtonText>
        </Button>
      </SafeAreaView>
    );
  }

  if (!canEdit) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-6">
        <Ionicons name="lock-closed-outline" size={48} color="#9CA3AF" />
        <Heading size="md" className="text-typo-500 mt-4">Access Denied</Heading>
        <UIText size="sm" className="text-typo-400 mt-2 text-center">You do not have permission to edit this course.</UIText>
        <Button className="mt-6" onPress={() => router.back()}>
          <ButtonText>Go Back</ButtonText>
        </Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <VStack className="max-w-3xl w-full md:mx-auto px-5 md:px-8 pt-6 pb-12" space="lg">

          {/* Header */}
          <HStack className="items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full bg-surface-200 items-center justify-center"
            >
              <Ionicons name="arrow-back" size={22} color="#374151" />
            </Pressable>
            <VStack className="flex-1">
              <Heading size="xl">Edit Course</Heading>
              <UIText size="sm" className="text-typo-400">Update course details and settings</UIText>
            </VStack>
          </HStack>

          <Divider />

          {/* Title */}
          <VStack space="xs">
            <UIText size="sm" className="font-poppins-medium text-typo-600">Title</UIText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Course title"
              placeholderTextColor="#9CA3AF"
              className="border border-outline-200 rounded-lg px-4 py-3 text-base text-typo-700 bg-white"
            />
          </VStack>

          {/* Description */}
          <VStack space="xs">
            <UIText size="sm" className="font-poppins-medium text-typo-600">Description</UIText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Course description"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              className="border border-outline-200 rounded-lg px-4 py-3 text-base text-typo-700 bg-white min-h-[120px]"
            />
          </VStack>

          {/* Status */}
          <OptionPicker
            label="Status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={setStatus}
          />

          {/* Visibility */}
          <OptionPicker
            label="Visibility"
            options={VISIBILITY_OPTIONS}
            value={visibility}
            onChange={setVisibility}
          />

          {/* Save feedback */}
          {saveMessage && (
            <Card variant="filled" size="sm">
              <UIText
                size="sm"
                className={saveMessage.includes('success') ? 'text-green-700' : 'text-red-600'}
              >
                {saveMessage}
              </UIText>
            </Card>
          )}

          {/* Actions */}
          <HStack className="gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => router.back()}
            >
              <ButtonText>Cancel</ButtonText>
            </Button>
            <Button
              className="flex-1"
              onPress={handleSave}
              disabled={saving || !title.trim()}
            >
              <ButtonText>{saving ? 'Saving...' : 'Save Changes'}</ButtonText>
            </Button>
          </HStack>

        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
