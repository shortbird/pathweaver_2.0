# Optio Application - Quest Redesign Implementation Requirements

## Overview
We are redesigning the quest system to move beyond traditional subjects and implement a skills-based learning framework with a revolutionary "Self-Validated Diploma" system. Students receive their diploma upon joining and build its value through quest completion.

## 1. Database Schema Changes

### 1.1 Modify `quests` Table
Add the following columns to the existing quests table:

```sql
ALTER TABLE quests ADD COLUMN difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced'));
ALTER TABLE quests ADD COLUMN estimated_hours INTEGER;
ALTER TABLE quests ADD COLUMN effort_level TEXT CHECK (effort_level IN ('light', 'moderate', 'intensive'));
ALTER TABLE quests ADD COLUMN accepted_evidence_types TEXT[]; -- Array of: ['photo', 'video', 'written', 'project_link', 'presentation', 'artifact', 'certificate']
ALTER TABLE quests ADD COLUMN example_submissions TEXT;
ALTER TABLE quests ADD COLUMN core_skills TEXT[]; -- Array of skill tags (see section 2)
ALTER TABLE quests ADD COLUMN resources_needed TEXT;
ALTER TABLE quests ADD COLUMN location_requirements TEXT;
ALTER TABLE quests ADD COLUMN optional_challenges JSONB; -- Structure defined below
ALTER TABLE quests ADD COLUMN safety_considerations TEXT;
ALTER TABLE quests ADD COLUMN requires_adult_supervision BOOLEAN DEFAULT FALSE;
```

### 1.2 Replace `quest_xp_awards` Table
Drop the old subject-based XP table and create a new skills-based one:

```sql
DROP TABLE quest_xp_awards;

CREATE TABLE quest_skill_xp (
    id SERIAL PRIMARY KEY,
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
    skill_category TEXT NOT NULL, -- One of the 6 main categories
    xp_amount INTEGER NOT NULL CHECK (xp_amount > 0)
);
```

### 1.3 Create New Tables for Diplomas and Skills Tracking

```sql
-- Diploma/Portfolio system
CREATE TABLE diplomas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) UNIQUE,
    issued_date TIMESTAMP DEFAULT NOW(),
    portfolio_slug TEXT UNIQUE, -- For URL like optio.com/portfolio/[slug]
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Track user's XP by skill category
CREATE TABLE user_skill_xp (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    skill_category TEXT NOT NULL,
    total_xp INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, skill_category)
);

-- Track individual skill development
CREATE TABLE user_skill_details (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    skill_name TEXT NOT NULL, -- Specific skill like 'reading', 'grit', etc.
    times_practiced INTEGER DEFAULT 0,
    last_practiced TIMESTAMP,
    UNIQUE(user_id, skill_name)
);
```

### 1.4 Optional Challenges JSON Structure
The `optional_challenges` JSONB field should follow this structure:

```json
[
  {
    "description": "Read 'Into Thin Air' and write about how it connects to your experience",
    "core_skills": ["reading"],
    "skill_category": "reading_writing",
    "xp_amount": 30
  }
]
```

## 2. Core Skills Framework

### 2.1 Skill Categories (for `skill_category` field)
These are the 6 main categories for XP tracking:
- `reading_writing`
- `thinking_skills`
- `personal_growth`
- `life_skills`
- `making_creating`
- `world_understanding`

### 2.2 Individual Skills (for `core_skills` array)
These are the specific skills that can be tagged in quests:

```javascript
const CORE_SKILLS = {
  reading_writing: [
    'reading',
    'writing',
    'speaking',
    'digital_media',
    'math_data'
  ],
  thinking_skills: [
    'critical_thinking',
    'creative_thinking',
    'research',
    'information_literacy',
    'systems_thinking',
    'decision_making'
  ],
  personal_growth: [
    'learning_reflection',
    'emotional_skills',
    'grit',
    'time_management'
  ],
  life_skills: [
    'money_skills',
    'health_fitness',
    'home_skills',
    'tech_skills',
    'citizenship'
  ],
  making_creating: [
    'building',
    'art',
    'scientific_method',
    'coding',
    'business_thinking'
  ],
  world_understanding: [
    'cultural_awareness',
    'history',
    'environment',
    'teamwork',
    'ethics_philosophy'
  ]
};
```

