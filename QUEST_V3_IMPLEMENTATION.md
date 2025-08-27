# Quest System V3 - Complete Implementation Guide

## Overview
Complete rebuild of the quest system with fresh database. No migrations needed - we're starting clean.

## Core Philosophy
- **No Admin Review**: Public accountability through diploma page
- **Task-Based XP**: Granular tasks with evidence requirements
- **Social Learning**: Team up with friends for bonus XP
- **Process Documentation**: Learning logs for journey tracking
- **Evidence-Based**: All completions require proof (text/link/image/video)

## Implementation Checklist

### Phase 1: Database Setup (Fresh Start)
- [ ] Drop all existing quest-related tables
- [ ] Create new schema from scratch
- [ ] Add proper indexes and constraints
- [ ] Set up RLS policies for security

### Phase 2: Backend Core
- [ ] Remove all old quest endpoints and logic
- [ ] Build new quest task system
- [ ] Implement evidence upload and validation
- [ ] Create collaboration system
- [ ] Add learning log functionality

### Phase 3: Frontend Components
- [ ] Remove old quest components
- [ ] Build new task-based UI
- [ ] Create evidence upload modals
- [ ] Implement team-up features
- [ ] Design diploma display

### Phase 4: Testing & Deployment
- [ ] Create sample data
- [ ] Test all endpoints
- [ ] Verify XP calculations
- [ ] Deploy and monitor

---

## DETAILED IMPLEMENTATION STEPS

### Step 1: Database Clean Slate

#### 1.1 Drop Old Tables
```sql
-- Drop all quest-related tables
DROP TABLE IF EXISTS quest_skill_xp CASCADE;
DROP TABLE IF EXISTS quest_xp_awards CASCADE;
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS submission_evidence CASCADE;
DROP TABLE IF EXISTS user_quests CASCADE;
DROP TABLE IF EXISTS quests CASCADE;
DROP TABLE IF EXISTS user_skill_xp CASCADE;
```

#### 1.2 Create New Schema
```sql
-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Main quests table (simplified)
CREATE TABLE quests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    big_idea TEXT NOT NULL,
    header_image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quest tasks (the actual work items)
CREATE TABLE quest_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    xp_amount INTEGER NOT NULL CHECK (xp_amount > 0),
    pillar TEXT NOT NULL CHECK (pillar IN ('creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy')),
    task_order INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT true,
    is_collaboration_eligible BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User quest enrollments
CREATE TABLE user_quests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, quest_id)
);

-- Task completions with evidence
CREATE TABLE user_quest_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    quest_task_id UUID REFERENCES quest_tasks(id) ON DELETE CASCADE,
    user_quest_id UUID REFERENCES user_quests(id) ON DELETE CASCADE,
    evidence_type TEXT NOT NULL CHECK (evidence_type IN ('text', 'link', 'image', 'video')),
    evidence_content TEXT NOT NULL, -- URL for files, actual content for text/links
    xp_awarded INTEGER NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, quest_task_id)
);

-- Team collaborations
CREATE TABLE quest_collaborations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL,
    partner_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(quest_id, requester_id, partner_id)
);

-- Learning logs
CREATE TABLE learning_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_quest_id UUID REFERENCES user_quests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    entry_text TEXT NOT NULL,
    media_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User XP tracking (simplified)
CREATE TABLE user_skill_xp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    pillar TEXT NOT NULL CHECK (pillar IN ('creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy')),
    xp_amount INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, pillar)
);

-- Create indexes for performance
CREATE INDEX idx_quest_tasks_quest_id ON quest_tasks(quest_id);
CREATE INDEX idx_user_quests_user_id ON user_quests(user_id);
CREATE INDEX idx_user_quest_tasks_user_id ON user_quest_tasks(user_id);
CREATE INDEX idx_learning_logs_user_quest_id ON learning_logs(user_quest_id);
CREATE INDEX idx_quest_collaborations_partner_id ON quest_collaborations(partner_id);
CREATE INDEX idx_quest_collaborations_status ON quest_collaborations(status);
```

---

### Step 2: Backend Implementation

#### 2.1 Files to Remove Completely
- `backend/routes/users_old.py`
- `backend/utils/quest_framework_validator.py`
- `backend/fix_user_xp.py`
- `backend/utils/fix_quest_xp.py`
- Remove all submission-related endpoints from `backend/routes/admin.py`

#### 2.2 New File Structure
```
backend/
├── routes/
│   ├── quests_v3.py         # New quest endpoints
│   ├── tasks.py             # Task completion endpoints
│   ├── collaborations.py   # Team-up features
│   └── learning_logs.py    # Learning log endpoints
├── services/
│   ├── task_service.py     # Task completion logic
│   ├── xp_service.py       # XP calculation and awards
│   └── evidence_service.py # Evidence validation and storage
└── validators/
    └── evidence_validator.py # Evidence type validation
```

#### 2.3 Core Endpoints to Implement

