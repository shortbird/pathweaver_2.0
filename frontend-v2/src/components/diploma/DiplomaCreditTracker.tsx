/**
 * DiplomaCreditTracker - Shows diploma credit requests with status tracking.
 *
 * Fetches from /api/tasks/my-credit-requests and displays requests grouped by status
 * (grow_this, pending_review, approved). Expandable cards show subject breakdown and feedback.
 */

import React, { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
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
  diploma_status: 'pending_review' | 'approved' | 'grow_this';
  subjects: Record<string, number>;
  revision_number: number;
  credit_requested_at: string;
  latest_feedback: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  pending_review: { label: 'Awaiting Review', bg: 'bg-amber-100', text: 'text-amber-800', icon: 'time-outline' },
  approved: { label: 'Approved', bg: 'bg-green-100', text: 'text-green-800', icon: 'checkmark-circle-outline' },
  grow_this: { label: 'Grow This', bg: 'bg-blue-100', text: 'text-blue-800', icon: 'refresh-outline' },
};

export function DiplomaCreditTracker() {
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/tasks/my-credit-requests');
        const items = data.data?.credit_requests || [];
        setRequests(items);

        // Auto-select first actionable tab
        if (items.length > 0) {
          const growCount = items.filter((r: CreditRequest) => r.diploma_status === 'grow_this').length;
          const pendingCount = items.filter((r: CreditRequest) => r.diploma_status === 'pending_review').length;
          if (growCount > 0) setFilter('grow_this');
          else if (pendingCount > 0) setFilter('pending_review');
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
  const pendingCount = requests.filter((r) => r.diploma_status === 'pending_review').length;
  const approvedCount = requests.filter((r) => r.diploma_status === 'approved').length;
  const allCaughtUp = growCount === 0 && pendingCount === 0;
  const filtered = filter ? requests.filter((r) => r.diploma_status === filter) : [];

  const FILTER_TABS = [
    { key: 'grow_this', label: 'Grow This', count: growCount },
    { key: 'pending_review', label: 'Awaiting Review', count: pendingCount },
  ];

  return (
    <Card variant="elevated" size="md">
      <VStack space="md">
        {/* Header */}
        <HStack className="items-center gap-2">
          <Ionicons name="school-outline" size={20} color="#6D469B" />
          <UIText size="md" className="font-poppins-bold">Diploma Credit Tracker</UIText>
          {growCount > 0 ? (
            <Badge action="info"><BadgeText>{growCount} to revise</BadgeText></Badge>
          ) : pendingCount > 0 ? (
            <Badge action="warning"><BadgeText>{pendingCount} awaiting</BadgeText></Badge>
          ) : null}
          <UIText size="xs" className="text-typo-400 ml-auto">
            {allCaughtUp ? 'All caught up!' : `${approvedCount} approved`}
          </UIText>
        </HStack>

        {allCaughtUp ? (
          <UIText size="sm" className="text-typo-400 text-center py-2">
            All caught up! Complete tasks and request diploma credit to track progress here.
          </UIText>
        ) : (
          <>
            {/* Filter tabs */}
            {growCount > 0 && pendingCount > 0 && (
              <HStack space="xs">
                {FILTER_TABS.map((tab) => tab.count > 0 ? (
                  <Pressable key={tab.key} onPress={() => setFilter(tab.key)}>
                    <View className={`px-3 py-1.5 rounded-full ${filter === tab.key ? 'bg-optio-purple' : 'bg-surface-200'}`}>
                      <UIText size="xs" className={`font-poppins-medium ${filter === tab.key ? 'text-white' : 'text-typo-500'}`}>
                        {tab.label} ({tab.count})
                      </UIText>
                    </View>
                  </Pressable>
                ) : null)}
              </HStack>
            )}

            {/* Credit request list */}
            {filtered.length === 0 ? (
              <UIText size="sm" className="text-typo-400 text-center py-3">
                No credit requests in this category.
              </UIText>
            ) : (
              <VStack space="sm">
                {filtered.map((req) => {
                  const config = STATUS_CONFIG[req.diploma_status] || STATUS_CONFIG.pending_review;
                  const isExpanded = expandedId === req.completion_id;
                  const subjectEntries = req.subjects ? Object.entries(req.subjects) : [];
                  const totalSubjectXP = subjectEntries.reduce((sum, [, xp]) => sum + xp, 0);

                  return (
                    <View key={req.completion_id} className="border border-surface-200 rounded-lg overflow-hidden">
                      <Pressable onPress={() => setExpandedId(isExpanded ? null : req.completion_id)} className="p-3">
                        <HStack className="items-center gap-3">
                          <Ionicons
                            name={config.icon as any}
                            size={20}
                            color={req.diploma_status === 'approved' ? '#16A34A' : req.diploma_status === 'grow_this' ? '#2563EB' : '#D97706'}
                          />
                          <VStack className="flex-1 min-w-0">
                            <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>{req.task_title}</UIText>
                            <UIText size="xs" className="text-typo-400" numberOfLines={1}>{req.quest_title}</UIText>
                          </VStack>
                          <HStack className="items-center gap-2">
                            <View className={`px-2 py-0.5 rounded-full ${config.bg}`}>
                              <UIText size="xs" className={`font-poppins-medium ${config.text}`}>{config.label}</UIText>
                            </View>
                            {totalSubjectXP > 0 && (
                              <UIText size="xs" className="text-typo-400">{totalSubjectXP} XP</UIText>
                            )}
                            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" />
                          </HStack>
                        </HStack>
                      </Pressable>

                      {isExpanded && (
                        <View className="border-t border-surface-100 p-3 bg-surface-50">
                          <VStack space="sm">
                            {/* Subject breakdown */}
                            {subjectEntries.length > 0 && (
                              <VStack space="xs">
                                <UIText size="xs" className="font-poppins-medium text-typo-600">Subject Credits:</UIText>
                                <HStack className="flex-wrap gap-1">
                                  {subjectEntries.map(([subject, xp]) => (
                                    <View key={subject} className="px-2 py-0.5 bg-white border border-surface-200 rounded">
                                      <UIText size="xs" className="text-typo-600">
                                        {subject.replace(/_/g, ' ')}: {xp} XP
                                      </UIText>
                                    </View>
                                  ))}
                                </HStack>
                              </VStack>
                            )}

                            {/* Grow This feedback */}
                            {req.diploma_status === 'grow_this' && req.latest_feedback && (
                              <View className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <UIText size="xs" className="font-poppins-medium text-blue-800 mb-1">Advisor Feedback:</UIText>
                                <UIText size="sm" className="text-blue-900">{req.latest_feedback}</UIText>
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
                                <UIText size="xs" className="text-typo-400">Round {req.revision_number}</UIText>
                              )}
                              {req.credit_requested_at ? (
                                <UIText size="xs" className="text-typo-300 ml-auto">
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
              </VStack>
            )}
          </>
        )}
      </VStack>
    </Card>
  );
}