## 3. API Endpoint Updates

### 3.1 User Registration - Auto-Issue Diploma
Update `/api/auth/register` to automatically create a diploma when a user registers:

```python
# In backend/routes/auth.py after successful user creation
def create_diploma_for_user(user_id):
    portfolio_slug = generate_unique_slug(user['username'])  # Create URL-safe slug
    diploma_data = {
        'user_id': user_id,
        'portfolio_slug': portfolio_slug
    }
    supabase.table('diplomas').insert(diploma_data).execute()
    
    # Initialize skill categories with 0 XP
    for category in ['reading_writing', 'thinking_skills', 'personal_growth', 
                     'life_skills', 'making_creating', 'world_understanding']:
        supabase.table('user_skill_xp').insert({
            'user_id': user_id,
            'skill_category': category,
            'total_xp': 0
        }).execute()
```

### 3.2 Quest Submission Updates
Update `/api/quests/<quest_id>/submit` to handle skill-based XP:

```python
# When quest is approved, update skill XP instead of subject XP
def award_skill_xp(user_id, quest_id):
    # Get quest skill awards
    skill_awards = supabase.table('quest_skill_xp').select('*').eq('quest_id', quest_id).execute()
    
    for award in skill_awards.data:
        # Update or create user skill XP
        update_user_skill_xp(user_id, award['skill_category'], award['xp_amount'])
        
    # Track individual skills practiced
    quest = get_quest(quest_id)
    for skill in quest['core_skills']:
        track_skill_practice(user_id, skill)
```

### 3.3 New Portfolio Endpoint
Create public portfolio viewing endpoint:

```python
# backend/routes/portfolio.py
@bp.route('/public/<portfolio_slug>', methods=['GET'])
def get_public_portfolio(portfolio_slug):
    """
    Public endpoint (no auth required) to view a student's portfolio
    Returns: user info, completed quests with evidence, skill XP totals
    """
    diploma = supabase.table('diplomas').select('*').eq('portfolio_slug', portfolio_slug).single().execute()
    
    if not diploma.data or not diploma.data['is_public']:
        return jsonify({'error': 'Portfolio not found or private'}), 404
    
    user_id = diploma.data['user_id']
    
    # Get user's completed quests with evidence
    completed_quests = supabase.table('user_quests').select(
        '*, quests(*), submissions(*, submission_evidence(*))'
    ).eq('user_id', user_id).eq('status', 'completed').execute()
    
    # Get skill XP totals
    skill_xp = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).execute()
    
    # Get user basic info (not sensitive data)
    user = supabase.table('users').select('username, first_name, last_name').eq('id', user_id).single().execute()
    
    return jsonify({
        'student': user.data,
        'diploma_issued': diploma.data['issued_date'],
        'completed_quests': completed_quests.data,
        'skill_xp': skill_xp.data,
        'portfolio_url': f"https://optio.com/portfolio/{portfolio_slug}"
    })
```

## 4. Frontend Changes

### 4.1 Update Quest Creation/Edit Form (Admin)
Modify `frontend/src/pages/AdminPage.jsx` to include new fields:

```javascript
// Add new form fields for quest creation
const [formData, setFormData] = useState({
  title: '',
  description: '',
  difficulty_level: 'beginner',
  estimated_hours: '',
  effort_level: 'light',
  evidence_requirements: '',
  accepted_evidence_types: [],
  example_submissions: '',
  core_skills: [],
  resources_needed: '',
  location_requirements: '',
  skill_xp_awards: [], // Now uses skill categories instead of subjects
  optional_challenges: [],
  safety_considerations: '',
  requires_adult_supervision: false
});

// Update the form to include:
// - Difficulty level dropdown (beginner/intermediate/advanced)
// - Effort level dropdown (light/moderate/intensive)
// - Multi-select for core skills
// - Multi-select for evidence types
// - Optional challenges builder (description, skills, XP)
// - Safety considerations textarea
// - Adult supervision checkbox
```