##### Quests & Tasks
- `GET /api/v3/quests` - List all active quests
- `GET /api/v3/quests/<quest_id>` - Get quest with tasks
- `POST /api/v3/quests/<quest_id>/enroll` - Start a quest
- `GET /api/v3/quests/my-active` - User's active quests
- `POST /api/v3/tasks/<task_id>/complete` - Complete a task with evidence
- `GET /api/v3/tasks/<task_id>/completions` - Get task completions

##### Collaborations
- `POST /api/v3/collaborations/invite` - Send team-up request
- `GET /api/v3/collaborations/invites` - Get pending invites
- `POST /api/v3/collaborations/<collab_id>/accept` - Accept invite
- `POST /api/v3/collaborations/<collab_id>/decline` - Decline invite
- `GET /api/v3/collaborations/active` - Get active collaborations

##### Learning Logs
- `POST /api/v3/logs/<user_quest_id>/entry` - Add log entry
- `GET /api/v3/logs/<user_quest_id>` - Get all logs for a quest
- `DELETE /api/v3/logs/<log_id>` - Delete a log entry

##### Admin
- `POST /api/v3/admin/quests` - Create quest with tasks
- `PUT /api/v3/admin/quests/<quest_id>` - Update quest
- `POST /api/v3/admin/quests/<quest_id>/tasks` - Add task to quest
- `PUT /api/v3/admin/tasks/<task_id>` - Update task
- `DELETE /api/v3/admin/tasks/<task_id>` - Delete task

---

### Step 3: Frontend Implementation

#### 3.1 Components to Remove
- `frontend/src/components/QuestSubmissionForm.jsx`
- `frontend/src/components/VisualQuestCard.jsx`
- Any submission-related components

#### 3.2 New Components to Create
```
frontend/src/
├── components/
│   ├── quest/
│   │   ├── QuestCardV3.jsx          # New quest card with header image
│   │   ├── TaskList.jsx             # Display quest tasks
│   │   ├── TaskCompletionModal.jsx  # Evidence upload modal
│   │   ├── TeamUpModal.jsx          # Friend invitation modal
│   │   └── LearningLogSection.jsx   # Log entries display
│   ├── evidence/
│   │   ├── EvidenceUploader.jsx     # File upload component
│   │   ├── EvidenceDisplay.jsx      # Display submitted evidence
│   │   └── EvidenceValidator.jsx    # Client-side validation
│   └── collaboration/
│       ├── CollaborationInvites.jsx # Pending invites display
│       └── CollaborationStatus.jsx  # Active collaboration badge
├── pages/
│   ├── QuestHubV3.jsx              # Browse and enroll in quests
│   ├── QuestDetailV3.jsx           # Quest tasks and progress
│   ├── MyQuestsPage.jsx            # User's active quests
│   └── DiplomaPageV3.jsx           # Public achievement display
└── utils/
    ├── evidenceHelpers.js           # Evidence handling utilities
    └── xpCalculations.js            # XP display calculations
```

#### 3.3 Key Component Features

##### QuestCardV3.jsx
- Display header image with fallback
- Show total available XP
- Team-up button (check for friends first)
- Quick enroll action

##### TaskCompletionModal.jsx
- Evidence type selector (text/link/image/video)
- File upload with progress
- Preview before submission
- Validation messages

##### LearningLogSection.jsx
- Chronological log entries
- Add new entry inline
- Optional media attachments
- Timestamp display

##### DiplomaPageV3.jsx
- Grid of completed quests
- Evidence showcase
- XP breakdown by pillar
- Shareable link

---

### Step 4: Implementation Order

#### Day 1: Database & Backend Foundation
1. [ ] Run database cleanup script
2. [ ] Create new schema
3. [ ] Set up basic quest endpoints
4. [ ] Implement task completion endpoint
5. [ ] Add evidence validation

#### Day 2: Core Features
1. [ ] Build collaboration system
2. [ ] Implement learning logs
3. [ ] Create XP calculation service
4. [ ] Add file upload handling
5. [ ] Test all endpoints

#### Day 3: Frontend Components
1. [ ] Create QuestCardV3
2. [ ] Build TaskCompletionModal
3. [ ] Implement evidence upload
4. [ ] Add TeamUpModal
5. [ ] Create learning log UI

#### Day 4: Integration & Polish
1. [ ] Connect frontend to new endpoints
2. [ ] Update dashboard for new system
3. [ ] Implement diploma page
4. [ ] Add error handling
5. [ ] Test full flow

#### Day 5: Admin & Cleanup
1. [ ] Build admin quest creator
2. [ ] Add task management
3. [ ] Remove old code
4. [ ] Update documentation
5. [ ] Final testing

---

### Step 5: Security & Validation

#### Evidence Validation Rules
```python
EVIDENCE_RULES = {
    'text': {
        'min_length': 50,
        'max_length': 5000,
        'required_fields': ['content']
    },
    'link': {
        'url_pattern': r'^https?://.*',
        'max_length': 500,
        'required_fields': ['url']
    },
    'image': {
        'allowed_types': ['jpg', 'jpeg', 'png', 'gif'],
        'max_size': 10 * 1024 * 1024,  # 10MB
        'required_fields': ['file_url']
    },
    'video': {
        'allowed_types': ['mp4', 'mov', 'avi'],
        'max_size': 100 * 1024 * 1024,  # 100MB
        'required_fields': ['file_url']
    }
}
```

