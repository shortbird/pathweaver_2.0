/**
 * Admin hooks - users, quests, organizations management.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

// ── Users ──

export interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  role: string;
  org_role: string | null;
  organization_id: string | null;
  total_xp: number;
  is_dependent: boolean;
  created_at: string;
  last_active: string | null;
  avatar_url: string | null;
}

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const perPage = 20;

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { page, per_page: perPage, sort: 'last_active', order: 'desc' };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      const { data } = await api.get('/api/admin/users', { params });
      setUsers(data.users || data.data || []);
      setTotal(data.total || data.meta?.total || 0);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const updateUserRole = async (userId: string, role: string, orgRole?: string) => {
    await api.put(`/api/admin/users/${userId}/role`, { role, org_role: orgRole });
    await fetchUsers();
  };

  const deleteUser = async (userId: string) => {
    await api.delete(`/api/admin/users/${userId}`);
    await fetchUsers();
  };

  const masquerade = async (userId: string) => {
    const { data } = await api.post(`/api/admin/masquerade/${userId}`, {});
    return data;
  };

  const getUserDetail = async (userId: string) => {
    const { data } = await api.get(`/api/admin/users/${userId}`);
    return data.user || data;
  };

  const resetPassword = async (userId: string, newPassword: string) => {
    await api.post(`/api/admin/users/${userId}/reset-password`, { password: newPassword });
  };

  const verifyEmail = async (userId: string) => {
    await api.post(`/api/admin/users/${userId}/verify-email`, {});
  };

  const updateUser = async (userId: string, updates: Record<string, any>) => {
    await api.put(`/api/admin/users/${userId}`, updates);
    await fetchUsers();
  };

  return {
    users, total, loading, page, setPage, search, setSearch,
    roleFilter, setRoleFilter, perPage, totalPages: Math.ceil(total / perPage),
    refetch: fetchUsers, updateUserRole, updateUser, deleteUser, masquerade,
    getUserDetail, resetPassword, verifyEmail,
  };
}

// ── Quests ──

export function useAdminQuests() {
  const [quests, setQuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchQuests = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (search) params.search = search;
      const { data } = await api.get('/api/admin/quests', { params });
      setQuests(data.quests || data.data || data || []);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchQuests(); }, [fetchQuests]);

  const deleteQuest = async (questId: string) => {
    await api.delete(`/api/v3/admin/quests/${questId}`);
    await fetchQuests();
  };

  return { quests, loading, search, setSearch, refetch: fetchQuests, deleteQuest };
}

// ── Organizations ──

export interface Organization {
  id: string;
  name: string;
  slug: string;
  quest_visibility_policy: string;
  is_active: boolean;
  created_at: string;
}

export function useAdminOrganizations() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrgs = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/admin/organizations');
      setOrgs(data.organizations || data || []);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  const createOrg = async (orgData: { name: string; slug: string; quest_visibility_policy?: string }) => {
    await api.post('/api/admin/organizations', orgData);
    await fetchOrgs();
  };

  const deleteOrg = async (orgId: string) => {
    await api.delete(`/api/admin/organizations/${orgId}`);
    await fetchOrgs();
  };

  return { orgs, loading, refetch: fetchOrgs, createOrg, deleteOrg };
}

export function useOrgDetail(orgId: string | null) {
  const [org, setOrg] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrg = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    try {
      setLoading(true);
      const [orgRes, usersRes] = await Promise.allSettled([
        api.get(`/api/admin/organizations/${orgId}`),
        api.get(`/api/admin/organizations/${orgId}/users`),
      ]);
      if (orgRes.status === 'fulfilled') setOrg(orgRes.value.data.organization || orgRes.value.data);
      if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data.users || usersRes.value.data || []);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchOrg(); }, [fetchOrg]);

  return { org, users, loading, refetch: fetchOrg };
}

// ── Flagged Tasks ──

export function useFlaggedTasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/admin/flagged-tasks');
      setTasks(data.tasks || data || []);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const approveTask = async (taskId: string) => {
    await api.post(`/api/admin/flagged-tasks/${taskId}/approve`, {});
    await fetchTasks();
  };

  const deleteTask = async (taskId: string) => {
    await api.delete(`/api/admin/flagged-tasks/${taskId}`);
    await fetchTasks();
  };

  return { tasks, loading, refetch: fetchTasks, approveTask, deleteTask };
}
