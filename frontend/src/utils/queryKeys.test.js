/**
 * Tests for queryKeys.js - React Query key factory
 *
 * Tests:
 * - Query key generation for all resource types
 * - Cache invalidation utilities
 * - Mutation keys
 */

import { describe, it, expect, vi } from 'vitest'
import { queryKeys, mutationKeys } from './queryKeys'

describe('queryKeys.js', () => {
  describe('user query keys', () => {
    it('generates all user keys', () => {
      expect(queryKeys.user.all).toEqual(['user'])
    })

    it('generates profile key with userId', () => {
      const key = queryKeys.user.profile('user-123')
      expect(key).toEqual(['user', 'profile', 'user-123'])
    })

    it('generates dashboard key with userId', () => {
      const key = queryKeys.user.dashboard('user-456')
      expect(key).toEqual(['user', 'dashboard', 'user-456'])
    })

    it('generates settings key with userId', () => {
      const key = queryKeys.user.settings('user-789')
      expect(key).toEqual(['user', 'settings', 'user-789'])
    })

    it('generates subscription key with userId', () => {
      const key = queryKeys.user.subscription('user-abc')
      expect(key).toEqual(['user', 'subscription', 'user-abc'])
    })
  })

  describe('quest query keys', () => {
    it('generates all quests keys', () => {
      expect(queryKeys.quests.all).toEqual(['quests'])
    })

    it('generates list key with filters', () => {
      const filters = { difficulty: 'beginner', pillar: 'stem' }
      const key = queryKeys.quests.list(filters)
      expect(key).toEqual(['quests', 'list', filters])
    })

    it('generates detail key with questId', () => {
      const key = queryKeys.quests.detail('quest-123')
      expect(key).toEqual(['quests', 'detail', 'quest-123'])
    })

    it('generates progress key with userId and questId', () => {
      const key = queryKeys.quests.progress('user-123', 'quest-456')
      expect(key).toEqual(['quests', 'progress', 'user-123', 'quest-456'])
    })

    it('generates active quests key with userId', () => {
      const key = queryKeys.quests.active('user-789')
      expect(key).toEqual(['quests', 'active', 'user-789'])
    })

    it('generates completed quests key with userId', () => {
      const key = queryKeys.quests.completed('user-abc')
      expect(key).toEqual(['quests', 'completed', 'user-abc'])
    })

    it('generates tasks key with questId', () => {
      const key = queryKeys.quests.tasks('quest-xyz')
      expect(key).toEqual(['quests', 'tasks', 'quest-xyz'])
    })
  })

  describe('portfolio query keys', () => {
    it('generates all portfolio keys', () => {
      expect(queryKeys.portfolio.all).toEqual(['portfolio'])
    })

    it('generates user portfolio key with userId', () => {
      const key = queryKeys.portfolio.user('user-123')
      expect(key).toEqual(['portfolio', 'user', 'user-123'])
    })

    it('generates public portfolio key with slug', () => {
      const key = queryKeys.portfolio.public('john-doe')
      expect(key).toEqual(['portfolio', 'public', 'john-doe'])
    })

    it('generates portfolio settings key with userId', () => {
      const key = queryKeys.portfolio.settings('user-456')
      expect(key).toEqual(['portfolio', 'settings', 'user-456'])
    })
  })

  describe('social query keys', () => {
    it('generates all social keys', () => {
      expect(queryKeys.social.all).toEqual(['social'])
    })

    it('generates friends key with userId', () => {
      const key = queryKeys.social.friends('user-123')
      expect(key).toEqual(['social', 'friends', 'user-123'])
    })

    it('generates activity key with userId', () => {
      const key = queryKeys.social.activity('user-456')
      expect(key).toEqual(['social', 'activity', 'user-456'])
    })

    it('generates friend requests key with userId', () => {
      const key = queryKeys.social.friendRequests('user-789')
      expect(key).toEqual(['social', 'friendRequests', 'user-789'])
    })

    it('generates collaborations key with userId', () => {
      const key = queryKeys.social.collaborations('user-abc')
      expect(key).toEqual(['social', 'collaborations', 'user-abc'])
    })

    it('generates quest collaborations key with questId', () => {
      const key = queryKeys.social.questCollaborations('quest-xyz')
      expect(key).toEqual(['social', 'questCollaborations', 'quest-xyz'])
    })
  })

  describe('evidence query keys', () => {
    it('generates all evidence keys', () => {
      expect(queryKeys.evidence.all).toEqual(['evidence'])
    })

    it('generates task evidence key with taskId', () => {
      const key = queryKeys.evidence.task('task-123')
      expect(key).toEqual(['evidence', 'task', 'task-123'])
    })
  })

  describe('admin query keys', () => {
    it('generates all admin keys', () => {
      expect(queryKeys.admin.all).toEqual(['admin'])
    })

    it('generates users key with filters', () => {
      const filters = { role: 'student', page: 1 }
      const key = queryKeys.admin.users(filters)
      expect(key).toEqual(['admin', 'users', filters])
    })

    it('generates quests key with filters', () => {
      const filters = { status: 'published' }
      const key = queryKeys.admin.quests(filters)
      expect(key).toEqual(['admin', 'quests', filters])
    })

    it('generates analytics key with timeRange', () => {
      const timeRange = '30days'
      const key = queryKeys.admin.analytics(timeRange)
      expect(key).toEqual(['admin', 'analytics', timeRange])
    })
  })

  describe('invalidateUser', () => {
    it('invalidates all user queries', () => {
      const mockQueryClient = {
        invalidateQueries: vi.fn(),
      }

      queryKeys.invalidateUser(mockQueryClient)

      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(['user'])
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledTimes(1)
    })

    it('invalidates user-specific queries when userId provided', () => {
      const mockQueryClient = {
        invalidateQueries: vi.fn(),
      }

      queryKeys.invalidateUser(mockQueryClient, 'user-123')

      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(['user'])
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(['quests', 'active', 'user-123'])
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(['quests', 'completed', 'user-123'])
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(['portfolio', 'user', 'user-123'])
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(['social', 'friends', 'user-123'])
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledTimes(5)
    })
  })

  describe('invalidateQuests', () => {
    it('invalidates all quest queries', () => {
      const mockQueryClient = {
        invalidateQueries: vi.fn(),
      }

      queryKeys.invalidateQuests(mockQueryClient)

      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(['quests'])
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledTimes(1)
    })

    it('invalidates quest-specific queries when userId provided', () => {
      const mockQueryClient = {
        invalidateQueries: vi.fn(),
      }

      queryKeys.invalidateQuests(mockQueryClient, 'user-456')

      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(['quests'])
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(['user', 'dashboard', 'user-456'])
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(['portfolio', 'user', 'user-456'])
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledTimes(3)
    })
  })

  describe('invalidateSocial', () => {
    it('invalidates all social queries', () => {
      const mockQueryClient = {
        invalidateQueries: vi.fn(),
      }

      queryKeys.invalidateSocial(mockQueryClient)

      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(['social'])
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledTimes(1)
    })

    it('invalidates social-specific queries when userId provided', () => {
      const mockQueryClient = {
        invalidateQueries: vi.fn(),
      }

      queryKeys.invalidateSocial(mockQueryClient, 'user-789')

      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(['social'])
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith(['user', 'dashboard', 'user-789'])
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledTimes(2)
    })
  })

  describe('mutation keys', () => {
    it('provides updateProfile mutation key', () => {
      expect(mutationKeys.updateProfile).toBe('updateProfile')
    })

    it('provides updateSettings mutation key', () => {
      expect(mutationKeys.updateSettings).toBe('updateSettings')
    })

    it('provides updateSubscription mutation key', () => {
      expect(mutationKeys.updateSubscription).toBe('updateSubscription')
    })

    it('provides enrollQuest mutation key', () => {
      expect(mutationKeys.enrollQuest).toBe('enrollQuest')
    })

    it('provides completeTask mutation key', () => {
      expect(mutationKeys.completeTask).toBe('completeTask')
    })

    it('provides submitEvidence mutation key', () => {
      expect(mutationKeys.submitEvidence).toBe('submitEvidence')
    })

    it('provides abandonQuest mutation key', () => {
      expect(mutationKeys.abandonQuest).toBe('abandonQuest')
    })

    it('provides endQuest mutation key', () => {
      expect(mutationKeys.endQuest).toBe('endQuest')
    })

    it('provides sendFriendRequest mutation key', () => {
      expect(mutationKeys.sendFriendRequest).toBe('sendFriendRequest')
    })

    it('provides acceptFriendRequest mutation key', () => {
      expect(mutationKeys.acceptFriendRequest).toBe('acceptFriendRequest')
    })

    it('provides declineFriendRequest mutation key', () => {
      expect(mutationKeys.declineFriendRequest).toBe('declineFriendRequest')
    })

    it('provides sendCollaboration mutation key', () => {
      expect(mutationKeys.sendCollaboration).toBe('sendCollaboration')
    })

    it('provides acceptCollaboration mutation key', () => {
      expect(mutationKeys.acceptCollaboration).toBe('acceptCollaboration')
    })

    it('provides uploadEvidence mutation key', () => {
      expect(mutationKeys.uploadEvidence).toBe('uploadEvidence')
    })
  })

  describe('query key structure and immutability', () => {
    it('creates new arrays for each call (not sharing references)', () => {
      const key1 = queryKeys.user.profile('user-123')
      const key2 = queryKeys.user.profile('user-123')

      expect(key1).toEqual(key2)
      expect(key1).not.toBe(key2) // Different array instances
    })

    it('handles null/undefined userId gracefully in quest keys', () => {
      const keyNull = queryKeys.quests.active(null)
      const keyUndefined = queryKeys.quests.active(undefined)

      expect(keyNull).toEqual(['quests', 'active', null])
      expect(keyUndefined).toEqual(['quests', 'active', undefined])
    })

    it('handles complex filter objects in list keys', () => {
      const complexFilters = {
        difficulty: ['beginner', 'intermediate'],
        pillars: ['stem', 'art'],
        status: 'active',
        page: 2,
        limit: 20,
      }

      const key = queryKeys.quests.list(complexFilters)

      expect(key).toEqual(['quests', 'list', complexFilters])
      expect(key[2]).toBe(complexFilters) // Same object reference
    })
  })
})