#### XP Award Rules
- Base XP from task
- 2x multiplier if collaboration active
- No duplicate completions
- Audit trail for all awards

#### File Upload Security
- Type validation
- Size limits
- Virus scanning (if available)
- Secure storage location
- Generated unique filenames

---

### Step 6: Sample Data

#### Create Test Quests
```sql
-- Sample quest with tasks
INSERT INTO quests (title, big_idea, header_image_url) VALUES
('Digital Artist Journey', 'Master digital art fundamentals through hands-on creation', '/images/digital-art-header.jpg');

-- Add tasks to the quest
INSERT INTO quest_tasks (quest_id, title, description, xp_amount, pillar, task_order, is_collaboration_eligible) VALUES
(quest_id, 'Create a Digital Self-Portrait', 'Use any digital tool to create a self-portrait', 100, 'creativity', 1, true),
(quest_id, 'Study Color Theory', 'Document your learning about color relationships', 75, 'critical_thinking', 2, false),
(quest_id, 'Share Your Process', 'Create a video showing your artistic process', 150, 'communication', 3, true);
```

---

### Step 7: Testing Checklist

#### Functional Tests
- [ ] User can enroll in quest
- [ ] Task completion with evidence works
- [ ] XP awards correctly (with/without collaboration)
- [ ] Learning logs save and display
- [ ] Team-up invitations work
- [ ] Diploma shows achievements

#### Security Tests
- [ ] Cannot complete same task twice
- [ ] Cannot upload invalid file types
- [ ] Cannot manipulate XP awards
- [ ] Cannot access others' private data
- [ ] Rate limiting prevents spam

#### Performance Tests
- [ ] Quest list loads quickly
- [ ] File uploads handle large files
- [ ] Learning logs paginate properly
- [ ] Dashboard calculations are efficient

---

### Step 8: Cleanup Actions

#### Remove These Files
```bash
# Backend files to delete
backend/routes/users_old.py
backend/utils/quest_framework_validator.py
backend/fix_user_xp.py
backend/utils/fix_quest_xp.py
backend/routes/submissions.py  # if exists

# Frontend files to delete
frontend/src/components/QuestSubmissionForm.jsx
frontend/src/components/VisualQuestCard.jsx
frontend/src/components/SubmissionReview.jsx  # if exists
```

#### Update These Files
- `backend/app.py` - Register new routes, remove old ones
- `backend/config.py` - Add any new config values
- `frontend/src/App.jsx` - Update routes to new pages
- `frontend/src/services/api.js` - Point to new endpoints

---

### Step 9: Environment Variables

#### Add to Backend .env
```bash
# File upload settings
MAX_UPLOAD_SIZE=104857600  # 100MB in bytes
ALLOWED_IMAGE_TYPES=jpg,jpeg,png,gif
ALLOWED_VIDEO_TYPES=mp4,mov,avi
UPLOAD_FOLDER=uploads/evidence

# Security
EVIDENCE_ENCRYPTION_KEY=your-encryption-key
RATE_LIMIT_TASKS=10  # Max task completions per hour
```

#### Add to Frontend .env
```bash
# API version
VITE_API_VERSION=v3
VITE_MAX_FILE_SIZE=104857600
VITE_EVIDENCE_TYPES=text,link,image,video
```

---

### Step 10: Monitoring & Maintenance

#### Key Metrics to Track
- Task completion rate
- Evidence upload success rate
- Collaboration acceptance rate
- Average learning log entries per quest
- XP distribution by pillar

#### Database Maintenance
```sql
-- Regular cleanup of old pending invitations
DELETE FROM quest_collaborations 
WHERE status = 'pending' 
AND created_at < NOW() - INTERVAL '7 days';

-- Archive completed quests older than 6 months
UPDATE user_quests 
SET is_active = false 
WHERE completed_at < NOW() - INTERVAL '6 months';
```

---

## Success Criteria

### Must Have
- [x] Clean database with no legacy tables
- [x] Task-based quest system working
- [x] Evidence upload and validation
- [x] XP calculation with collaboration bonus
- [x] Basic learning logs

### Should Have
- [x] Team-up invitations
- [x] Diploma page with evidence
- [x] Admin quest management
- [x] File upload security

### Nice to Have
- [ ] Real-time notifications
- [ ] Advanced analytics
- [ ] Bulk quest import
- [ ] Mobile app support

---

## Notes & Warnings

1. **No Rollback**: This is a complete rebuild. Back up everything first.
2. **Breaking Changes**: All existing quest data will be lost.
3. **User Communication**: Notify users before deployment.
4. **Testing**: Thoroughly test each phase before moving on.
5. **Documentation**: Update all user guides and API docs.

---

*Implementation Start Date: [Today]*
*Target Completion: 5 days*
*Status: Ready to Begin*