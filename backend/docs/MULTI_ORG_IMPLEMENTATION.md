# Multi-Organization Implementation Plan

**Status:** 🟡 Phase 1 In Progress
**Created:** 2025-12-07
**Last Updated:** 2025-12-07
**Owner:** Tanner Bowman (Superadmin)

---

## Table of Contents
1. [Overview](#overview)
2. [Architecture Summary](#architecture-summary)
3. [Implementation Phases](#implementation-phases)
4. [Database Schema Changes](#database-schema-changes)
5. [Backend Changes](#backend-changes)
6. [Frontend Changes](#frontend-changes)
7. [Testing Strategy](#testing-strategy)
8. [Rollout Plan](#rollout-plan)
9. [Post-Launch Tasks](#post-launch-tasks)
10. [Cleanup Tasks](#cleanup-tasks)

---

## Overview

### Goal
Transform Optio from a single-tenant platform into a multi-organization platform where different organizations can have controlled access to Optio's quest library and create their own custom quests.

### Key Requirements (Answered Questions)
- ✅ **User-Org Relationship:** One organization per user, all data preserved on transfer
- ✅ **Quest Creation:** All users can create quests; user-created quests are global
- ✅ **Badge System:** Global badges + custom org badges (hybrid model)
- ✅ **XP & Progress:** Global XP tracking across platform
- ✅ **Achievement Ranks:** DEPRECATED - Remove all references to Explorer/Builder/Creator/Scholar/Sage
- ✅ **Social Features:** Global connections/friendships across organizations
- ✅ **Diploma Pages:** No organization branding, always public
- ✅ **Admin Levels:** Superadmin (platform) + Org Admin (per organization)
- ✅ **Visibility Policies:** 3 policies (all_optio, curated, private_only)
- ✅ **Org Creation:** Superadmin only
- ✅ **Analytics:** All analytics accessible to org admins
- ✅ **Billing:** Not implemented in platform
- ✅ **Migration:** All existing users/quests → "Optio" organization
- ✅ **LMS Integration:** Per-organization LMS connections (OnFire Learning uses SPARK)
- ✅ **AI Tutor:** Default tutor (no org-specific customization)

### Success Criteria
- [ ] Multiple organizations can operate independently on same platform
- [ ] Organizations can control quest visibility via policies
- [ ] Org admins can curate Optio quest library for their users
- [ ] All existing Optio users continue working without disruption
- [ ] OnFire Learning LMS integration continues to work
- [ ] Superadmin can manage all organizations from admin dashboard
- [ ] No achievement rank references remain in codebase

---

## Architecture Summary

### Organization Visibility Policies

**Policy 1: `all_optio` (Most Permissive)**
- Users see ALL global Optio quests (organization_id IS NULL)
- Users see ALL quests created by their organization (organization_id = their org)
- Use case: Organizations that want to supplement Optio's library

**Policy 2: `curated` (Selective)**
- Users see ONLY quests in `organization_quest_access` table
- Users see ALL quests created by their organization
- Use case: Organizations wanting tight content control

**Policy 3: `private_only` (Most Restrictive)**
- Users see ONLY quests created by their organization
- No global Optio quests visible
- Use case: Organizations with completely custom curriculum

### Data Model

```
organizations (NEW)
├── id (UUID, PK)
├── name (VARCHAR)
├── slug (VARCHAR, unique)
├── quest_visibility_policy (ENUM: all_optio, curated, private_only)
├── branding_config (JSONB) - Future: logo, colors
└── is_active (BOOLEAN)

users (MODIFIED)
├── organization_id (UUID, FK to organizations) - NEW
├── is_org_admin (BOOLEAN) - NEW
└── [existing columns...]

quests (MODIFIED)
├── organization_id (UUID, FK to organizations, NULLABLE) - NEW
│   └── NULL = global Optio quest
│   └── NOT NULL = organization-specific quest
└── [existing columns...]

organization_quest_access (NEW) - For 'curated' policy
├── id (UUID, PK)
├── organization_id (UUID, FK)
├── quest_id (UUID, FK)
└── granted_by (UUID, FK to users)

lms_integrations (MODIFIED)
├── organization_id (UUID, FK to organizations) - NEW
└── [existing columns...]
```

---

## Implementation Phases

### Phase 0: Cleanup & Preparation ✅
**Completed:** 2025-12-07 (1.5 hours) | **Commit:** `1b58368`

**Summary:** Removed achievement rank system (Explorer, Builder, Creator, Scholar, Sage) to simplify XP progression.

**Changes:**
- Removed `MASTERY_LEVELS`, `ACHIEVEMENT_TIERS`, and all rank calculation functions from [xp_progression.py](backend/config/xp_progression.py)
- Updated test files to remove tier progression validation
- Removed achievement rank messaging from [core_philosophy.md](core_philosophy.md)
- Students now earn pure cumulative XP without artificial levels

---

### Phase 1: Database Schema Migration ✅
**Completed:** 2025-12-07 (2 hours) | **Commit:** `89df8a8`

**Summary:** Created complete database foundation for multi-organization platform with 7 migrations.

**New Tables:**
- `organizations` - Core org table with 3 visibility policies (all_optio, curated, private_only)
- `organization_quest_access` - Curated quest selection per organization

**Modified Tables:**
- `users` - Added organization_id (FK, NOT NULL) and is_org_admin flag
- `quests` - Added organization_id (nullable, NULL = global quest)
- `lms_integrations` - Added organization_id (FK, NOT NULL)

**Key Features:**
- Created `quest_visible_to_user()` function implementing 3-policy visibility logic
- Updated RLS policies for organization-aware quest filtering
- All 49 existing users assigned to default "Optio" organization
- All 131 existing quests marked as global (visible to 'all_optio' orgs)
- Org admins can manage their organization's quests and curated library

**Migration Files:** [009-015](backend/database_migration/) applied via Supabase MCP

---

### Phase 2: Backend Repository & Service Layer
**Status:** 🟢 Complete
**Completed:** 2025-12-07 (3 hours) | **Commit:** `577f685`

**Summary:** Created complete backend infrastructure for multi-organization management with organization-aware quest filtering.

**Components Created:**
1. **OrganizationRepository** - CRUD operations, quest access management, organization analytics
2. **OrganizationService** - Business logic, policy validation, dashboard aggregation
3. **QuestRepository.get_quests_for_user()** - 3-policy visibility system (all_optio, curated, private_only)
4. **Auth Decorators** - @require_superadmin and @require_org_admin with organization context
5. **Organization Routes** - 8 API endpoints for superadmin/org admin operations
6. **Quest Filtering** - Authenticated users get org-aware filtering, anonymous users see global quests only
7. **Analytics RPC** - get_org_total_xp() database function

**API Endpoints:** `/api/admin/organizations/organizations` (list/create), `/organizations/<id>` (manage), `/organizations/<id>/quests/grant|revoke` (curation), `/organizations/<id>/users` (list users), `/organizations/<id>/analytics` (stats)

**Files Modified:** 9 files (4 created, 5 updated) | 896 insertions, 551 deletions

**Testing:** See [PHASE_2_TESTING.md](../../PHASE_2_TESTING.md) for browser-based testing instructions

---

### Phase 3: Frontend Implementation
**Status:** 🔴 Not Started
**Estimated Time:** 8-10 hours

#### Task 3.1: Create Organization Context

**File:** [frontend/src/contexts/OrganizationContext.jsx](frontend/src/contexts/OrganizationContext.jsx)

```javascript
import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const OrganizationContext = createContext(null);

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
};

export const OrganizationProvider = ({ children }) => {
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrganization();
  }, []);

  const fetchOrganization = async () => {
    try {
      // Get current user's organization from their profile
      const { data } = await api.get('/api/user/profile');
      if (data.organization_id) {
        const orgResponse = await api.get(`/api/organizations/${data.organization_id}`);
        setOrganization(orgResponse.data);
      }
    } catch (error) {
      console.error('Failed to fetch organization:', error);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    organization,
    loading,
    refreshOrganization: fetchOrganization
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};
```

**Subtasks:**
- [ ] Create OrganizationContext.jsx
- [ ] Add OrganizationProvider to App.jsx
- [ ] Test context provides organization data

---

#### Task 3.2: Create Superadmin Organization Dashboard

**File:** [frontend/src/pages/admin/OrganizationDashboard.jsx](frontend/src/pages/admin/OrganizationDashboard.jsx)

```javascript
import React, { useState, useEffect } from 'react';
import api from '../../services/api';

export default function OrganizationDashboard() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const { data } = await api.get('/api/admin/organizations/organizations');
      setOrganizations(data.organizations);
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading organizations...</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Organizations</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg"
        >
          Create Organization
        </button>
      </div>

      <div className="grid gap-4">
        {organizations.map(org => (
          <OrganizationCard key={org.id} organization={org} onUpdate={fetchOrganizations} />
        ))}
      </div>

      {showCreateModal && (
        <CreateOrganizationModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchOrganizations();
          }}
        />
      )}
    </div>
  );
}

function OrganizationCard({ organization, onUpdate }) {
  const policyLabels = {
    all_optio: 'All Optio Quests',
    curated: 'Curated Quests',
    private_only: 'Private Only'
  };

  return (
    <div className="border rounded-lg p-6 bg-white shadow-sm">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-bold">{organization.name}</h3>
          <p className="text-gray-600">Slug: {organization.slug}</p>
          <p className="text-sm text-gray-500 mt-2">
            Policy: {policyLabels[organization.quest_visibility_policy]}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/admin/organizations/${organization.id}`}
            className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
          >
            Manage
          </a>
        </div>
      </div>
    </div>
  );
}

function CreateOrganizationModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    quest_visibility_policy: 'all_optio'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.post('/api/admin/organizations/organizations', formData);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Create Organization</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
              className="w-full border rounded px-3 py-2"
              pattern="[a-z0-9-]+"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, hyphens only</p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Quest Visibility Policy</label>
            <select
              value={formData.quest_visibility_policy}
              onChange={(e) => setFormData({ ...formData, quest_visibility_policy: e.target.value })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="all_optio">All Optio Quests + Org Quests</option>
              <option value="curated">Curated Quests + Org Quests</option>
              <option value="private_only">Organization Quests Only</option>
            </select>
          </div>

          {error && (
            <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Subtasks:**
- [ ] Create OrganizationDashboard.jsx
- [ ] Create CreateOrganizationModal component
- [ ] Add route in frontend routing
- [ ] Test organization creation

---

#### Task 3.3: Create Organization Admin Management Page

**File:** [frontend/src/pages/admin/OrganizationManagement.jsx](frontend/src/pages/admin/OrganizationManagement.jsx)

```javascript
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../services/api';

export default function OrganizationManagement() {
  const { orgId } = useParams();
  const [orgData, setOrgData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchOrganizationData();
  }, [orgId]);

  const fetchOrganizationData = async () => {
    try {
      const { data } = await api.get(`/api/admin/organizations/organizations/${orgId}`);
      setOrgData(data);
    } catch (error) {
      console.error('Failed to fetch organization:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!orgData) {
    return <div className="p-8">Organization not found</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">{orgData.organization.name}</h1>

      <div className="mb-6 border-b">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 ${activeTab === 'overview' ? 'border-b-2 border-optio-purple' : ''}`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 ${activeTab === 'users' ? 'border-b-2 border-optio-purple' : ''}`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('quests')}
            className={`px-4 py-2 ${activeTab === 'quests' ? 'border-b-2 border-optio-purple' : ''}`}
          >
            Quests
          </button>
          {orgData.organization.quest_visibility_policy === 'curated' && (
            <button
              onClick={() => setActiveTab('curation')}
              className={`px-4 py-2 ${activeTab === 'curation' ? 'border-b-2 border-optio-purple' : ''}`}
            >
              Quest Curation
            </button>
          )}
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 ${activeTab === 'analytics' ? 'border-b-2 border-optio-purple' : ''}`}
          >
            Analytics
          </button>
        </nav>
      </div>

      {activeTab === 'overview' && <OverviewTab orgData={orgData} />}
      {activeTab === 'users' && <UsersTab users={orgData.users} />}
      {activeTab === 'quests' && <QuestsTab quests={orgData.organization_quests} />}
      {activeTab === 'curation' && <CurationTab orgId={orgId} curatedQuests={orgData.curated_quests} onUpdate={fetchOrganizationData} />}
      {activeTab === 'analytics' && <AnalyticsTab analytics={orgData.analytics} />}
    </div>
  );
}

function OverviewTab({ orgData }) {
  const policyLabels = {
    all_optio: 'All Optio Quests + Org Quests',
    curated: 'Curated Quests + Org Quests',
    private_only: 'Organization Quests Only'
  };

  return (
    <div className="grid gap-6">
      <div className="bg-white rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold mb-4">Organization Details</h2>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="font-medium text-gray-600">Name</dt>
            <dd className="text-lg">{orgData.organization.name}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">Slug</dt>
            <dd className="text-lg font-mono">{orgData.organization.slug}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">Quest Visibility Policy</dt>
            <dd className="text-lg">{policyLabels[orgData.organization.quest_visibility_policy]}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">Status</dt>
            <dd className="text-lg">
              {orgData.organization.is_active ? (
                <span className="text-green-600">Active</span>
              ) : (
                <span className="text-red-600">Inactive</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total Users</h3>
          <p className="text-3xl font-bold">{orgData.analytics.total_users}</p>
        </div>
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Quest Completions</h3>
          <p className="text-3xl font-bold">{orgData.analytics.total_completions}</p>
        </div>
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total XP Earned</h3>
          <p className="text-3xl font-bold">{orgData.analytics.total_xp.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ users }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">XP</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Org Admin</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map(user => (
            <tr key={user.id}>
              <td className="px-6 py-4">{user.display_name}</td>
              <td className="px-6 py-4">{user.email}</td>
              <td className="px-6 py-4">{user.role}</td>
              <td className="px-6 py-4">{user.total_xp.toLocaleString()}</td>
              <td className="px-6 py-4">
                {user.is_org_admin ? (
                  <span className="text-green-600">Yes</span>
                ) : (
                  <span className="text-gray-400">No</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuestsTab({ quests }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pillar</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {quests.map(quest => (
            <tr key={quest.id}>
              <td className="px-6 py-4">{quest.title}</td>
              <td className="px-6 py-4">{quest.quest_type}</td>
              <td className="px-6 py-4">{quest.pillar_primary}</td>
              <td className="px-6 py-4">
                {quest.is_active ? (
                  <span className="text-green-600">Active</span>
                ) : (
                  <span className="text-gray-400">Inactive</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CurationTab({ orgId, curatedQuests, onUpdate }) {
  const [showAddModal, setShowAddModal] = useState(false);

  const handleRevoke = async (questId) => {
    if (!confirm('Remove this quest from your curated library?')) return;

    try {
      await api.post(`/api/admin/organizations/organizations/${orgId}/quests/revoke`, {
        quest_id: questId
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to revoke quest access:', error);
      alert('Failed to revoke quest access');
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-bold">Curated Quests</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded"
        >
          Add Quest
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pillar</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Granted At</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {curatedQuests.map(item => (
              <tr key={item.quest_id}>
                <td className="px-6 py-4">{item.quests.title}</td>
                <td className="px-6 py-4">{item.quests.pillar_primary}</td>
                <td className="px-6 py-4">{new Date(item.granted_at).toLocaleDateString()}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleRevoke(item.quest_id)}
                    className="text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <AddQuestModal
          orgId={orgId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            onUpdate();
          }}
        />
      )}
    </div>
  );
}

function AddQuestModal({ orgId, onClose, onSuccess }) {
  const [globalQuests, setGlobalQuests] = useState([]);
  const [selectedQuest, setSelectedQuest] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGlobalQuests();
  }, []);

  const fetchGlobalQuests = async () => {
    try {
      // Fetch all quests, then filter for global ones in frontend
      const { data } = await api.get('/api/quests?limit=100');
      // Filter for global quests only (organization_id is null)
      const global = data.quests.filter(q => !q.organization_id);
      setGlobalQuests(global);
    } catch (error) {
      console.error('Failed to fetch quests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.post(`/api/admin/organizations/organizations/${orgId}/quests/grant`, {
        quest_id: selectedQuest
      });
      onSuccess();
    } catch (error) {
      console.error('Failed to grant quest access:', error);
      alert(error.response?.data?.error || 'Failed to grant quest access');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Add Quest to Library</h2>

        {loading ? (
          <p>Loading quests...</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Select Global Optio Quest</label>
              <select
                value={selectedQuest}
                onChange={(e) => setSelectedQuest(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              >
                <option value="">Choose a quest...</option>
                {globalQuests.map(quest => (
                  <option key={quest.id} value={quest.id}>
                    {quest.title} ({quest.pillar_primary})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded"
              >
                Add Quest
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function AnalyticsTab({ analytics }) {
  return (
    <div className="grid gap-4">
      <div className="bg-white rounded-lg p-6 shadow">
        <h3 className="text-lg font-bold mb-4">Organization Analytics</h3>
        <dl className="grid grid-cols-3 gap-4">
          <div>
            <dt className="text-sm text-gray-600">Total Users</dt>
            <dd className="text-2xl font-bold">{analytics.total_users}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Total Completions</dt>
            <dd className="text-2xl font-bold">{analytics.total_completions}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Total XP Earned</dt>
            <dd className="text-2xl font-bold">{analytics.total_xp.toLocaleString()}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
```

**Subtasks:**
- [ ] Create OrganizationManagement.jsx
- [ ] Create all tab components (Overview, Users, Quests, Curation, Analytics)
- [ ] Add AddQuestModal for curated policy
- [ ] Add route for `/admin/organizations/:orgId`
- [ ] Test all tabs and functionality

---

#### Task 3.4: Update Admin Navigation

**File:** [frontend/src/components/admin/AdminNav.jsx](frontend/src/components/admin/AdminNav.jsx) (or wherever admin nav is located)

Add link to organization management:

```javascript
<NavLink to="/admin/organizations" className="nav-link">
  Organizations
</NavLink>
```

**Subtasks:**
- [ ] Add "Organizations" link to admin navigation
- [ ] Test navigation works
- [ ] Ensure link only shows for superadmin

---

#### Task 3.5: Update Quest Filtering (Transparent to Users)

The quest filtering already happens server-side, so frontend changes are minimal. Just ensure quest listing components work correctly.

**File:** [frontend/src/pages/QuestBadgeHub.jsx](frontend/src/pages/QuestBadgeHub.jsx)

No changes needed - quest filtering happens server-side via updated `/api/quests` endpoint.

**Subtasks:**
- [ ] Test quest visibility for users in different organizations
- [ ] Verify users only see quests according to their org policy
- [ ] Test anonymous users only see global public quests

---

#### Phase 3 Completion Checklist

- [ ] OrganizationContext created and provider added to App
- [ ] OrganizationDashboard page created (superadmin)
- [ ] OrganizationManagement page created (org admin)
- [ ] CreateOrganizationModal component working
- [ ] Quest curation interface working (AddQuestModal)
- [ ] Organization navigation added to admin menu
- [ ] All tabs in OrganizationManagement tested
- [ ] Quest visibility tested for all three policies
- [ ] Anonymous user quest visibility tested

---

### Phase 4: Testing & Validation
**Status:** 🔴 Not Started
**Estimated Time:** 4-6 hours

#### Task 4.1: Database Testing

**Test Cases:**
- [ ] Create new organization via SQL
- [ ] Assign user to organization
- [ ] Create organization-specific quest
- [ ] Grant quest access via organization_quest_access
- [ ] Test RLS policies with different user roles
- [ ] Test quest_visible_to_user() function with all three policies

**SQL Test Script:**
```sql
-- Create test organization
INSERT INTO organizations (name, slug, quest_visibility_policy)
VALUES ('Test Org', 'test-org', 'curated')
RETURNING *;

-- Create test user in that org
INSERT INTO users (email, display_name, organization_id, is_org_admin, role)
VALUES ('testuser@test.com', 'Test User', '<org_id>', false, 'student')
RETURNING *;

-- Test quest visibility function
SELECT quest_visible_to_user('<quest_id>'::UUID, '<user_id>'::UUID);

-- Verify RLS policies
SET ROLE authenticated;
SET request.jwt.claims.sub = '<user_id>';
SELECT * FROM quests WHERE is_active = true;
```

---

#### Task 4.2: Backend API Testing

**Test with cURL or Postman:**

```bash
# Create organization (superadmin)
curl -X POST http://localhost:5000/api/admin/organizations/organizations \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "Test Organization",
    "slug": "test-org",
    "quest_visibility_policy": "curated"
  }'

# Get organization
curl -X GET http://localhost:5000/api/admin/organizations/organizations/<org_id> \
  -b cookies.txt

# Grant quest access
curl -X POST http://localhost:5000/api/admin/organizations/organizations/<org_id>/quests/grant \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"quest_id": "<quest_id>"}'

# List quests (should respect org policy)
curl -X GET http://localhost:5000/api/quests \
  -b cookies.txt
```

**Test Cases:**
- [ ] Create organization (superadmin only)
- [ ] Update organization policy (superadmin only)
- [ ] Grant quest access (org admin)
- [ ] Revoke quest access (org admin)
- [ ] List organization users (org admin)
- [ ] Get organization analytics (org admin)
- [ ] Quest listing respects organization policy
- [ ] Non-org-admin cannot access org admin routes
- [ ] Non-superadmin cannot create organizations

---

#### Task 4.3: Frontend Testing

**Manual Test Cases:**
- [ ] Superadmin can access /admin/organizations
- [ ] Superadmin can create new organization
- [ ] Org admin can access their organization's management page
- [ ] Org admin cannot access other organization's pages
- [ ] Curated policy: Org admin can add/remove quests from library
- [ ] All policy: Users see all global quests + org quests
- [ ] Curated policy: Users see only curated quests + org quests
- [ ] Private policy: Users see only org quests
- [ ] Quest hub filters work correctly
- [ ] Organization analytics display correctly

---

#### Task 4.4: Integration Testing

**Test Scenarios:**

**Scenario 1: New Organization with All Optio Policy**
1. Superadmin creates organization with policy=all_optio
2. Create new user in that organization
3. Login as that user
4. Verify user sees all global Optio quests + any org quests
5. Create a quest as that user
6. Verify quest is global (organization_id = NULL per requirements)

**Scenario 2: Curated Policy Organization**
1. Superadmin creates organization with policy=curated
2. Create org admin user in that organization
3. Login as org admin
4. Grant access to 3 specific global quests
5. Create 2 organization-specific quests
6. Create regular student user in same organization
7. Login as student
8. Verify student sees only the 3 curated quests + 2 org quests

**Scenario 3: Private Only Policy Organization**
1. Superadmin creates organization with policy=private_only
2. Create organization-specific quests
3. Create student user in that organization
4. Login as student
5. Verify student sees ONLY organization quests (no global quests)

**Scenario 4: OnFire Learning LMS Integration**
1. Verify OnFire Learning organization exists (or create it)
2. Assign OnFire users to OnFire organization
3. Verify SPARK LMS integration has organization_id set
4. Test course quest enrollment for OnFire users
5. Verify LMS webhook still works correctly

**Scenario 5: User Transfer Between Organizations**
1. Create user in Organization A
2. User completes quests, earns XP, earns badges
3. Superadmin changes user's organization_id to Organization B
4. Verify user keeps all XP, badges, quest completions
5. Verify user now sees Organization B's quest library

---

#### Task 4.5: Performance Testing

**Test Cases:**
- [ ] Quest listing with 100+ quests (check query performance)
- [ ] Organization with 500+ users (analytics performance)
- [ ] RLS policy enforcement doesn't cause N+1 queries
- [ ] Curated policy with 50+ curated quests performs well

**Performance Benchmarks:**
- Quest listing should load in < 500ms
- Organization analytics should load in < 1s
- RLS function should execute in < 50ms

---

#### Phase 4 Completion Checklist

- [ ] All database test cases passed
- [ ] All backend API test cases passed
- [ ] All frontend test cases passed
- [ ] All integration scenarios tested successfully
- [ ] Performance benchmarks met
- [ ] No RLS policy violations found
- [ ] Quest visibility working correctly for all three policies
- [ ] OnFire Learning LMS integration still working

---

### Phase 5: Rollout & Migration
**Status:** 🔴 Not Started
**Estimated Time:** 2-3 hours

#### Task 5.1: Prepare Production Migration

**Pre-Migration Checklist:**
- [ ] All Phase 0-4 tasks completed
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Migrations tested in development
- [ ] Backup plan prepared

**Migration Files to Run (in order):**
1. 009_create_organizations_table.sql
2. 010_add_organization_to_users.sql
3. 011_add_organization_to_quests.sql
4. 012_create_organization_quest_access.sql
5. 013_add_organization_to_lms.sql
6. 014_update_quest_rls_policies.sql
7. 015_organization_triggers.sql

---

#### Task 5.2: Create OnFire Learning Organization

**Before Running Migration 013:**

```sql
-- Create OnFire Learning organization
INSERT INTO organizations (name, slug, quest_visibility_policy)
VALUES ('OnFire Learning', 'onfire', 'all_optio')
RETURNING *;

-- Note the ID for next step
```

**Update Migration 013:**
```sql
-- In migration 013, update OnFire LMS integration
UPDATE lms_integrations
SET organization_id = (SELECT id FROM organizations WHERE slug = 'onfire')
WHERE lms_type = 'spark';

-- Assign OnFire users to OnFire organization
-- (If you can identify them by email domain or other criteria)
UPDATE users
SET organization_id = (SELECT id FROM organizations WHERE slug = 'onfire')
WHERE email LIKE '%@onfirelearning.com%';
```

**Subtasks:**
- [ ] Create OnFire Learning organization
- [ ] Assign OnFire users to OnFire org
- [ ] Assign SPARK LMS integration to OnFire org
- [ ] Verify OnFire users can access their LMS quests

---

#### Task 5.3: Run Production Migrations

**Steps:**
1. [ ] Notify users of upcoming maintenance (if applicable)
2. [ ] Create database backup
3. [ ] Run migrations using Supabase MCP in sequence
4. [ ] Verify each migration succeeded before running next
5. [ ] Run verification queries after all migrations complete
6. [ ] Test critical flows (login, quest listing, enrollment)

**Verification Queries:**
```sql
-- Verify all users have organization
SELECT COUNT(*) FROM users WHERE organization_id IS NULL;
-- Should be 0

-- Verify organizations exist
SELECT * FROM organizations;
-- Should show Optio + OnFire Learning (at minimum)

-- Verify quest visibility function works
SELECT quest_visible_to_user(
  (SELECT id FROM quests WHERE is_active = true LIMIT 1),
  (SELECT id FROM users LIMIT 1)
);
-- Should return true/false

-- Verify RLS policies exist
SELECT policyname FROM pg_policies WHERE tablename = 'quests';
-- Should show new org-aware policies
```

---

#### Task 5.4: Deploy Backend Code

**Steps:**
1. [ ] Merge feature branch to `develop`
2. [ ] Auto-commit changes
3. [ ] Push to `develop` branch
4. [ ] Monitor Render deployment logs
5. [ ] Verify deployment succeeded
6. [ ] Check backend logs for errors
7. [ ] Test API endpoints in development environment

**Verification:**
```bash
# Test organizations endpoint
curl https://optio-dev-backend.onrender.com/api/admin/organizations/organizations \
  -b cookies.txt

# Test quest listing
curl https://optio-dev-backend.onrender.com/api/quests \
  -b cookies.txt
```

---

#### Task 5.5: Deploy Frontend Code

**Steps:**
1. [ ] Verify backend deployment succeeded first
2. [ ] Frontend auto-deploys when backend is done (same commit)
3. [ ] Monitor Render deployment logs for frontend
4. [ ] Verify frontend build succeeded
5. [ ] Visit https://optio-dev-frontend.onrender.com
6. [ ] Test organization management UI

**Verification:**
- [ ] Can access /admin/organizations (as superadmin)
- [ ] Can create new organization
- [ ] Can manage organization settings
- [ ] Quest hub shows correct quests based on policy

---

#### Task 5.6: Production Deployment (After Testing in Dev)

**Only after dev testing is complete:**

1. [ ] Merge `develop` to `main` branch
2. [ ] Monitor production deployment
3. [ ] Run smoke tests in production
4. [ ] Monitor error logs for 24 hours
5. [ ] Communicate with OnFire Learning about changes

**Production Verification:**
- [ ] OnFire Learning users can still access their quests
- [ ] SPARK LMS integration working
- [ ] Optio users can access global quest library
- [ ] No performance degradation
- [ ] No RLS policy errors in logs

---

#### Phase 5 Completion Checklist

- [ ] All migrations run successfully in production
- [ ] Default Optio organization created
- [ ] OnFire Learning organization created
- [ ] All users assigned to appropriate organizations
- [ ] Backend code deployed to develop and tested
- [ ] Frontend code deployed to develop and tested
- [ ] Production deployment successful
- [ ] OnFire Learning verified working
- [ ] No errors in production logs
- [ ] Rollback plan documented (if needed)

---

## Post-Launch Tasks

### Task PL.1: Documentation Updates
- [ ] Update API documentation with new organization endpoints
- [ ] Document organization admin workflows
- [ ] Create guide for creating new organizations
- [ ] Update developer onboarding docs
- [ ] Document organization policies for support team

### Task PL.2: Monitoring & Metrics
- [ ] Set up alerts for RLS policy violations
- [ ] Monitor quest visibility query performance
- [ ] Track organization creation rate
- [ ] Monitor organization analytics usage
- [ ] Set up dashboard for org metrics

### Task PL.3: User Communication
- [ ] Email OnFire Learning about multi-org changes
- [ ] Update help documentation
- [ ] Create FAQ for organization admins
- [ ] Prepare support responses for common questions

### Task PL.4: Future Enhancements
- [ ] Organization branding customization (logos, colors)
- [ ] Custom badges per organization
- [ ] Organization-specific AI tutor context
- [ ] Cross-organization collaboration features
- [ ] Organization analytics export

---

## Cleanup Tasks

### Cleanup.1: Remove Achievement Rank Code

**Status:** 🔴 Not Started (Part of Phase 0)

This is a prerequisite before starting Phase 1. See Phase 0 for complete checklist.

**Quick Summary:**
- [ ] Remove rank calculations from backend
- [ ] Remove rank displays from frontend
- [ ] Update documentation to remove rank messaging
- [ ] Test that XP system still works without ranks

### Cleanup.2: Remove Old Organization Endpoints

**File:** [backend/routes/admin/user_management.py](backend/routes/admin/user_management.py)

```python
# DELETE these routes (lines 777-867):
# - assign_user_to_organization()
# - get_organizations()
```

**Subtasks:**
- [ ] Delete deprecated organization endpoints in user_management.py
- [ ] Verify no code calls these endpoints
- [ ] Remove any frontend code that called these endpoints

### Cleanup.3: Code Review & Optimization

**Post-Launch Review:**
- [ ] Review all SQL queries for optimization opportunities
- [ ] Add database indexes if needed (org_id columns)
- [ ] Review RLS function performance
- [ ] Optimize quest filtering queries
- [ ] Remove any dead code
- [ ] Add missing error handling

---

## Rollback Plan

If critical issues occur during rollout:

### Rollback Steps

1. **Database Rollback:**
   ```sql
   -- Rollback migrations in reverse order
   BEGIN;

   -- Drop organization tables
   DROP TABLE IF EXISTS organization_quest_access CASCADE;
   DROP FUNCTION IF EXISTS quest_visible_to_user CASCADE;

   -- Remove organization columns
   ALTER TABLE users DROP COLUMN IF EXISTS organization_id CASCADE;
   ALTER TABLE users DROP COLUMN IF EXISTS is_org_admin CASCADE;
   ALTER TABLE quests DROP COLUMN IF EXISTS organization_id CASCADE;
   ALTER TABLE lms_integrations DROP COLUMN IF EXISTS organization_id CASCADE;

   -- Drop organizations table
   DROP TABLE IF EXISTS organizations CASCADE;

   -- Restore old RLS policies (from migration 008)
   -- (Copy policies from backup)

   COMMIT;
   ```

2. **Code Rollback:**
   - [ ] Revert develop branch to previous commit
   - [ ] Force push to Render
   - [ ] Monitor deployment
   - [ ] Verify old functionality restored

3. **Communication:**
   - [ ] Notify stakeholders of rollback
   - [ ] Document what went wrong
   - [ ] Plan fix and re-deployment

---

## Progress Tracking

### Overall Progress: 0%

**Phase 0 (Cleanup):** 🔴 0% (0/50 tasks)
**Phase 1 (Database):** 🔴 0% (0/20 tasks)
**Phase 2 (Backend):** 🔴 0% (0/25 tasks)
**Phase 3 (Frontend):** 🔴 0% (0/20 tasks)
**Phase 4 (Testing):** 🔴 0% (0/25 tasks)
**Phase 5 (Rollout):** 🔴 0% (0/15 tasks)

---

## Update Instructions

**After completing tasks, update this document:**

1. Check off completed tasks with `[x]`
2. Update phase status:
   - 🔴 Not Started (0%)
   - 🟡 In Progress (1-99%)
   - 🟢 Complete (100%)
3. Update overall progress percentage
4. Add notes about any deviations from plan
5. Document any issues encountered
6. Update "Last Updated" date at top
7. Commit changes to repository

**Example Update:**
```markdown
**Phase 0 (Cleanup):** 🟡 45% (23/50 tasks)

Notes:
- Achievement rank removal took longer than expected due to extensive frontend references
- Found additional rank references in CRM components
- Updated core_philosophy.md successfully
```

---

## Questions & Decisions Log

**Document key decisions here as implementation progresses:**

**Decision 1:** Existing quests global vs org-owned
- **Status:** PENDING
- **Options:** A) NULL (global) | B) Assign to Optio org
- **Recommendation:** Option A (global)
- **Decision:** TBD
- **Date:** 2025-01-07

**Decision 2:** User-created quests ownership
- **Status:** RESOLVED
- **Decision:** User-created quests are global (organization_id = NULL)
- **Rationale:** Per requirements, user quests are globally accessible
- **Date:** 2025-01-07

**Decision 3:** OnFire Learning organization setup
- **Status:** PENDING
- **Decision:** Create OnFire org before running migration 013
- **Date:** 2025-01-07

---

## Contact & Support

**Implementation Owner:** Tanner Bowman (tannerbowman@gmail.com)
**Technical Questions:** Claude Code (this agent)
**Documentation:** [backend/docs/MULTI_ORG_IMPLEMENTATION.md](backend/docs/MULTI_ORG_IMPLEMENTATION.md)

---

**End of Implementation Plan**
