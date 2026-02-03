/**
 * useOrgUsers Hook
 *
 * Provides user filtering, pagination, and bulk operations
 * for organization user management.
 *
 * Usage:
 *   const {
 *     users,
 *     filteredUsers,
 *     paginatedUsers,
 *     searchTerm,
 *     setSearchTerm,
 *     roleFilter,
 *     setRoleFilter,
 *     selectedUsers,
 *     toggleSelection,
 *     selectAll,
 *     clearSelection,
 *     currentPage,
 *     totalPages,
 *     bulkRemove,
 *     removeUser,
 *     updateUser
 *   } = useOrgUsers({ orgId, users: initialUsers, usersPerPage: 25 });
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

export function useOrgUsers({
  orgId,
  users: initialUsers = [],
  usersPerPage = 25,
  onUpdate
} = {}) {
  // Local users state (can be updated externally via setUsers)
  const [users, setUsers] = useState(initialUsers);

  // Update local users when initialUsers changes
  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  // Filtering state
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Selection state
  const [selectedUsers, setSelectedUsers] = useState(new Set());

  // Loading states
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [removingUserId, setRemovingUserId] = useState(null);

  // Filter users by search term and role
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const searchLower = searchTerm.toLowerCase();
      const fullName = user.display_name || `${user.first_name || ''} ${user.last_name || ''}`.trim();
      const matchesSearch = (
        fullName.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower)
      );
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, roleFilter]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / usersPerPage));
  const validPage = Math.min(currentPage, totalPages);

  // Paginated users
  const paginatedUsers = useMemo(() => {
    const startIndex = (validPage - 1) * usersPerPage;
    return filteredUsers.slice(startIndex, startIndex + usersPerPage);
  }, [filteredUsers, validPage, usersPerPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter]);

  // Selection handlers
  const toggleSelection = useCallback((userId) => {
    setSelectedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedUsers.size === paginatedUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(paginatedUsers.map(u => u.id)));
    }
  }, [selectedUsers.size, paginatedUsers]);

  const clearSelection = useCallback(() => {
    setSelectedUsers(new Set());
  }, []);

  const isSelected = useCallback((userId) => {
    return selectedUsers.has(userId);
  }, [selectedUsers]);

  // Check selection state
  const selectedCount = selectedUsers.size;
  const isAllSelected = paginatedUsers.length > 0 && selectedUsers.size === paginatedUsers.length;
  const isSomeSelected = selectedUsers.size > 0 && selectedUsers.size < paginatedUsers.length;

  // Remove a single user
  const removeUser = useCallback(async (userId) => {
    if (!orgId || !userId) return false;

    try {
      setRemovingUserId(userId);
      await api.post(`/api/admin/organizations/${orgId}/users/remove`, {
        user_id: userId
      });

      // Update local state
      setUsers(prev => prev.filter(u => u.id !== userId));
      setSelectedUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });

      onUpdate?.();
      return true;
    } catch (error) {
      console.error('Failed to remove user:', error);
      toast.error(error.response?.data?.error || 'Failed to remove user');
      return false;
    } finally {
      setRemovingUserId(null);
    }
  }, [orgId, onUpdate]);

  // Bulk remove users
  const bulkRemove = useCallback(async (userIds = Array.from(selectedUsers)) => {
    if (!orgId || userIds.length === 0) return false;

    try {
      setBulkActionLoading(true);
      const response = await api.post(`/api/admin/organizations/${orgId}/users/bulk-remove`, {
        user_ids: userIds
      });

      const { removed, failed } = response.data;
      toast.success(`Removed ${removed} user(s)${failed > 0 ? `, ${failed} failed` : ''}`);

      // Update local state
      const removedSet = new Set(userIds);
      setUsers(prev => prev.filter(u => !removedSet.has(u.id)));
      setSelectedUsers(new Set());

      onUpdate?.();
      return { removed, failed };
    } catch (error) {
      console.error('Failed to bulk remove users:', error);
      toast.error(error.response?.data?.error || 'Failed to remove users');
      return false;
    } finally {
      setBulkActionLoading(false);
    }
  }, [orgId, selectedUsers, onUpdate]);

  // Update a user's role or other properties
  const updateUser = useCallback(async (userId, updates) => {
    if (!orgId || !userId) return false;

    try {
      await api.put(`/api/admin/users/${userId}`, updates);

      // Update local state
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, ...updates } : u
      ));

      onUpdate?.();
      return true;
    } catch (error) {
      console.error('Failed to update user:', error);
      toast.error(error.response?.data?.error || 'Failed to update user');
      return false;
    }
  }, [orgId, onUpdate]);

  // Get available roles from users
  const availableRoles = useMemo(() => {
    const roles = new Set(users.map(u => u.role).filter(Boolean));
    return ['all', ...Array.from(roles).sort()];
  }, [users]);

  // Pagination helpers
  const goToPage = useCallback((page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const nextPage = useCallback(() => {
    if (validPage < totalPages) {
      setCurrentPage(validPage + 1);
    }
  }, [validPage, totalPages]);

  const prevPage = useCallback(() => {
    if (validPage > 1) {
      setCurrentPage(validPage - 1);
    }
  }, [validPage]);

  return {
    // Users data
    users,
    setUsers,
    filteredUsers,
    paginatedUsers,

    // Filtering
    searchTerm,
    setSearchTerm,
    roleFilter,
    setRoleFilter,
    availableRoles,

    // Pagination
    currentPage,
    setCurrentPage: goToPage,
    totalPages,
    nextPage,
    prevPage,
    canGoNext: validPage < totalPages,
    canGoPrev: validPage > 1,
    usersPerPage,

    // Selection
    selectedUsers,
    selectedUserIds: Array.from(selectedUsers),
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
    selectedCount,
    isAllSelected,
    isSomeSelected,

    // Actions
    removeUser,
    bulkRemove,
    updateUser,

    // Loading states
    bulkActionLoading,
    removingUserId
  };
}

export default useOrgUsers;
