/**
 * OpenEd Academy credit dashboard (PRD 4.6 + 4.4).
 *
 * Per-student view of diploma progress: overall credits vs the pathway's 24,
 * foundation/elective split, weighted + unweighted GPA, and a per-requirement
 * breakdown. Parents add courses to requirement slots, then self-attest
 * completion with an A-F grade and optional honors/AP/IB weighting.
 *
 * Params: studentId (required), studentName (optional).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Modal, Pressable, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScrollPageLayout } from '@/src/components/layouts/ScrollPageLayout';
import { VStack, HStack, UIText, Button, ButtonText, Card } from '@/src/components/ui';
import { oeaAPI } from '@/src/services/api';
import { extractApiError } from '@/src/services/apiError';
import type {
  CreditsResponse, OEACredit, RequirementProgress, LetterGrade,
} from '@/src/components/oea/types';

const GRADES: LetterGrade[] = ['A', 'B', 'C', 'D', 'F'];

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View className="h-3 rounded-full bg-surface-200 overflow-hidden">
      <View className="h-3 rounded-full bg-optio-purple" style={{ width: `${clamped}%` }} />
    </View>
  );
}

function GradePill({ credit }: { credit: OEACredit }) {
  if (credit.status !== 'complete') {
    return (
      <View className="px-2 py-1 rounded-full bg-amber-100">
        <UIText size="xs" className="text-amber-800">In progress</UIText>
      </View>
    );
  }
  return (
    <HStack className="items-center" space="xs">
      {credit.is_weighted && <Ionicons name="star" size={12} color="#B45309" />}
      <View className="px-2 py-1 rounded-full bg-green-100">
        <UIText size="xs" className="text-green-800 font-poppins-semibold">
          {credit.letter_grade ? `Grade ${credit.letter_grade}` : 'Complete'}
        </UIText>
      </View>
    </HStack>
  );
}

export default function CreditsScreen() {
  const { studentId, studentName } = useLocalSearchParams<{ studentId?: string; studentName?: string }>();

  const [data, setData] = useState<CreditsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-course modal state
  const [addFor, setAddFor] = useState<RequirementProgress | null>(null);
  const [newCourse, setNewCourse] = useState('');
  const [newCredits, setNewCredits] = useState('1');

  // Grade / edit modal state
  const [editing, setEditing] = useState<OEACredit | null>(null);
  const [editName, setEditName] = useState('');
  const [editComplete, setEditComplete] = useState(false);
  const [editGrade, setEditGrade] = useState<LetterGrade | null>(null);
  const [editWeighted, setEditWeighted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [openingQuest, setOpeningQuest] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) { setLoading(false); return; }
    try {
      const { data: res } = await oeaAPI.credits(studentId);
      setData(res);
    } catch (err) {
      setError(extractApiError(err, 'Could not load credits.').message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const creditsForReq = (key: string) => (data?.credits || []).filter((c) => c.requirement_key === key);

  const openAdd = (req: RequirementProgress) => {
    setAddFor(req);
    setNewCourse('');
    setNewCredits('1');
  };

  const saveAdd = async () => {
    if (!studentId || !addFor || !newCourse.trim() || saving) return;
    setSaving(true);
    try {
      await oeaAPI.addCredit(studentId, {
        requirement_key: addFor.key,
        course_name: newCourse.trim(),
        credits: Number(newCredits) || 1,
      });
      setAddFor(null);
      await load();
    } catch (err) {
      setError(extractApiError(err, 'Could not add the course.').message);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (credit: OEACredit) => {
    setEditing(credit);
    setEditName(credit.course_name);
    setEditComplete(credit.status === 'complete');
    setEditGrade(credit.letter_grade);
    setEditWeighted(credit.is_weighted);
  };

  // Open the student's quest for this course (work + evidence + journal live
  // there). Creates the quest on first use for credits added before the
  // course-as-quest feature.
  const openQuest = async (credit: OEACredit) => {
    if (openingQuest) return;
    if (credit.quest_id) {
      router.push(`/(app)/quests/${credit.quest_id}` as any);
      return;
    }
    setOpeningQuest(true);
    try {
      const { data } = await oeaAPI.ensureCreditQuest(credit.id);
      if (data?.quest_id) router.push(`/(app)/quests/${data.quest_id}` as any);
    } catch (err) {
      setError(extractApiError(err, 'Could not open the quest.').message);
    } finally {
      setOpeningQuest(false);
    }
  };

  const saveEdit = async () => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      await oeaAPI.updateCredit(editing.id, {
        course_name: editName.trim() || editing.course_name,
        status: editComplete ? 'complete' : 'in_progress',
        letter_grade: editComplete ? editGrade : null,
        is_weighted: editWeighted,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(extractApiError(err, 'Could not save the course.').message);
    } finally {
      setSaving(false);
    }
  };

  const deleteEditing = async () => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      await oeaAPI.deleteCredit(editing.id);
      setEditing(null);
      await load();
    } catch (err) {
      setError(extractApiError(err, 'Could not delete the course.').message);
    } finally {
      setSaving(false);
    }
  };

  const title = studentName ? `${studentName}'s credits` : 'Diploma credits';
  const progress = data?.progress;
  const gpa = data?.gpa;

  return (
    <ScrollPageLayout title={title} loading={loading} maxWidth="max-w-2xl">
      <VStack space="lg">
        {error && (
          <View className="bg-red-50 p-3 rounded-lg">
            <UIText size="sm" className="text-red-600">{error}</UIText>
          </View>
        )}

        {!progress ? (
          <Card variant="outline" size="md">
            <VStack space="md" className="items-center">
              <Ionicons name="git-branch-outline" size={28} color="#6D469B" />
              <UIText size="sm" className="text-typo-600 text-center">
                Choose a diploma pathway first to start tracking credits.
              </UIText>
              <Button size="md" onPress={() => router.push({
                pathname: '/(app)/oea/select-pathway' as any,
                params: { studentId: studentId || '', studentName: studentName || '' },
              })}>
                <ButtonText>Choose a pathway</ButtonText>
              </Button>
            </VStack>
          </Card>
        ) : (
          <>
            {/* Overall progress + GPA */}
            <Card variant="elevated" size="md">
              <VStack space="md">
                <HStack className="items-end justify-between">
                  <UIText size="lg" className="font-poppins-bold text-typo">
                    {progress.total_earned} of {progress.total_required} credits
                  </UIText>
                  <UIText size="sm" className="text-typo-500">{progress.percent_complete}%</UIText>
                </HStack>
                <ProgressBar percent={progress.percent_complete} />
                <HStack className="justify-between">
                  <UIText size="xs" className="text-typo-500">
                    Foundation {progress.foundation_earned}/{progress.foundation_required}
                  </UIText>
                  <UIText size="xs" className="text-typo-500">
                    Elective {progress.elective_earned}/{progress.elective_required}
                  </UIText>
                </HStack>
                {progress.is_complete && (
                  <View className="bg-green-50 border border-green-200 p-2 rounded-lg">
                    <UIText size="sm" className="text-green-800 font-poppins-semibold text-center">
                      All requirements met
                    </UIText>
                  </View>
                )}
                <HStack className="justify-around pt-1">
                  <VStack className="items-center">
                    <UIText size="lg" className="font-poppins-bold text-optio-purple">
                      {gpa?.unweighted ?? '—'}
                    </UIText>
                    <UIText size="xs" className="text-typo-400">Unweighted GPA</UIText>
                  </VStack>
                  <VStack className="items-center">
                    <UIText size="lg" className="font-poppins-bold text-optio-pink">
                      {gpa?.weighted ?? '—'}
                    </UIText>
                    <UIText size="xs" className="text-typo-400">Weighted GPA</UIText>
                  </VStack>
                </HStack>
              </VStack>
            </Card>

            {/* Per-requirement breakdown */}
            {progress.requirements.map((req) => {
              const courses = creditsForReq(req.key);
              return (
                <Card key={req.key} variant="outline" size="md">
                  <VStack space="sm">
                    <HStack className="items-center justify-between">
                      <HStack className="items-center" space="xs">
                        <View className={`w-2 h-2 rounded-full ${
                          req.category === 'foundation' ? 'bg-optio-purple' : 'bg-optio-pink'
                        }`} />
                        <UIText size="md" className="font-poppins-semibold text-typo">{req.label}</UIText>
                        {req.is_met && <Ionicons name="checkmark-circle" size={16} color="#16A34A" />}
                      </HStack>
                      <UIText size="sm" className="text-typo-500">{req.earned}/{req.required}</UIText>
                    </HStack>

                    {courses.map((c) => (
                      <Pressable key={c.id} onPress={() => openEdit(c)}>
                        <HStack className="items-center justify-between py-2 px-1 border-t border-surface-100">
                          <VStack className="flex-1 min-w-0 pr-2">
                            <UIText size="sm" className="text-typo-700" numberOfLines={1}>{c.course_name}</UIText>
                            <UIText size="xs" className="text-typo-400">
                              {c.credits} {c.credits === 1 ? 'credit' : 'credits'}
                            </UIText>
                          </VStack>
                          <GradePill credit={c} />
                        </HStack>
                      </Pressable>
                    ))}

                    <Pressable onPress={() => openAdd(req)} className="pt-1">
                      <HStack className="items-center" space="xs">
                        <Ionicons name="add-circle-outline" size={18} color="#6D469B" />
                        <UIText size="sm" className="text-optio-purple font-poppins-medium">Add course</UIText>
                      </HStack>
                    </Pressable>
                  </VStack>
                </Card>
              );
            })}
          </>
        )}

        <Button variant="link" size="sm" onPress={() => router.back()}>
          <ButtonText>Back</ButtonText>
        </Button>
      </VStack>

      {/* Add-course modal */}
      <Modal visible={!!addFor} transparent animationType="fade" onRequestClose={() => setAddFor(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }} onPress={() => setAddFor(null)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <VStack space="md">
              <UIText size="md" className="font-poppins-semibold text-typo">Add course — {addFor?.label}</UIText>
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Course name</UIText>
                <TextInput
                  value={newCourse}
                  onChangeText={setNewCourse}
                  placeholder="e.g. Algebra I"
                  style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, fontSize: 14 }}
                />
              </VStack>
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Credits</UIText>
                <TextInput
                  value={newCredits}
                  onChangeText={setNewCredits}
                  keyboardType="decimal-pad"
                  style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, fontSize: 14, width: 90 }}
                />
              </VStack>
              <HStack space="sm" className="justify-end">
                <Button variant="outline" size="sm" onPress={() => setAddFor(null)} disabled={saving}>
                  <ButtonText>Cancel</ButtonText>
                </Button>
                <Button size="sm" onPress={saveAdd} loading={saving} disabled={!newCourse.trim()}>
                  <ButtonText>Add</ButtonText>
                </Button>
              </HStack>
            </VStack>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Grade / edit modal */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }} onPress={() => setEditing(null)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <VStack space="md">
              <UIText size="md" className="font-poppins-semibold text-typo">Edit course</UIText>
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Course name</UIText>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, fontSize: 14 }}
                />
              </VStack>

              {/* Mark complete */}
              <Pressable onPress={() => setEditComplete((v) => !v)}>
                <HStack className="items-center" space="sm">
                  <View className={`w-5 h-5 rounded border items-center justify-center ${
                    editComplete ? 'bg-optio-purple border-optio-purple' : 'border-surface-300'
                  }`}>
                    {editComplete && <Ionicons name="checkmark" size={14} color="white" />}
                  </View>
                  <UIText size="sm" className="text-typo-700">Mark complete</UIText>
                </HStack>
              </Pressable>

              {/* Grade selector (only when complete) */}
              {editComplete && (
                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-medium">Grade</UIText>
                  <HStack space="xs">
                    {GRADES.map((g) => (
                      <Pressable key={g} onPress={() => setEditGrade(g)} style={{ flex: 1 }}>
                        <View className={`py-2 rounded-lg items-center border ${
                          editGrade === g ? 'bg-optio-purple border-optio-purple' : 'border-surface-200'
                        }`}>
                          <UIText size="sm" className={editGrade === g ? 'text-white font-poppins-semibold' : 'text-typo-700'}>{g}</UIText>
                        </View>
                      </Pressable>
                    ))}
                  </HStack>

                  {/* Honors / AP / IB */}
                  <Pressable onPress={() => setEditWeighted((v) => !v)} className="pt-1">
                    <HStack className="items-center" space="sm">
                      <View className={`w-5 h-5 rounded border items-center justify-center ${
                        editWeighted ? 'bg-optio-purple border-optio-purple' : 'border-surface-300'
                      }`}>
                        {editWeighted && <Ionicons name="checkmark" size={14} color="white" />}
                      </View>
                      <UIText size="sm" className="text-typo-700">Honors / AP / IB (weighted)</UIText>
                    </HStack>
                  </Pressable>
                </VStack>
              )}

              {/* Student quest: the work, evidence, and journal entries live here,
                  using the same flow as any Optio quest. */}
              <Pressable
                onPress={() => editing && openQuest(editing)}
                disabled={openingQuest}
                className="border-t border-surface-100 pt-3"
              >
                <HStack className="items-center justify-between">
                  <HStack className="items-center flex-1 pr-2" space="sm">
                    <Ionicons name="rocket-outline" size={18} color="#6D469B" />
                    <VStack className="flex-1 min-w-0">
                      <UIText size="sm" className="font-poppins-medium text-typo">
                        {openingQuest ? 'Opening…' : editing?.quest_id ? 'Open quest' : 'Start quest'}
                      </UIText>
                      <UIText size="xs" className="text-typo-400">
                        Add work, evidence, and journal entries in the app
                      </UIText>
                    </VStack>
                  </HStack>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </HStack>
              </Pressable>

              <HStack className="items-center justify-between pt-1">
                <Pressable onPress={deleteEditing} disabled={saving}>
                  <UIText size="sm" className="text-red-600">Delete</UIText>
                </Pressable>
                <HStack space="sm">
                  <Button variant="outline" size="sm" onPress={() => setEditing(null)} disabled={saving}>
                    <ButtonText>Cancel</ButtonText>
                  </Button>
                  <Button size="sm" onPress={saveEdit} loading={saving}>
                    <ButtonText>Save</ButtonText>
                  </Button>
                </HStack>
              </HStack>
            </VStack>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollPageLayout>
  );
}