### 4.2 Update Quest Display Components
Modify `frontend/src/components/QuestCard.jsx` and `frontend/src/pages/QuestDetailPage.jsx`:

- Replace subject badges with skill badges
- Add difficulty and effort indicators
- Show estimated hours prominently
- Display optional challenges as expandable cards
- Show safety alerts if `requires_adult_supervision` is true

### 4.3 New Portfolio Page
Create `frontend/src/pages/PortfolioPage.jsx`:

```javascript
// Public-facing portfolio page
// Route: /portfolio/:slug
// Shows:
// - Student name and diploma issue date
// - Skill category progress bars
// - Completed quests gallery with evidence
// - Total quests completed
// - Downloadable/printable diploma certificate
```

### 4.4 Update Dashboard
Modify `frontend/src/pages/DashboardPage.jsx`:

- Replace subject XP with skill category XP
- Add "View My Portfolio" button
- Add "Share Portfolio Link" functionality
- Show skill category progress with visual charts
- Display "quests that develop skills you haven't practiced recently"

## 5. Quest Migration

### 5.1 Create Migration Script
Create a migration script to convert existing quests from subject-based to skill-based:

```python
# migration_script.py
SUBJECT_TO_SKILL_MAP = {
    'language_arts': {'category': 'reading_writing', 'skills': ['reading', 'writing']},
    'math': {'category': 'thinking_skills', 'skills': ['math_data', 'critical_thinking']},
    'science': {'category': 'making_creating', 'skills': ['scientific_method', 'research']},
    'social_studies': {'category': 'world_understanding', 'skills': ['history', 'cultural_awareness']},
    'physical_education': {'category': 'life_skills', 'skills': ['health_fitness']},
    'technology': {'category': 'making_creating', 'skills': ['coding', 'tech_skills']},
    'arts': {'category': 'making_creating', 'skills': ['art', 'creative_thinking']},
    'foreign_language': {'category': 'world_understanding', 'skills': ['cultural_awareness', 'speaking']}
}

# For each existing quest:
# 1. Map old subjects to new skill categories and core skills
# 2. Set default difficulty_level based on XP amounts
# 3. Estimate hours based on XP (rough formula: XP/10 = hours)
# 4. Set placeholder values for new required fields
```

## 6. Testing Requirements

### 6.1 Test Cases
- Verify diploma is automatically created on user registration
- Test public portfolio access with correct slug
- Verify skill XP is awarded correctly when quests are completed
- Test optional challenge XP awards
- Ensure old subject-based system is fully replaced
- Test quest filtering by difficulty/effort/skills
- Verify portfolio privacy settings work

### 6.2 Data Validation
- Ensure all core_skills values match the predefined list
- Validate skill_category is one of the 6 categories
- Check that estimated_hours is reasonable (1-200)
- Verify optional_challenges JSON structure

## 7. Deployment Steps

1. **Backup current database**
2. **Run schema migrations** in this order:
   - Add new columns to quests table
   - Create new tables (diplomas, user_skill_xp, etc.)
   - Run data migration script
   - Drop old quest_xp_awards table
3. **Deploy backend changes**
4. **Deploy frontend changes**
5. **Create diplomas for existing users** (one-time script)
6. **Test with sample quests**

## 8. Success Metrics

Track these after launch:
- Portfolio views per user
- Skill distribution across completed quests
- Optional challenge completion rate
- Average skills per quest (should be 2-4)
- User engagement with different difficulty levels

## Notes for Developer

- All quest text should use "you" language directed at students
- The diploma is given immediately - it's not a goal, it's a starting point
- Portfolio URLs must be shareable without authentication
- Consider adding social sharing buttons for portfolio pages
- Keep the old data archived before migration for rollback capability

This represents a fundamental shift from "earning a diploma" to "building a meaningful portfolio." The code should reflect this philosophy throughout.