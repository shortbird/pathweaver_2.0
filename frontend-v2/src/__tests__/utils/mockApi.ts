/**
 * API mock helper - creates a mock module matching src/services/api.ts shape.
 *
 * Usage in test files:
 *   jest.mock('@/src/services/api', () => require('@/src/__tests__/utils/mockApi').mockApiModule());
 */

export function mockApiModule() {
  const mockGet = jest.fn().mockResolvedValue({ data: {} });
  const mockPost = jest.fn().mockResolvedValue({ data: {} });
  const mockPut = jest.fn().mockResolvedValue({ data: {} });
  const mockDelete = jest.fn().mockResolvedValue({ data: {} });

  const api = {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    defaults: { headers: { common: {} } },
  };

  return {
    __esModule: true,
    default: api,
    api,
    authAPI: {
      login: jest.fn().mockResolvedValue({ data: {} }),
      register: jest.fn().mockResolvedValue({ data: {} }),
      me: jest.fn().mockResolvedValue({ data: {} }),
      refresh: jest.fn().mockResolvedValue({ data: {} }),
      logout: jest.fn().mockResolvedValue({ data: {} }),
      forgotPassword: jest.fn().mockResolvedValue({ data: {} }),
      resetPassword: jest.fn().mockResolvedValue({ data: {} }),
    },
    questAPI: {
      list: jest.fn().mockResolvedValue({ data: {} }),
      get: jest.fn().mockResolvedValue({ data: {} }),
      start: jest.fn().mockResolvedValue({ data: {} }),
      tasks: jest.fn().mockResolvedValue({ data: {} }),
    },
    taskAPI: {
      complete: jest.fn().mockResolvedValue({ data: {} }),
      create: jest.fn().mockResolvedValue({ data: {} }),
      delete: jest.fn().mockResolvedValue({ data: {} }),
    },
    userAPI: {
      profile: jest.fn().mockResolvedValue({ data: {} }),
      updateProfile: jest.fn().mockResolvedValue({ data: {} }),
      xp: jest.fn().mockResolvedValue({ data: {} }),
      badges: jest.fn().mockResolvedValue({ data: {} }),
    },
    messageAPI: {
      conversations: jest.fn().mockResolvedValue({ data: {} }),
      messages: jest.fn().mockResolvedValue({ data: {} }),
      send: jest.fn().mockResolvedValue({ data: {} }),
      markRead: jest.fn().mockResolvedValue({ data: {} }),
      unreadCount: jest.fn().mockResolvedValue({ data: {} }),
      contacts: jest.fn().mockResolvedValue({ data: {} }),
      canMessage: jest.fn().mockResolvedValue({ data: {} }),
    },
    groupAPI: {
      list: jest.fn().mockResolvedValue({ data: {} }),
      get: jest.fn().mockResolvedValue({ data: {} }),
      create: jest.fn().mockResolvedValue({ data: {} }),
      update: jest.fn().mockResolvedValue({ data: {} }),
      addMember: jest.fn().mockResolvedValue({ data: {} }),
      removeMember: jest.fn().mockResolvedValue({ data: {} }),
      leave: jest.fn().mockResolvedValue({ data: {} }),
      messages: jest.fn().mockResolvedValue({ data: {} }),
      sendMessage: jest.fn().mockResolvedValue({ data: {} }),
      markRead: jest.fn().mockResolvedValue({ data: {} }),
      availableMembers: jest.fn().mockResolvedValue({ data: {} }),
    },
  };
}
