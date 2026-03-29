/**
 * CreateQuestModal - Full admin quest creation form.
 *
 * Fields:
 * - Quest details: title, description, source, status
 * - Template tasks: title, description, pillar, school subjects, subject XP distribution (auto-balanced), XP
 * - Metadata: location type, venue, address, seasonal dates
 *
 * Calls POST /api/admin/quests/create
 */

import React, { useState, useEffect } from 'react';
import { View, Modal, Pressable, TextInput, ScrollView, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { pillarKeys, getPillar } from '@/src/config/pillars';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, Card, Divider,
} from '../ui';

// ── Types ──

interface SchoolSubject {
  key: string;
  name: string;
  description: string;
}

interface QuestTask {
  title: string;
  description: string;
  pillar: string;
  xp_value: number;
  is_required: boolean;
  school_subjects: string[];
  subject_xp_distribution: Record<string, number>;
  order_index: number;
}

interface QuestMetadata {
  location_type: string;
  location_address: string;
  venue_name: string;
  seasonal_start: string;
  seasonal_end: string;
}

interface FormData {
  title: string;
  big_idea: string;
  source: string;
  is_active: boolean;
  tasks: QuestTask[];
  metadata: QuestMetadata;
}

const FALLBACK_SUBJECTS: SchoolSubject[] = [
  { key: 'language_arts', name: 'Language Arts', description: 'Reading, writing, literature' },
  { key: 'math', name: 'Math', description: 'Mathematics, algebra, geometry' },
  { key: 'science', name: 'Science', description: 'Biology, chemistry, physics' },
  { key: 'social_studies', name: 'Social Studies', description: 'History, geography, civics' },
  { key: 'financial_literacy', name: 'Financial Literacy', description: 'Personal finance, budgeting' },
  { key: 'health', name: 'Health', description: 'Health education, nutrition' },
  { key: 'pe', name: 'PE', description: 'Physical education, sports' },
  { key: 'fine_arts', name: 'Fine Arts', description: 'Visual arts, music, theater' },
  { key: 'cte', name: 'CTE', description: 'Career and technical education' },
  { key: 'digital_literacy', name: 'Digital Literacy', description: 'Technology, computer science' },
  { key: 'electives', name: 'Electives', description: 'Specialized interests' },
];

const LOCATION_TYPES = [
  { value: 'anywhere', label: 'Anywhere' },
  { value: 'specific_location', label: 'Specific Location' },
  { value: 'online', label: 'Online Only' },
  { value: 'outdoors', label: 'Outdoors' },
];

function emptyTask(index: number): QuestTask {
  return {
    title: '', description: '', pillar: '', xp_value: 100, is_required: false,
    school_subjects: [], subject_xp_distribution: {}, order_index: index,
  };
}

function initialFormData(): FormData {
  return {
    title: '', big_idea: '', source: 'optio', is_active: true,
    tasks: [],
    metadata: { location_type: 'anywhere', location_address: '', venue_name: '', seasonal_start: '', seasonal_end: '' },
  };
}

/** Evenly distribute taskXP across subjects, remainder goes to first */
function balanceSubjectXP(subjects: string[], taskXP: number): Record<string, number> {
  if (subjects.length === 0) return {};
  const perSubject = Math.floor(taskXP / subjects.length);
  const remainder = taskXP - perSubject * subjects.length;
  const dist: Record<string, number> = {};
  subjects.forEach((s, i) => { dist[s] = perSubject + (i === 0 ? remainder : 0); });
  return dist;
}

// ── Pillar mapping: V2 keys -> backend values ──

const PILLAR_DB_VALUES: Record<string, string> = {
  stem: 'STEM & Logic',
  art: 'Arts & Creativity',
  communication: 'Language & Communication',
  civics: 'Society & Culture',
  wellness: 'Life & Wellness',
};

