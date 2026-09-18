/**
 * DiplomaCreditTracker - Shows diploma credit requests with status tracking.
 *
 * Fetches from /api/tasks/my-credit-requests and displays requests grouped by status
 * (grow_this, the two pending states, finalized). Expandable cards show the
 * subject breakdown and the reviewer's note.
 *
 * Approved credit is not actionable, but the note a reviewer types on Approve
 * lives on the review round and this tab is the only place a student reads
 * it. The list previews the newest few: approved credit accumulates for as
 * long as the student is enrolled, and the profile has other things on it.
 */

import React, { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  VStack, HStack, UIText, Card, Badge, BadgeText, Skeleton,
} from '../ui';

interface CreditRequest {
  completion_id: string;
  task_id: string;
  quest_id: string;
  task_title: string;
  quest_title: string;
  pillar: string;
  xp_value: number;
  diploma_status: 'pending_review' | 'pending_org_approval' | 'finalized' | 'grow_this';
  subjects: Record<string, number>;
  revision_number: number;
  credit_requested_at: string;
  latest_feedback: string | null;
  finalized_at: string | null;
}

const PENDING_STATUSES = ['pending_review', 'pending_org_approval'];
const APPROVED_PREVIEW = 8;

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  pending_org_approval: { label: 'Awaiting Org Review', bg: 'bg-purple-100', text: 'text-purple-800', icon: 'time-outline' },
  pending_review: { label: 'Awaiting Review', bg: 'bg-amber-100', text: 'text-amber-800', icon: 'time-outline' },
  finalized: { label: 'Approved', bg: 'bg-green-100', text: 'text-green-800', icon: 'checkmark-circle-outline' },
  grow_this: { label: 'Grow This', bg: 'bg-blue-100', text: 'text-blue-800', icon: 'refresh-outline' },
};

