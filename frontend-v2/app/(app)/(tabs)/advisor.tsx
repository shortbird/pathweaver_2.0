/**
 * Advisor Dashboard - Web only.
 *
 * Two-panel layout: student caseload list on the left, student detail on the right.
 * Shows engagement rhythm, active quests, check-in history, and quick actions.
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, Pressable, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { useAdvisorStudents, useStudentOverview, createCheckin } from '@/src/hooks/useAdvisor';
import { EngagementCalendar } from '@/src/components/engagement/EngagementCalendar';
import { RhythmBadge } from '@/src/components/engagement/RhythmBadge';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Badge, BadgeText, Divider, Skeleton, Avatar, AvatarFallbackText, AvatarImage,
  Input, InputField, InputSlot, InputIcon,
} from '@/src/components/ui';

const rhythmIcons: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  in_flow: { icon: 'flash', color: '#6D469B' },
  building: { icon: 'trending-up', color: '#1D4ED8' },
  resting: { icon: 'moon', color: '#15803D' },
  fresh_return: { icon: 'refresh', color: '#B45309' },
  ready_to_begin: { icon: 'play-circle', color: '#9CA3AF' },
  ready_when_you_are: { icon: 'play-circle', color: '#9CA3AF' },
  finding_rhythm: { icon: 'trending-up', color: '#1D4ED8' },
};

// ── Student List Item ──

function StudentListItem({ student, rhythm, isSelected, onSelect }: {
  student: any; rhythm?: { state: string }; isSelected: boolean; onSelect: () => void;
}) {
  const initials = `${student.first_name?.[0] || ''}${student.last_name?.[0] || ''}`.toUpperCase();
  const state = rhythm?.state || 'ready_to_begin';
  const ri = rhythmIcons[state] || rhythmIcons.ready_to_begin;

  return (
    <Pressable onPress={onSelect} className={`px-3 py-2.5 rounded-xl ${isSelected ? 'bg-optio-purple/10' : 'active:bg-surface-100'}`}>
      <HStack className="items-center gap-3">
        <Avatar size="sm">
          {student.avatar_url ? <AvatarImage source={{ uri: student.avatar_url }} /> : <AvatarFallbackText>{initials}</AvatarFallbackText>}
        </Avatar>
        <VStack className="flex-1 min-w-0">
          <UIText size="sm" className={`font-poppins-medium ${isSelected ? 'text-optio-purple' : ''}`} numberOfLines={1}>
            {student.display_name || `${student.first_name} ${student.last_name}`}
          </UIText>
          <UIText size="xs" className="text-typo-400">{(student.total_xp || 0).toLocaleString()} XP</UIText>
        </VStack>
        <Ionicons name={ri.icon} size={16} color={ri.color} />
      </HStack>
    </Pressable>
  );
}

// ── Caseload Summary Bar ──

function CaseloadBar({ caseload }: { caseload: any }) {
  if (!caseload?.rhythm_counts) return null;
  const counts = caseload.rhythm_counts;
  const states = [
    { key: 'in_flow', label: 'In Flow', color: '#6D469B' },
    { key: 'building', label: 'Building', color: '#1D4ED8' },
    { key: 'resting', label: 'Resting', color: '#15803D' },
    { key: 'ready_when_you_are', label: 'Waiting', color: '#9CA3AF' },
  ];

  return (
    <HStack className="gap-3 flex-wrap">
      {states.map((s) => (
        counts[s.key] > 0 && (
          <HStack key={s.key} className="items-center gap-1">
            <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <UIText size="xs" className="text-typo-400">{counts[s.key]} {s.label}</UIText>
          </HStack>
        )
      ))}
    </HStack>
  );
}

// ── Student Detail Panel ──

function StudentDetailPanel({ studentId }: { studentId: string }) {
  const { overview, loading } = useStudentOverview(studentId);
  const [detailTab, setDetailTab] = useState<'overview' | 'checkin' | 'quests'>('overview');
  const [checkinNotes, setCheckinNotes] = useState('');
  const [readingNotes, setReadingNotes] = useState('');
  const [writingNotes, setWritingNotes] = useState('');
  const [mathNotes, setMathNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <VStack space="md">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </VStack>
    );
  }

  if (!overview) {
    return <UIText className="text-typo-500">Could not load student data.</UIText>;
  }

  const student = overview.student || overview.user || {};
  const dashboard = overview.dashboard || {};
  const engagement = overview.engagement || {};
  const activeQuests = dashboard.activeQuests || dashboard.active_quests || [];
  const pillars = overview.pillars || [];
  const initials = `${student.first_name?.[0] || ''}${student.last_name?.[0] || ''}`.toUpperCase();

  const handleSubmitCheckin = async () => {
    setSubmitting(true);
    try {
      await createCheckin({
        student_id: studentId,
        checkin_date: new Date().toISOString().split('T')[0],
        reading_notes: readingNotes || undefined,
        writing_notes: writingNotes || undefined,
        math_notes: mathNotes || undefined,
        additional_notes: checkinNotes || undefined,
      });
      setCheckinNotes('');
      setReadingNotes('');
      setWritingNotes('');
      setMathNotes('');
    } catch { /* error */ }
    finally { setSubmitting(false); }
  };

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'checkin' as const, label: 'Check-In' },
    { key: 'quests' as const, label: `Quests (${activeQuests.length})` },
  ];

  return (
    <VStack space="md">
      {/* Student header */}
      <Card variant="elevated" size="md">
        <HStack className="items-center gap-4">
          <Avatar size="lg">
            {student.avatar_url ? <AvatarImage source={{ uri: student.avatar_url }} /> : <AvatarFallbackText>{initials}</AvatarFallbackText>}
          </Avatar>
          <VStack className="flex-1">
            <Heading size="lg">{student.display_name || `${student.first_name} ${student.last_name}`}</Heading>
            <UIText size="xs" className="text-typo-400">{student.email}</UIText>
            <HStack className="items-center gap-3 mt-1">
              <UIText size="sm" className="font-poppins-semibold text-optio-purple">{(dashboard.totalXp || dashboard.total_xp || student.total_xp || 0).toLocaleString()} XP</UIText>
              {engagement.rhythm && <RhythmBadge rhythm={engagement.rhythm} compact />}
            </HStack>
          </VStack>
        </HStack>
      </Card>

      {/* Sub-tabs */}
      <HStack className="bg-surface-100 rounded-lg p-1" space="xs">
        {tabs.map((t) => (
          <Pressable key={t.key} onPress={() => setDetailTab(t.key)} className={`flex-1 py-2 rounded-md items-center ${detailTab === t.key ? 'bg-white shadow-sm' : ''}`}>
            <UIText size="xs" className={detailTab === t.key ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500'}>{t.label}</UIText>
          </Pressable>
        ))}
      </HStack>

      {/* Overview tab */}
      {detailTab === 'overview' && (
        <VStack space="md">
          {/* Engagement calendar */}
          {engagement.calendar?.days && (
            <Card variant="elevated" size="md">
              <VStack space="sm">
                <UIText size="xs" className="text-typo-400 font-poppins-medium">Engagement</UIText>
                <EngagementCalendar days={engagement.calendar.days} firstActivityDate={engagement.calendar.first_activity_date} />
              </VStack>
            </Card>
          )}

          {/* Pillar breakdown */}
          {pillars.length > 0 && (
            <Card variant="elevated" size="md">
              <VStack space="sm">
                <UIText size="xs" className="text-typo-400 font-poppins-medium">Pillars</UIText>
                {pillars.map((p: any) => (
                  <HStack key={p.id || p.name} className="items-center justify-between">
                    <UIText size="sm" className="font-poppins-medium capitalize">{p.name === 'stem' ? 'STEM' : p.name}</UIText>
                    <UIText size="xs" className="text-typo-400">{(p.xp || 0).toLocaleString()} XP</UIText>
                  </HStack>
                ))}
              </VStack>
            </Card>
          )}

          {/* Recent completions */}
          {dashboard.recentCompletions?.length > 0 && (
            <Card variant="elevated" size="md">
              <VStack space="sm">
                <UIText size="xs" className="text-typo-400 font-poppins-medium">Recent Completions</UIText>
                {dashboard.recentCompletions.slice(0, 5).map((c: any, i: number) => (
                  <HStack key={i} className="items-center gap-2">
                    <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                    <UIText size="xs" className="flex-1" numberOfLines={1}>{c.title || c.task_title || 'Task'}</UIText>
                    <UIText size="xs" className="text-typo-400">{c.xp_value || 0} XP</UIText>
                  </HStack>
                ))}
              </VStack>
            </Card>
          )}
        </VStack>
      )}

      {/* Check-in tab */}
      {detailTab === 'checkin' && (
        <Card variant="elevated" size="md">
          <VStack space="md">
            <Heading size="sm">New Check-In</Heading>

            <VStack space="xs">
              <UIText size="xs" className="text-typo-400 font-poppins-medium">Reading</UIText>
              <TextInput
                className="border border-surface-200 rounded-lg p-3 text-sm min-h-[60px]"
                style={{ fontFamily: 'Poppins_400Regular' }}
                placeholder="What is the student reading? Comprehension level?"
                value={readingNotes}
                onChangeText={setReadingNotes}
                multiline
                textAlignVertical="top"
                placeholderTextColor="#9CA3AF"
              />
            </VStack>

            <VStack space="xs">
              <UIText size="xs" className="text-typo-400 font-poppins-medium">Writing</UIText>
              <TextInput
                className="border border-surface-200 rounded-lg p-3 text-sm min-h-[60px]"
                style={{ fontFamily: 'Poppins_400Regular' }}
                placeholder="What is the student writing? Skill development?"
                value={writingNotes}
                onChangeText={setWritingNotes}
                multiline
                textAlignVertical="top"
                placeholderTextColor="#9CA3AF"
              />
            </VStack>

            <VStack space="xs">
              <UIText size="xs" className="text-typo-400 font-poppins-medium">Math</UIText>
              <TextInput
                className="border border-surface-200 rounded-lg p-3 text-sm min-h-[60px]"
                style={{ fontFamily: 'Poppins_400Regular' }}
                placeholder="Mental math, problem-solving skills?"
                value={mathNotes}
                onChangeText={setMathNotes}
                multiline
                textAlignVertical="top"
                placeholderTextColor="#9CA3AF"
              />
            </VStack>

            <VStack space="xs">
              <UIText size="xs" className="text-typo-400 font-poppins-medium">Additional Notes</UIText>
              <TextInput
                className="border border-surface-200 rounded-lg p-3 text-sm min-h-[80px]"
                style={{ fontFamily: 'Poppins_400Regular' }}
                placeholder="General observations, goals, follow-ups..."
                value={checkinNotes}
                onChangeText={setCheckinNotes}
                multiline
                textAlignVertical="top"
                placeholderTextColor="#9CA3AF"
              />
            </VStack>

            <Button onPress={handleSubmitCheckin} loading={submitting}>
              <ButtonText>Save Check-In</ButtonText>
            </Button>
          </VStack>
        </Card>
      )}

      {/* Quests tab */}
      {detailTab === 'quests' && (
        <VStack space="sm">
          {activeQuests.length > 0 ? (
            activeQuests.map((q: any) => (
              <Card key={q.id || q.quest_id} variant="outline" size="sm">
                <HStack className="items-center gap-3">
                  <View className="w-10 h-10 rounded-lg bg-optio-purple/10 items-center justify-center">
                    <Ionicons name="rocket-outline" size={18} color="#6D469B" />
                  </View>
                  <VStack className="flex-1 min-w-0">
                    <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
                      {q.title || q.quests?.title || 'Quest'}
                    </UIText>
                    <UIText size="xs" className="text-typo-400">
                      {q.completed_tasks || 0} tasks completed
                    </UIText>
                  </VStack>
                </HStack>
              </Card>
            ))
          ) : (
            <Card variant="filled" size="md" className="items-center py-6">
              <Ionicons name="rocket-outline" size={32} color="#9CA3AF" />
              <UIText size="sm" className="text-typo-500 mt-2">No active quests</UIText>
            </Card>
          )}
        </VStack>
      )}
    </VStack>
  );
}