// ── Component ──

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function CreateQuestModal({ visible, onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormData>(initialFormData());
  const [subjects, setSubjects] = useState<SchoolSubject[]>(FALLBACK_SUBJECTS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    api.get('/api/admin/school-subjects').then(({ data }) => {
      if (data.school_subjects?.length) setSubjects(data.school_subjects);
    }).catch(() => {});
  }, [visible]);

  const handleClose = () => {
    setForm(initialFormData());
    setErrors({});
    onClose();
  };

  // ── Task management ──

  const updateTask = (index: number, field: keyof QuestTask, value: any) => {
    setForm((prev) => {
      const tasks = [...prev.tasks];
      tasks[index] = { ...tasks[index], [field]: value };
      if (field === 'pillar') tasks[index].school_subjects = [];
      return { ...prev, tasks };
    });
    const errKey = `task_${index}_${field}`;
    if (errors[errKey]) {
      setErrors((prev) => { const n = { ...prev }; delete n[errKey]; return n; });
    }
  };

  const addTask = () => {
    setForm((prev) => ({ ...prev, tasks: [...prev.tasks, emptyTask(prev.tasks.length)] }));
  };

  const removeTask = (index: number) => {
    setForm((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((_, i) => i !== index).map((t, i) => ({ ...t, order_index: i })),
    }));
  };

  const toggleSubject = (taskIndex: number, subjectKey: string) => {
    const task = form.tasks[taskIndex];
    const current = task.school_subjects || [];
    const updated = current.includes(subjectKey)
      ? current.filter((s) => s !== subjectKey)
      : [...current, subjectKey];
    // Auto-balance XP distribution across selected subjects
    const dist = balanceSubjectXP(updated, task.xp_value);
    setForm((prev) => {
      const tasks = [...prev.tasks];
      tasks[taskIndex] = { ...tasks[taskIndex], school_subjects: updated, subject_xp_distribution: dist };
      return { ...prev, tasks };
    });
    const errKey = `task_${taskIndex}_school_subjects`;
    if (errors[errKey]) {
      setErrors((prev) => { const n = { ...prev }; delete n[errKey]; return n; });
    }
  };

  const updateSubjectXP = (taskIndex: number, subjectKey: string, xp: number) => {
    const dist = { ...form.tasks[taskIndex].subject_xp_distribution };
    if (xp > 0) dist[subjectKey] = xp;
    else delete dist[subjectKey];
    updateTask(taskIndex, 'subject_xp_distribution', dist);
  };

  // Re-balance when XP value changes
  const updateTaskXP = (index: number, xp: number) => {
    setForm((prev) => {
      const tasks = [...prev.tasks];
      tasks[index] = {
        ...tasks[index],
        xp_value: xp,
        subject_xp_distribution: balanceSubjectXP(tasks[index].school_subjects, xp),
      };
      return { ...prev, tasks };
    });
  };

  // ── Validation ──

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    form.tasks.forEach((task, i) => {
      if (!task.title.trim()) errs[`task_${i}_title`] = 'Task title is required';
      if (!task.pillar) errs[`task_${i}_pillar`] = 'Pillar is required';
      if (!task.school_subjects?.length) errs[`task_${i}_school_subjects`] = 'At least one subject required';
      if (task.xp_value <= 0) errs[`task_${i}_xp_value`] = 'XP must be positive';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ──

  const handleSubmit = async () => {
    if (!validate()) {
      Alert.alert('Validation Error', 'Please fix all errors before submitting');
      return;
    }
    setSaving(true);
    try {
      // Step 1: Create the quest
      const questData = {
        title: form.title.trim(),
        big_idea: form.big_idea.trim(),
        source: form.source,
        is_active: form.is_active,
        metadata: form.metadata.location_type !== 'anywhere' ? form.metadata : undefined,
      };
      const { data } = await api.post('/api/admin/quests/create', questData);
      const questId = data.quest_id || data.quest?.id;

      // Step 2: Save template tasks if any
      if (questId && form.tasks.length > 0) {
        const tasksPayload = form.tasks.map((task, i) => ({
          title: task.title.trim(),
          description: task.description.trim(),
          pillar: PILLAR_DB_VALUES[task.pillar] || task.pillar,
          xp_value: task.xp_value,
          is_required: task.is_required,
          diploma_subjects: task.school_subjects,
          subject_xp_distribution: task.subject_xp_distribution,
          order_index: i,
        }));
        await api.put(`/api/admin/quests/${questId}/template-tasks`, { tasks: tasksPayload });
      }

      Alert.alert('Success', 'Quest created successfully');
      handleClose();
      onCreated?.();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to create quest');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable onPress={handleClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <Pressable onPress={(e) => e.stopPropagation?.()} style={{ backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 700, maxHeight: '90%', overflow: 'hidden' }}>
          {/* Header */}
          <HStack className="items-center justify-between px-6 py-4" style={{ borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
            <Heading size="lg">Create New Quest</Heading>
            <Pressable onPress={handleClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </Pressable>
          </HStack>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            <VStack space="lg">

              {/* ── Quest Details ── */}
              <VStack space="xs">
                <Heading size="md">Quest Details</Heading>
                <Divider />
              </VStack>

              {/* Title */}
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-semibold">Quest Title <UIText size="sm" className="text-red-500">*</UIText></UIText>
                <TextInput
                  value={form.title}
                  onChangeText={(v) => { setForm((p) => ({ ...p, title: v })); if (errors.title) setErrors((e) => { const n = { ...e }; delete n.title; return n; }); }}
                  placeholder="e.g., Build a Community Garden"
                  placeholderTextColor="#9CA3AF"
                  maxLength={200}
                  style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, fontSize: 15, fontFamily: 'Poppins_400Regular', borderWidth: errors.title ? 2 : 1, borderColor: errors.title ? '#EF4444' : '#E5E7EB' }}
                />
                {errors.title && <UIText size="xs" className="text-red-500">{errors.title}</UIText>}
                <UIText size="xs" className="text-typo-400">{form.title.length}/200</UIText>
              </VStack>

              {/* Description */}
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium text-typo-600">Big Idea / Description <UIText size="xs" className="text-typo-400">(optional)</UIText></UIText>
                <TextInput
                  value={form.big_idea}
                  onChangeText={(v) => setForm((p) => ({ ...p, big_idea: v }))}
                  placeholder="Describe the quest's main concept and learning goals"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, fontSize: 14, fontFamily: 'Poppins_400Regular', minHeight: 80, borderWidth: 1, borderColor: '#E5E7EB' }}
                />
              </VStack>

              {/* Status */}
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium text-typo-600">Status</UIText>
                <HStack space="xs">
                  <Pressable
                    onPress={() => setForm((p) => ({ ...p, is_active: true }))}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: form.is_active ? '#16A34A15' : '#F3F4F6', borderWidth: form.is_active ? 1.5 : 0, borderColor: '#16A34A', alignItems: 'center' }}
                  >
                    <UIText size="xs" className={`font-poppins-medium ${form.is_active ? 'text-green-700' : 'text-typo-400'}`}>Active</UIText>
                  </Pressable>
                  <Pressable
                    onPress={() => setForm((p) => ({ ...p, is_active: false }))}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: !form.is_active ? '#EF444415' : '#F3F4F6', borderWidth: !form.is_active ? 1.5 : 0, borderColor: '#EF4444', alignItems: 'center' }}
                  >
                    <UIText size="xs" className={`font-poppins-medium ${!form.is_active ? 'text-red-700' : 'text-typo-400'}`}>Inactive</UIText>
                  </Pressable>
                </HStack>
              </VStack>

              {/* ── Template Tasks Section ── */}
              <VStack space="xs">
                <HStack className="items-center justify-between">
                  <Heading size="md">Template Tasks</Heading>
                  <UIText size="xs" className="text-typo-400 font-poppins-medium">Optional</UIText>
                </HStack>
                <UIText size="xs" className="text-typo-500">Suggested tasks for students. Required tasks are auto-added on enrollment.</UIText>
                <Divider />
              </VStack>

              {form.tasks.map((task, idx) => (
                <Card key={idx} variant="outline" size="md" style={{ borderColor: Object.keys(errors).some((k) => k.startsWith(`task_${idx}`)) ? '#FCA5A5' : '#E5E7EB' }}>
                  <VStack space="md">
                    {/* Task header */}
                    <HStack className="items-center justify-between">
                      <HStack className="items-center gap-3">
                        <UIText size="sm" className="font-poppins-semibold">Task {idx + 1}</UIText>
                        <Pressable
                          onPress={() => updateTask(idx, 'is_required', !task.is_required)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: task.is_required ? '#6D469B15' : '#F3F4F6', borderWidth: 1, borderColor: task.is_required ? '#6D469B' : '#E5E7EB' }}
                        >
                          <Ionicons name={task.is_required ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={task.is_required ? '#6D469B' : '#9CA3AF'} />
                          <UIText size="xs" className={`font-poppins-medium ${task.is_required ? 'text-optio-purple' : 'text-typo-400'}`}>
                            {task.is_required ? 'Required' : 'Optional'}
                          </UIText>
                        </Pressable>
                      </HStack>
                      <Pressable onPress={() => removeTask(idx)} className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center">
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      </Pressable>
                    </HStack>

                    {/* Task title */}
                    <VStack space="xs">
                      <UIText size="xs" className="font-poppins-medium text-typo-600">Title <UIText size="xs" className="text-red-500">*</UIText></UIText>
                      <TextInput
                        value={task.title}
                        onChangeText={(v) => updateTask(idx, 'title', v)}
                        placeholder="e.g., Research local plant species"
                        placeholderTextColor="#9CA3AF"
                        style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, fontSize: 14, fontFamily: 'Poppins_400Regular', borderWidth: errors[`task_${idx}_title`] ? 2 : 1, borderColor: errors[`task_${idx}_title`] ? '#EF4444' : '#E5E7EB' }}
                      />
                      {errors[`task_${idx}_title`] && <UIText size="xs" className="text-red-500">{errors[`task_${idx}_title`]}</UIText>}
                    </VStack>

                    {/* Task description */}
                    <VStack space="xs">
                      <UIText size="xs" className="font-poppins-medium text-typo-600">Description <UIText size="xs" className="text-typo-400">(optional)</UIText></UIText>
                      <TextInput
                        value={task.description}
                        onChangeText={(v) => updateTask(idx, 'description', v)}
                        placeholder="Detailed instructions for students"
                        placeholderTextColor="#9CA3AF"
                        multiline
                        numberOfLines={2}
                        textAlignVertical="top"
                        style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, fontSize: 13, fontFamily: 'Poppins_400Regular', minHeight: 60, borderWidth: 1, borderColor: '#E5E7EB' }}
                      />
                    </VStack>

                    {/* Pillar + XP row */}
                    <HStack space="md">
                      <VStack space="xs" className="flex-1">
                        <UIText size="xs" className="font-poppins-medium text-typo-600">Pillar <UIText size="xs" className="text-red-500">*</UIText></UIText>
                        <HStack className="flex-wrap gap-1.5">
                          {pillarKeys.map((key) => {
                            const p = getPillar(key);
                            const selected = task.pillar === key;
                            return (
                              <Pressable
                                key={key}
                                onPress={() => updateTask(idx, 'pillar', key)}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: selected ? p.color : '#E5E7EB', backgroundColor: selected ? p.color + '15' : '#fff' }}
                              >
                                <Ionicons name={selected ? p.iconFilled : p.icon} size={14} color={selected ? p.color : '#9CA3AF'} />
                                <UIText size="xs" className="font-poppins-medium" style={{ color: selected ? p.color : '#6B7280' }}>{p.label}</UIText>
                              </Pressable>
                            );
                          })}
                        </HStack>
                        {errors[`task_${idx}_pillar`] && <UIText size="xs" className="text-red-500">{errors[`task_${idx}_pillar`]}</UIText>}
                      </VStack>
                      <VStack space="xs" style={{ width: 100 }}>
                        <UIText size="xs" className="font-poppins-medium text-typo-600">XP <UIText size="xs" className="text-red-500">*</UIText></UIText>
                        <TextInput
                          value={String(task.xp_value)}
                          onChangeText={(v) => updateTaskXP(idx, parseInt(v) || 0)}
                          keyboardType="numeric"
                          style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, fontSize: 14, fontFamily: 'Poppins_400Regular', borderWidth: 1, borderColor: errors[`task_${idx}_xp_value`] ? '#EF4444' : '#E5E7EB', textAlign: 'center' }}
                        />
                      </VStack>
                    </HStack>

                    {/* School subjects */}
                    <VStack space="xs">
                      <UIText size="xs" className="font-poppins-medium text-typo-600">School Subjects (Diploma Credit) <UIText size="xs" className="text-red-500">*</UIText></UIText>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {subjects.map((s) => {
                          const selected = task.school_subjects?.includes(s.key);
                          return (
                            <Pressable
                              key={s.key}
                              onPress={() => toggleSubject(idx, s.key)}
                              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: selected ? '#6D469B' : '#E5E7EB', backgroundColor: selected ? '#6D469B15' : '#fff' }}
                            >
                              <UIText size="xs" className={`font-poppins-medium ${selected ? 'text-optio-purple' : 'text-typo-500'}`}>{s.name}</UIText>
                            </Pressable>
                          );
                        })}
                      </View>
                      {errors[`task_${idx}_school_subjects`] && <UIText size="xs" className="text-red-500">{errors[`task_${idx}_school_subjects`]}</UIText>}
                    </VStack>

                    {/* Subject XP Distribution (auto-balanced, editable) */}
                    {task.school_subjects?.length > 0 && (
                      <VStack space="xs" style={{ backgroundColor: '#EFF6FF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE' }}>
                        <UIText size="xs" className="font-poppins-medium text-blue-700">Subject XP Distribution</UIText>
                        <UIText size="xs" className="text-typo-500">Auto-balanced from task XP. Adjust if needed.</UIText>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                          {task.school_subjects.map((sk) => {
                            const subj = subjects.find((s) => s.key === sk);
                            return (
                              <HStack key={sk} className="items-center gap-2">
                                <UIText size="xs" className="font-poppins-medium text-typo-700">{subj?.name || sk}:</UIText>
                                <TextInput
                                  value={String(task.subject_xp_distribution[sk] || '')}
                                  onChangeText={(v) => updateSubjectXP(idx, sk, parseInt(v) || 0)}
                                  keyboardType="numeric"
                                  placeholder="0"
                                  placeholderTextColor="#9CA3AF"
                                  style={{ width: 60, backgroundColor: '#fff', borderRadius: 8, padding: 6, fontSize: 13, fontFamily: 'Poppins_400Regular', borderWidth: 1, borderColor: '#D1D5DB', textAlign: 'center' }}
                                />
                              </HStack>
                            );
                          })}
                        </View>
                      </VStack>
                    )}
                  </VStack>
                </Card>
              ))}

              {/* Add task button */}
              <Pressable
                onPress={addTask}
                className="self-center flex-row items-center gap-2 px-6 py-3 rounded-xl active:opacity-80"
                style={{ backgroundColor: '#6D469B' }}
              >
                <Ionicons name="add" size={18} color="white" />
                <UIText size="sm" className="text-white font-poppins-medium">{form.tasks.length === 0 ? 'Add a Template Task' : 'Add Another Task'}</UIText>
              </Pressable>

              {/* ── Metadata Section ── */}
              <VStack space="xs">
                <Heading size="md">Metadata <UIText size="xs" className="text-typo-400 font-poppins-regular">(optional)</UIText></Heading>
                <Divider />
              </VStack>

              {/* Location type */}
              <VStack space="xs">
                <UIText size="xs" className="font-poppins-medium text-typo-600">Location Type</UIText>
                <HStack className="flex-wrap gap-1.5">
                  {LOCATION_TYPES.map((lt) => (
                    <Pressable
                      key={lt.value}
                      onPress={() => setForm((p) => ({ ...p, metadata: { ...p.metadata, location_type: lt.value } }))}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: form.metadata.location_type === lt.value ? '#6D469B' : '#E5E7EB', backgroundColor: form.metadata.location_type === lt.value ? '#6D469B15' : '#fff' }}
                    >
                      <UIText size="xs" className={`font-poppins-medium ${form.metadata.location_type === lt.value ? 'text-optio-purple' : 'text-typo-500'}`}>{lt.label}</UIText>
                    </Pressable>
                  ))}
                </HStack>
              </VStack>

              {form.metadata.location_type === 'specific_location' && (
                <HStack space="md">
                  <VStack space="xs" className="flex-1">
                    <UIText size="xs" className="font-poppins-medium text-typo-600">Venue Name</UIText>
                    <TextInput
                      value={form.metadata.venue_name}
                      onChangeText={(v) => setForm((p) => ({ ...p, metadata: { ...p.metadata, venue_name: v } }))}
                      placeholder="e.g., Community Center"
                      placeholderTextColor="#9CA3AF"
                      style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, fontSize: 13, fontFamily: 'Poppins_400Regular', borderWidth: 1, borderColor: '#E5E7EB' }}
                    />
                  </VStack>
                  <VStack space="xs" className="flex-1">
                    <UIText size="xs" className="font-poppins-medium text-typo-600">Address</UIText>
                    <TextInput
                      value={form.metadata.location_address}
                      onChangeText={(v) => setForm((p) => ({ ...p, metadata: { ...p.metadata, location_address: v } }))}
                      placeholder="Full address"
                      placeholderTextColor="#9CA3AF"
                      style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, fontSize: 13, fontFamily: 'Poppins_400Regular', borderWidth: 1, borderColor: '#E5E7EB' }}
                    />
                  </VStack>
                </HStack>
              )}

              {/* Seasonal dates */}
              <HStack space="md">
                <VStack space="xs" className="flex-1">
                  <UIText size="xs" className="font-poppins-medium text-typo-600">Seasonal Start</UIText>
                  <TextInput
                    value={form.metadata.seasonal_start}
                    onChangeText={(v) => setForm((p) => ({ ...p, metadata: { ...p.metadata, seasonal_start: v } }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#9CA3AF"
                    style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, fontSize: 13, fontFamily: 'Poppins_400Regular', borderWidth: 1, borderColor: '#E5E7EB' }}
                  />
                </VStack>
                <VStack space="xs" className="flex-1">
                  <UIText size="xs" className="font-poppins-medium text-typo-600">Seasonal End</UIText>
                  <TextInput
                    value={form.metadata.seasonal_end}
                    onChangeText={(v) => setForm((p) => ({ ...p, metadata: { ...p.metadata, seasonal_end: v } }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#9CA3AF"
                    style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, fontSize: 13, fontFamily: 'Poppins_400Regular', borderWidth: 1, borderColor: '#E5E7EB' }}
                  />
                </VStack>
              </HStack>

            </VStack>
          </ScrollView>

          {/* Footer */}
          <HStack className="justify-end gap-3 px-6 py-4" style={{ borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
            <Button variant="outline" size="md" onPress={handleClose} disabled={saving}>
              <ButtonText>Cancel</ButtonText>
            </Button>
            <Button size="md" onPress={handleSubmit} loading={saving} disabled={saving}>
              <ButtonText>{saving ? 'Creating...' : 'Create Quest'}</ButtonText>
            </Button>
          </HStack>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
