/**
 * Factory functions for creating test data.
 * All shapes match the actual API response types from hooks.
 */

import type { User } from '@/src/stores/authStore';
import type { Bounty, BountyClaim } from '@/src/hooks/useBounties';
import type { LearningEvent, InterestTrack, UnifiedTopic } from '@/src/hooks/useJournal';
import type { Child } from '@/src/hooks/useParent';
import type { FeedItem } from '@/src/hooks/useFeed';
import type { Contact, Message, Group } from '@/src/hooks/useMessages';

// ── Users ──

export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'student@test.com',
    display_name: 'Test Student',
    first_name: 'Test',
    last_name: 'Student',
    role: 'student',
    org_role: null,
    organization_id: null,
    total_xp: 1250,
    avatar_url: null,
    date_of_birth: '2010-05-15',
    is_dependent: false,
    managed_by_parent_id: null,
    ...overrides,
  };
}

export function createMockParent(overrides: Partial<User> = {}): User {
  return createMockUser({
    id: 'parent-1',
    email: 'parent@test.com',
    display_name: 'Test Parent',
    first_name: 'Test',
    last_name: 'Parent',
    role: 'parent',
    total_xp: 0,
    date_of_birth: '1985-03-20',
    ...overrides,
  });
}

export function createMockObserver(overrides: Partial<User> = {}): User {
  return createMockUser({
    id: 'observer-1',
    email: 'observer@test.com',
    display_name: 'Test Observer',
    first_name: 'Test',
    last_name: 'Observer',
    role: 'observer',
    total_xp: 0,
    ...overrides,
  });
}

// ── Bounties ──

export function createMockBounty(overrides: Partial<Bounty> = {}): Bounty {
  return {
    id: 'bounty-1',
    title: 'Build a Bird Feeder',
    description: 'Design and construct a bird feeder',
    pillar: 'stem',
    xp_reward: 150,
    poster_id: 'parent-1',
    poster_name: 'Test Parent',
    rewards: [{ type: 'xp', value: '150', pillar: 'stem' }],
    deliverables: [{ id: 'd1', text: 'Photo of completed feeder' }],
    status: 'active',
    claims_count: 0,
    created_at: '2026-03-20T10:00:00Z',
    ...overrides,
  };
}

export function createMockClaim(overrides: Partial<BountyClaim> = {}): BountyClaim {
  return {
    id: 'claim-1',
    bounty_id: 'bounty-1',
    student_id: 'user-1',
    status: 'claimed',
    evidence: null,
    bounty: createMockBounty(),
    created_at: '2026-03-21T10:00:00Z',
    ...overrides,
  };
}

// ── Journal ──

export function createMockLearningEvent(overrides: Partial<LearningEvent> = {}): LearningEvent {
  return {
    id: 'event-1',
    user_id: 'user-1',
    title: 'Science Experiment',
    description: 'Conducted an experiment on plant growth',
    pillars: ['stem'],
    event_date: '2026-03-20',
    created_at: '2026-03-20T10:00:00Z',
    source_type: 'realtime',
    evidence_blocks: [],
    topics: [],
    ...overrides,
  };
}

export function createMockTopic(overrides: Partial<UnifiedTopic> = {}): UnifiedTopic {
  return {
    id: 'topic-1',
    name: 'Science Projects',
    type: 'topic',
    color: '#2469D1',
    icon: 'flask-outline',
    moment_count: 5,
    ...overrides,
  };
}

export function createMockTrack(overrides: Partial<InterestTrack> = {}): InterestTrack {
  return {
    id: 'track-1',
    name: 'Robotics',
    description: 'Building and programming robots',
    color: '#2469D1',
    icon: 'hardware-chip-outline',
    moment_count: 8,
    evolved_to_quest_id: null,
    created_at: '2026-01-10T10:00:00Z',
    ...overrides,
  };
}

// ── Parent ──

export function createMockChild(overrides: Partial<Child> = {}): Child {
  return {
    id: 'child-1',
    display_name: 'Jane Bowman',
    first_name: 'Jane',
    last_name: 'Bowman',
    avatar_url: null,
    total_xp: 850,
    is_dependent: true,
    date_of_birth: '2012-08-15',
    role: 'student',
    ...overrides,
  };
}

export function createMockChild13Plus(overrides: Partial<Child> = {}): Child {
  return createMockChild({
    id: 'child-13plus',
    display_name: 'Alex Bowman',
    first_name: 'Alex',
    date_of_birth: '2010-01-15',
    ...overrides,
  });
}

export function createMockChildUnder13(overrides: Partial<Child> = {}): Child {
  return createMockChild({
    id: 'child-under13',
    display_name: 'Sam Bowman',
    first_name: 'Sam',
    date_of_birth: '2016-06-20',
    ...overrides,
  });
}

// ── Feed ──

export function createMockFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    type: 'task_completed',
    id: 'tc_feed-1',
    timestamp: '2026-03-20T10:00:00Z',
    student: { id: 'user-1', display_name: 'Test Student', avatar_url: null },
    task: {
      id: 'task-1',
      title: 'Completed Math Quiz',
      pillar: 'stem',
      xp_value: 50,
      quest_id: 'quest-1',
      quest_title: 'Math Mastery',
    },
    evidence: { type: 'text', preview_text: 'Solved all problems correctly' },
    likes_count: 2,
    comments_count: 1,
    user_has_liked: false,
    is_confidential: false,
    ...overrides,
  };
}

// ── Messages ──

export function createMockContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'advisor-1',
    display_name: 'Ms. Smith',
    first_name: 'Jane',
    last_name: 'Smith',
    avatar_url: null,
    role: 'advisor',
    relationship: 'advisor',
    ...overrides,
  };
}

export function createMockMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    sender_id: 'user-1',
    recipient_id: 'advisor-1',
    message_content: 'Hello, I have a question about the assignment.',
    created_at: '2026-03-25T10:00:00Z',
    read_at: null,
    ...overrides,
  };
}

export function createMockGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'group-1',
    name: 'Science Study Group',
    description: 'Group for science project collaboration',
    created_by: 'advisor-1',
    member_count: 4,
    last_message_at: '2026-03-25T09:00:00Z',
    last_message_preview: 'Great work everyone!',
    unread_count: 0,
    ...overrides,
  };
}

export function createMockConversation(overrides: any = {}) {
  return {
    id: 'conv-1',
    other_user: {
      id: 'advisor-1',
      display_name: 'Ms. Smith',
      first_name: 'Jane',
      last_name: 'Smith',
      avatar_url: null,
      role: 'advisor',
    },
    last_message_at: '2026-03-25T10:00:00Z',
    last_message_preview: 'See you in class!',
    unread_count: 1,
    ...overrides,
  };
}
