/**
 * UserConnectionsTab - view & manage a user's advisor / parent-child / observer
 * connections from the mobile admin panel. Mirrors the v1 web
 * UserConnectionsTab (frontend/src/components/admin/UserConnectionsTab.jsx) and
 * calls the same admin endpoints.
 *
 * Admin panel is web-only, so window.confirm() is used for destructive actions
 * (consistent with the rest of admin.tsx).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { toast } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  VStack, HStack, UIText, Card, Button, ButtonText, Input, InputField, InputSlot, InputIcon, Skeleton,
} from '@/src/components/ui';
import type { AdminUser } from '@/src/hooks/useAdmin';

type AddType = 'advisor' | 'parent' | 'student' | 'observer';

interface Connection {
  id: string;
  type: 'advisor' | 'parent' | 'observer';
  direction: 'student' | 'child' | 'advisor' | 'parent' | 'observing' | 'observed_by';
  person: { id: string; name: string; email?: string };
  created_at?: string;
  originalId?: string;       // parent-connection link id
  observerLinkId?: string;   // observer link id
  advisorId?: string;        // advisor id when current user is the student
}

interface Candidate {
  id: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  email?: string;
}

const ADD_BUTTONS: { type: AddType; label: string; tint: string }[] = [
  { type: 'advisor', label: 'Add Teacher', tint: 'amber' },
  { type: 'parent', label: 'Add Parent', tint: 'green' },
  { type: 'student', label: 'Add Student', tint: 'blue' },
  { type: 'observer', label: 'Add Observer', tint: 'purple' },
];

const TINT_CLASSES: Record<string, { btn: string; text: string }> = {
  amber: { btn: 'bg-amber-50 border-amber-200 active:bg-amber-100', text: 'text-amber-700' },
  green: { btn: 'bg-green-50 border-green-200 active:bg-green-100', text: 'text-green-700' },
  blue: { btn: 'bg-blue-50 border-blue-200 active:bg-blue-100', text: 'text-blue-700' },
  purple: { btn: 'bg-optio-purple/10 border-optio-purple/20 active:bg-optio-purple/20', text: 'text-optio-purple' },
};

function badgeClasses(direction: Connection['direction']): string {
  if (direction === 'advisor') return 'bg-amber-100 text-amber-800';
  if (direction === 'parent') return 'bg-green-100 text-green-800';
  if (direction === 'student' || direction === 'child') return 'bg-blue-100 text-blue-800';
  return 'bg-optio-purple/10 text-optio-purple'; // observing / observed_by
}

function directionLabel(direction: Connection['direction']): string {
  switch (direction) {
    case 'student': return 'Student';
    case 'child': return 'Child';
    case 'advisor': return 'Teacher';
    case 'parent': return 'Parent';
    case 'observing': return 'Observing';
    case 'observed_by': return 'Observer';
    default: return '';
  }
}

function personName(p: { first_name?: string; last_name?: string; display_name?: string }): string {
  return `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.display_name || 'Unknown';
}

export function UserConnectionsTab({ user }: { user: AdminUser }) {
  const c = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Connection[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState<AddType | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addLoading, setAddLoading] = useState(false);

  const effectiveRole = user.org_role || user.role || 'student';

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const results: Connection[] = [];

      // User is an advisor -> their assigned students
      if (effectiveRole === 'advisor' || effectiveRole === 'superadmin') {
        try {
          const res = await api.get(`/api/admin/advisors/${user.id}/students`);
          for (const s of res.data.students || []) {
            results.push({
              id: `advisor-${user.id}-${s.id}`, type: 'advisor', direction: 'student',
              person: { id: s.id, name: personName(s), email: s.email }, created_at: s.assigned_at,
            });
          }
        } catch { /* not a registered advisor */ }
      }

      // User is a parent -> their linked children
      try {
        const res = await api.get('/api/admin/parent-connections/links', { params: { parent_id: user.id } });
        for (const link of res.data.links || []) {
          results.push({
            id: `parent-${link.id}`, originalId: link.id, type: 'parent', direction: 'child',
            person: { id: link.student?.id || link.student_user_id, name: personName(link.student || {}), email: link.student?.email },
            created_at: link.created_at,
          });
        }
      } catch { /* not a parent */ }

      // User is a student -> their parents
      try {
        const res = await api.get('/api/admin/parent-connections/links', { params: { student_id: user.id } });
        for (const link of res.data.links || []) {
          results.push({
            id: `parent-of-${link.id}`, originalId: link.id, type: 'parent', direction: 'parent',
            person: { id: link.parent?.id || link.parent_user_id, name: personName(link.parent || {}), email: link.parent?.email },
            created_at: link.created_at,
          });
        }
      } catch { /* no parent links */ }

      // Advisors where this user is the assigned student
      try {
        const allAdvisors = await api.get('/api/admin/advisors');
        for (const advisor of allAdvisors.data.advisors || []) {
          try {
            const studentsRes = await api.get(`/api/admin/advisors/${advisor.id}/students`);
            const match = (studentsRes.data.students || []).find((s: any) => s.id === user.id);
            if (match) {
              results.push({
                id: `advisor-of-${advisor.id}-${user.id}`, type: 'advisor', direction: 'advisor', advisorId: advisor.id,
                person: { id: advisor.id, name: personName(advisor), email: advisor.email }, created_at: match.assigned_at,
              });
            }
          } catch { /* skip */ }
        }
      } catch { /* no advisor data */ }

      // Observer links (both directions)
      try {
        const res = await api.get(`/api/admin/users/${user.id}/observer-links`);
        for (const link of res.data.data?.links || []) {
          const u = link.user || {};
          results.push({
            id: `observer-${link.id}`, observerLinkId: link.id, type: 'observer', direction: link.direction,
            person: { id: u.id, name: personName(u), email: u.email }, created_at: link.created_at,
          });
        }
      } catch { /* no observer links */ }

      // Dedup by type + direction + person id
      const seen = new Set<string>();
      setConnections(results.filter((r) => {
        const key = `${r.type}-${r.direction}-${r.person.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }));
    } catch {
      toast.error('Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, [user.id, effectiveRole]);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const handleRemove = async (conn: Connection) => {
    const name = conn.person.name;
    const msg =
      conn.direction === 'student' ? `Remove ${name} from this user's students?`
      : conn.direction === 'child' ? `Remove parent connection to ${name}?`
      : conn.direction === 'parent' ? `Remove ${name} as parent?`
      : conn.direction === 'observing' ? `Remove observer access to ${name}?`
      : conn.direction === 'observed_by' ? `Remove ${name} as observer?`
      : `Remove ${name} as advisor?`;
    // eslint-disable-next-line no-alert
    if (typeof confirm === 'function' && !confirm(msg)) return;

    try {
      if (conn.type === 'observer') {
        await api.delete(`/api/admin/users/${user.id}/observer-links/${conn.observerLinkId}`);
      } else if (conn.type === 'advisor') {
        if (conn.direction === 'student') {
          await api.delete(`/api/admin/advisors/${user.id}/students/${conn.person.id}`);
        } else {
          await api.delete(`/api/admin/advisors/${conn.advisorId || conn.person.id}/students/${user.id}`);
        }
      } else {
        await api.delete(`/api/admin/parent-connections/links/${conn.originalId}`);
      }
      toast.success('Connection removed');
      loadConnections();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to remove connection');
    }
  };

  const openAddForm = async (type: AddType) => {
    setAddType(type);
    setShowAddForm(true);
    setSearchTerm('');
    setSelectedIds([]);
    setCandidatesLoading(true);
    try {
      let list: Candidate[] = [];
      let excludeDirections: Connection['direction'][] = [];

      if (type === 'student') {
        const res = await api.get('/api/admin/users', { params: { role: 'student', per_page: 200 } });
        list = res.data.users || [];
        excludeDirections = ['student', 'child', 'observing'];
      } else if (type === 'advisor') {
        const res = await api.get('/api/admin/advisors');
        list = res.data.advisors || [];
        excludeDirections = ['advisor'];
      } else if (type === 'parent') {
        const res = await api.get('/api/admin/users', { params: { role: 'parent', per_page: 200 } });
        list = res.data.users || [];
        excludeDirections = ['parent'];
      } else {
        const res = await api.get('/api/admin/users', { params: { per_page: 200 } });
        list = res.data.users || [];
        excludeDirections = ['observed_by'];
      }

      const connectedIds = connections
        .filter((cn) => excludeDirections.includes(cn.direction))
        .map((cn) => cn.person.id);
      setCandidates(list.filter((u) => !connectedIds.includes(u.id) && u.id !== user.id));
    } catch {
      toast.error('Failed to load users');
    } finally {
      setCandidatesLoading(false);
    }
  };

  const handleAdd = async () => {
    if (selectedIds.length === 0 || !addType) return;
    setAddLoading(true);
    try {
      if (addType === 'student') {
        if (effectiveRole === 'advisor' || effectiveRole === 'superadmin') {
          await Promise.all(selectedIds.map((id) => api.post(`/api/admin/advisors/${user.id}/students`, { student_id: id })));
        } else {
          await Promise.all(selectedIds.map((id) =>
            api.post('/api/admin/parent-connections/manual-link', { parent_user_id: user.id, student_user_id: id, admin_notes: '' })));
        }
      } else if (addType === 'advisor') {
        await Promise.all(selectedIds.map((id) => api.post(`/api/admin/advisors/${id}/students`, { student_id: user.id })));
      } else if (addType === 'parent') {
        await Promise.all(selectedIds.map((id) =>
          api.post('/api/admin/parent-connections/manual-link', { parent_user_id: id, student_user_id: user.id, admin_notes: '' })));
      } else {
        await Promise.all(selectedIds.map((id) =>
          api.post(`/api/admin/users/${user.id}/observer-links`, { other_user_id: id, direction: 'observed_by' })));
      }
      toast.success(`Added ${selectedIds.length} connection${selectedIds.length === 1 ? '' : 's'}`);
      setShowAddForm(false);
      loadConnections();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to add connection');
    } finally {
      setAddLoading(false);
    }
  };

  const toggleSelection = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const filteredCandidates = candidates.filter((cand) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return cand.first_name?.toLowerCase().includes(s)
      || cand.last_name?.toLowerCase().includes(s)
      || cand.email?.toLowerCase().includes(s);
  });

  const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  if (loading) {
    return <VStack space="sm">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</VStack>;
  }

  return (
    <VStack space="md">
      {/* Add buttons */}
      <View className="flex flex-row flex-wrap gap-2">
        {ADD_BUTTONS.map(({ type, label, tint }) => {
          const t = TINT_CLASSES[tint];
          return (
            <Pressable key={type} onPress={() => openAddForm(type)}>
              <View className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg border ${t.btn}`}>
                <Ionicons name="person-add-outline" size={14} color={c.icon} />
                <UIText size="xs" className={`font-poppins-medium ${t.text}`}>{label}</UIText>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Connection list */}
      {connections.length === 0 ? (
        <Card variant="filled" size="lg" className="items-center py-8">
          <Ionicons name="people-outline" size={36} color={c.iconMuted} />
          <UIText size="sm" className="font-poppins-medium text-typo-500 mt-2 dark:text-dark-typo-500">No connections</UIText>
          <UIText size="xs" className="text-typo-400 mt-1 dark:text-dark-typo-400">Use the buttons above to add one.</UIText>
        </Card>
      ) : (
        <VStack space="xs">
          {connections.map((conn) => {
            const [bg, text] = badgeClasses(conn.direction).split(' ');
            return (
              <Card key={conn.id} variant="outline" size="sm">
                <HStack className="items-center justify-between">
                  <HStack className="items-center gap-3 flex-1 min-w-0">
                    <View className={`px-2 py-0.5 rounded-full ${bg}`}>
                      <UIText size="xs" className={`font-poppins-medium ${text}`}>{directionLabel(conn.direction)}</UIText>
                    </View>
                    <VStack className="flex-1 min-w-0">
                      <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>{conn.person.name}</UIText>
                      {!!conn.person.email && (
                        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{conn.person.email}</UIText>
                      )}
                    </VStack>
                  </HStack>
                  <HStack className="items-center gap-3 flex-shrink-0 ml-2">
                    {!!conn.created_at && (
                      <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300">{formatDate(conn.created_at)}</UIText>
                    )}
                    <Pressable onPress={() => handleRemove(conn)} className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center active:bg-red-100">
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    </Pressable>
                  </HStack>
                </HStack>
              </Card>
            );
          })}
        </VStack>
      )}

      {/* Inline add form */}
      {showAddForm && (
        <Card variant="filled" size="md">
          <VStack space="sm">
            <HStack className="items-center justify-between">
              <UIText size="sm" className="font-poppins-semibold capitalize">Add {addType}</UIText>
              <Pressable onPress={() => setShowAddForm(false)} className="w-7 h-7 rounded-full bg-surface-200 items-center justify-center dark:bg-dark-surface-300">
                <Ionicons name="close" size={16} color={c.icon} />
              </Pressable>
            </HStack>

            <Input variant="rounded" size="sm">
              <InputSlot className="ml-3"><InputIcon as="search-outline" /></InputSlot>
              <InputField placeholder={`Search ${addType}s...`} value={searchTerm} onChangeText={setSearchTerm} />
            </Input>

            <View className="rounded-xl border border-surface-200 overflow-hidden dark:border-dark-surface-300" style={{ maxHeight: 220 }}>
              {candidatesLoading ? (
                <VStack space="xs" className="p-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</VStack>
              ) : filteredCandidates.length === 0 ? (
                <View className="items-center py-6">
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                    {candidates.length === 0 ? 'No available users' : 'No matches found'}
                  </UIText>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                  {filteredCandidates.map((cand) => {
                    const selected = selectedIds.includes(cand.id);
                    return (
                      <Pressable
                        key={cand.id}
                        onPress={() => toggleSelection(cand.id)}
                        className={`flex-row items-center gap-2.5 p-2.5 ${selected ? 'bg-optio-purple/5' : 'active:bg-surface-100 dark:active:bg-dark-surface-200'}`}
                      >
                        <View className={`w-5 h-5 rounded items-center justify-center ${selected ? 'bg-optio-purple' : 'border-2 border-surface-300 dark:border-dark-surface-400'}`}>
                          {selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                        </View>
                        <VStack className="flex-1 min-w-0">
                          <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>{personName(cand)}</UIText>
                          {!!cand.email && <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{cand.email}</UIText>}
                        </VStack>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <HStack className="justify-end gap-2">
              <Button size="sm" variant="outline" onPress={() => setShowAddForm(false)}><ButtonText>Cancel</ButtonText></Button>
              <Button size="sm" disabled={selectedIds.length === 0 || addLoading} loading={addLoading} onPress={handleAdd}>
                <ButtonText>Add ({selectedIds.length})</ButtonText>
              </Button>
            </HStack>
          </VStack>
        </Card>
      )}
    </VStack>
  );
}