// ── Main Advisor Dashboard ──

export default function AdvisorScreen() {
  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center">
        <Ionicons name="desktop-outline" size={40} color="#9CA3AF" />
        <Heading size="sm" className="text-typo-500 mt-3">Desktop Only</Heading>
        <UIText size="sm" className="text-typo-400 mt-1">Advisor tools are available on desktop.</UIText>
      </SafeAreaView>
    );
  }

  const { students, caseload, loading } = useAdvisorStudents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = students.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.first_name?.toLowerCase().includes(q) ||
      s.last_name?.toLowerCase().includes(q) ||
      s.display_name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  });

  // Get rhythm for each student
  const getStudentRhythm = (studentId: string) => {
    return caseload?.per_student_rhythm?.[studentId];
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Left: Student list */}
        <View style={{ width: 300, borderRightWidth: 1, borderRightColor: '#E5E7EB' }} className="bg-white">
          <VStack className="p-4" space="sm">
            <Heading size="lg">Advisor</Heading>
            <UIText size="xs" className="text-typo-400">{students.length} student{students.length !== 1 ? 's' : ''}</UIText>
            <CaseloadBar caseload={caseload} />
            <Input variant="rounded" size="sm">
              <InputSlot className="ml-2"><InputIcon as="search-outline" /></InputSlot>
              <InputField placeholder="Search..." value={search} onChangeText={setSearch} />
            </Input>
          </VStack>
          <Divider />
          <ScrollView className="flex-1 px-2 py-1" showsVerticalScrollIndicator={false}>
            {loading ? (
              <VStack space="sm" className="p-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </VStack>
            ) : filtered.length > 0 ? (
              filtered.map((s) => (
                <StudentListItem
                  key={s.id}
                  student={s}
                  rhythm={getStudentRhythm(s.id)}
                  isSelected={selectedId === s.id}
                  onSelect={() => setSelectedId(s.id)}
                />
              ))
            ) : (
              <VStack className="items-center py-8">
                <Ionicons name="people-outline" size={32} color="#9CA3AF" />
                <UIText size="xs" className="text-typo-400 mt-2">No students found</UIText>
              </VStack>
            )}
          </ScrollView>
        </View>

        {/* Right: Student detail or welcome */}
        <ScrollView className="flex-1" contentContainerClassName="p-6" showsVerticalScrollIndicator={false}>
          {selectedId ? (
            <StudentDetailPanel studentId={selectedId} />
          ) : (
            <View className="flex-1 items-center justify-center py-20">
              <View className="w-20 h-20 rounded-full bg-optio-purple/10 items-center justify-center mb-4">
                <Ionicons name="clipboard-outline" size={36} color="#6D469B" />
              </View>
              <Heading size="md" className="text-typo-500">Select a Student</Heading>
              <UIText size="sm" className="text-typo-400 mt-2 text-center max-w-sm">
                Choose a student from the list to view their progress, engagement, and create check-ins.
              </UIText>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