export function DiplomaCreditTracker() {
  const c = useThemeColors();
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAllApproved, setShowAllApproved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/tasks/my-credit-requests');
        const items = data.data?.credit_requests || [];
        setRequests(items);

        // Auto-select first actionable tab; with nothing to do, the newest
        // approvals and any note that came with them.
        if (items.length > 0) {
          const has = (status: string) => items.some((r: CreditRequest) => r.diploma_status === status);
          if (has('grow_this')) setFilter('grow_this');
          else if (has('pending_org_approval')) setFilter('pending_org_approval');
          else if (has('pending_review')) setFilter('pending_review');
          else if (has('finalized')) setFilter('finalized');
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <Skeleton className="h-24 rounded-xl" />;
  }

  if (requests.length === 0) return null;

  const growCount = requests.filter((r) => r.diploma_status === 'grow_this').length;
  const pendingCount = requests.filter((r) => PENDING_STATUSES.includes(r.diploma_status)).length;
  const approvedCount = requests.filter((r) => r.diploma_status === 'finalized').length;
  const allCaughtUp = growCount === 0 && pendingCount === 0;
  const filtered = filter ? requests.filter((r) => r.diploma_status === filter) : [];
  const previewCapped = filter === 'finalized' && !showAllApproved && filtered.length > APPROVED_PREVIEW;
  const visible = previewCapped ? filtered.slice(0, APPROVED_PREVIEW) : filtered;

  const countOf = (status: string) => requests.filter((r) => r.diploma_status === status).length;
  const FILTER_TABS = [
    { key: 'grow_this', label: 'Grow This', count: growCount },
    { key: 'pending_org_approval', label: 'Awaiting Org Review', count: countOf('pending_org_approval') },
    { key: 'pending_review', label: 'Awaiting Review', count: countOf('pending_review') },
    { key: 'finalized', label: 'Approved', count: approvedCount },
  ].filter((tab) => tab.count > 0);

  return (
    <Card variant="elevated" size="md">
      <VStack space="md">
        {/* Header */}
        <HStack className="items-center gap-2">
          <Ionicons name="school-outline" size={20} color={c.brand} />
          <UIText size="md" className="font-poppins-bold">Diploma Credit Tracker</UIText>
          {growCount > 0 ? (
            <Badge action="info"><BadgeText>{growCount} to revise</BadgeText></Badge>
          ) : pendingCount > 0 ? (
            <Badge action="warning"><BadgeText>{pendingCount} awaiting</BadgeText></Badge>
          ) : null}
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 ml-auto">
            {allCaughtUp ? 'All caught up!' : `${approvedCount} approved`}
          </UIText>
        </HStack>

        {allCaughtUp && approvedCount === 0 ? (
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center py-2">
            All caught up! Complete tasks and request diploma credit to track progress here.
          </UIText>
        ) : (
          <>
            {/* Filter tabs, once there is more than one category to switch between */}
            {FILTER_TABS.length > 1 && (
              <HStack space="xs" className="flex-wrap">
                {FILTER_TABS.map((tab) => (
                  <Pressable key={tab.key} onPress={() => setFilter(tab.key)} accessibilityRole="tab" accessibilityState={{ selected: filter === tab.key }}>
                    <View className={`px-3 py-1.5 rounded-full ${filter === tab.key ? 'bg-optio-purple' : 'bg-surface-200 dark:bg-dark-surface-300'}`}>
                      <UIText size="xs" className={`font-poppins-medium ${filter === tab.key ? 'text-white' : 'text-typo-500 dark:text-dark-typo-500'}`}>
                        {tab.label} ({tab.count})
                      </UIText>
                    </View>
                  </Pressable>
                ))}
              </HStack>
            )}

            {/* Credit request list */}
            {filtered.length === 0 ? (
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center py-3">
                No credit requests in this category.
              </UIText>
            ) : (
              <VStack space="sm">
                {visible.map((req) => {
                  const config = STATUS_CONFIG[req.diploma_status] || STATUS_CONFIG.pending_review;
                  const isExpanded = expandedId === req.completion_id;
                  const subjectEntries = req.subjects ? Object.entries(req.subjects) : [];
                  const totalSubjectXP = subjectEntries.reduce((sum, [, xp]) => sum + xp, 0);

                  return (
                    <View key={req.completion_id} className="border border-surface-200 dark:border-dark-surface-300 rounded-lg overflow-hidden">
                      <Pressable onPress={() => setExpandedId(isExpanded ? null : req.completion_id)} className="p-3">
                        <HStack className="items-center gap-3">
                          <Ionicons
                            name={config.icon as any}
                            size={20}
                            color={req.diploma_status === 'finalized' ? '#16A34A' : req.diploma_status === 'grow_this' ? '#2563EB' : '#D97706'}
                          />
                          <VStack className="flex-1 min-w-0">
                            <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>{req.task_title}</UIText>
                            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{req.quest_title}</UIText>
                          </VStack>
                          <HStack className="items-center gap-2">
                            <View className={`px-2 py-0.5 rounded-full ${config.bg}`}>
                              <UIText size="xs" className={`font-poppins-medium ${config.text}`}>{config.label}</UIText>
                            </View>
                            {totalSubjectXP > 0 && (
                              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{totalSubjectXP} XP</UIText>
                            )}
                            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={c.iconMuted} />
                          </HStack>
                        </HStack>
                      </Pressable>

                      {isExpanded && (
                        <View className="border-t border-surface-100 dark:border-dark-surface-300 p-3 bg-surface-50 dark:bg-dark-surface-50">
                          <VStack space="sm">
                            {/* Subject breakdown */}
                            {subjectEntries.length > 0 && (
                              <VStack space="xs">
                                <UIText size="xs" className="font-poppins-medium text-typo-500 dark:text-dark-typo-500">Subject Credits:</UIText>
                                <HStack className="flex-wrap gap-1">
                                  {subjectEntries.map(([subject, xp]) => (
                                    <View key={subject} className="px-2 py-0.5 bg-white dark:bg-dark-surface-100 border border-surface-200 dark:border-dark-surface-300 rounded">
                                      <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">
                                        {subject.replace(/_/g, ' ')}: {xp} XP
                                      </UIText>
                                    </View>
                                  ))}
                                </HStack>
                              </VStack>
                            )}

                            {/* The reviewer's note: what to grow, or what was
                                good about it. An approval without one shows nothing. */}
                            {req.diploma_status === 'grow_this' && req.latest_feedback && (
                              <View className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <UIText size="xs" className="font-poppins-medium text-blue-800 mb-1">Teacher Feedback:</UIText>
                                <UIText size="sm" className="text-blue-900">{req.latest_feedback}</UIText>
                              </View>
                            )}
                            {req.diploma_status === 'finalized' && req.latest_feedback && (
                              <View className="bg-green-50 border border-green-200 rounded-lg p-3">
                                <UIText size="xs" className="font-poppins-medium text-green-800 mb-1">Teacher Feedback:</UIText>
                                <UIText size="sm" className="text-green-900">{req.latest_feedback}</UIText>
                              </View>
                            )}

                            {/* Actions */}
                            <HStack className="items-center gap-2">
                              {req.diploma_status === 'grow_this' && req.quest_id && (
                                <Pressable
                                  onPress={() => router.push(`/(app)/quests/${req.quest_id}`)}
                                  className="px-3 py-1.5 bg-optio-purple rounded-md"
                                >
                                  <UIText size="xs" className="text-white font-poppins-medium">Revise & Resubmit</UIText>
                                </Pressable>
                              )}
                              {req.revision_number > 1 && (
                                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Round {req.revision_number}</UIText>
                              )}
                              {req.diploma_status === 'finalized' && req.finalized_at ? (
                                <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300 ml-auto">
                                  Approved {new Date(req.finalized_at).toLocaleDateString()}
                                </UIText>
                              ) : req.credit_requested_at ? (
                                <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300 ml-auto">
                                  {new Date(req.credit_requested_at).toLocaleDateString()}
                                </UIText>
                              ) : null}
                            </HStack>
                          </VStack>
                        </View>
                      )}
                    </View>
                  );
                })}
                {previewCapped && (
                  <Pressable onPress={() => setShowAllApproved(true)} className="py-2 items-center">
                    <UIText size="xs" className="font-poppins-medium text-optio-purple">
                      Show all {filtered.length} approved
                    </UIText>
                  </Pressable>
                )}
              </VStack>
            )}
          </>
        )}
      </VStack>
    </Card>
  );
}
