# Optio Quest Template Implementation Plan

## Executive Summary
This plan outlines the implementation of a flexible, scalable quest system supporting hundreds of quests with location-based features, collaboration bonuses, student customization, and quality-focused task design.

## Detailed Implementation To-Do List

### Backend Database Tasks
- [ ] Create migration script for new pillar structure (arts_creativity, stem_logic, etc.)
- [ ] Add subcategory column to quest_tasks table
- [ ] Create quest_metadata table for location, difficulty, seasonal data
- [ ] Create quest_paths table for quest collections
- [ ] Create quest_customizations table for student proposals
- [ ] Create user_badges table for location badges
- [ ] Create user_mastery table for XP-based levels
- [ ] Create pillar_subcategories table and populate with school subjects
- [ ] Update existing quest data to new pillar structure
- [ ] Add collaboration_eligible field to quest_tasks
- [ ] Add location_required field to quest_tasks
- [ ] Add evidence_prompt field to quest_tasks
- [ ] Add is_optional and alternative_to fields for choice paths

### Backend API Tasks
- [ ] Update GET /api/v3/quests to include location filtering
- [ ] Add endpoint for "Quests Near Me" with address-based search
- [ ] Update task completion to handle 2x XP for all tasks when collaborating
- [ ] Add endpoint for quest path/collection management
- [ ] Update quest submission endpoint to support student customizations
- [ ] Add badge awarding logic for location-based completions
- [ ] Create user mastery level calculation service
- [ ] Add seasonal quest filtering logic
- [ ] Update XP service to use new pillar structure
- [ ] Add team size validation (max 5) for collaboration

### Admin Panel Tasks
- [ ] Create quest builder interface with all new fields
- [ ] Add location input with address autocomplete
- [ ] Create task builder with pillar/subcategory dropdowns
- [ ] Add seasonal date pickers
- [ ] Create quest path management interface
- [ ] Add bulk quest import from CSV/spreadsheet
- [ ] Create quest preview before publishing
- [ ] Add quest quality checklist tool
- [ ] Create badge management interface
- [ ] Add quest analytics dashboard

### Gemini API Integration Tasks
- [ ] Set up Gemini API credentials and client
- [ ] Create quest extrapolation endpoint
- [ ] Create bulk quest generation endpoint
- [ ] Build prompt templates for quest generation
- [ ] Add task suggestion feature for quest builder
- [ ] Create evidence prompt auto-generation
- [ ] Add pillar/subcategory auto-assignment
- [ ] Create validation for AI-generated content
- [ ] Add admin review queue for AI quests
- [ ] Create usage tracking and rate limiting

### Frontend Quest Hub Tasks
- [ ] Update quest cards to show new pillars
- [ ] Add location badge indicators
- [ ] Create map view for location-based quests
- [ ] Add "Near Me" filter with distance selector
- [ ] Show seasonal availability indicators
- [ ] Add quest path/collection browser
- [ ] Update collaboration UI to show team size limits
- [ ] Add subcategory filters within pillars
- [ ] Create choose-your-own-adventure task selector
- [ ] Show alternative task options clearly

### Frontend Quest Detail Tasks
- [ ] Display all 5 pillars with subcategories
- [ ] Show location requirements with map
- [ ] Display collaboration bonus prominently
- [ ] Show team size limit (max 5)
- [ ] Display seasonal availability
- [ ] Show quest path progression
- [ ] Add "Start with Friends" button
- [ ] Display evidence requirements per task
- [ ] Show optional vs required tasks
- [ ] Display prerequisite quests

### Frontend User Profile Tasks
- [ ] Display user mastery level (1-13+)
- [ ] Show total XP across all pillars
- [ ] Display earned location badges
- [ ] Show quest path completions
- [ ] Display collaboration history
- [ ] Update XP breakdown for new pillars
- [ ] Show progress toward next level
- [ ] Display seasonal quest achievements

### Testing Tasks
- [ ] Test pillar migration with existing data
- [ ] Test location-based search accuracy
- [ ] Test collaboration XP calculations
- [ ] Test team size limits
- [ ] Test seasonal quest visibility
- [ ] Test AI quest generation quality
- [ ] Test choose-your-own paths
- [ ] Test badge awarding logic
- [ ] Test mastery level calculations
- [ ] Load test with 100+ quests

### Documentation Tasks
- [ ] Update API documentation
- [ ] Create quest creation guide for admins
- [ ] Document Gemini API prompts
- [ ] Create pillar/subcategory guide
- [ ] Write location quest best practices
- [ ] Update CLAUDE.md with new structure
- [ ] Create student guide for new features
- [ ] Document collaboration rules

## Phase 1: Database Schema Updates (Week 1)

### 1.1 Update quest_tasks table
```sql
ALTER TABLE quest_tasks ADD COLUMN IF NOT EXISTS:
- subcategory VARCHAR(100) -- e.g., "Visual Arts", "Algebra", "Biology"
- collaboration_eligible BOOLEAN DEFAULT true
- location_required BOOLEAN DEFAULT false
- evidence_prompt TEXT
- is_optional BOOLEAN DEFAULT false -- for choose-your-own-adventure
- alternative_to UUID -- reference to another task (for choice paths)
```

### 1.2 Create new tables
```sql
-- Quest metadata and organization
CREATE TABLE quest_metadata (
  quest_id UUID PRIMARY KEY REFERENCES quests(id),
  category VARCHAR(100), -- "Creative Arts", "STEM", "Life Skills", etc.
  difficulty_tier INTEGER CHECK (tier BETWEEN 1 AND 5),
  location_type VARCHAR(50), -- "anywhere", "specific_location", "local_community"
  location_address TEXT,
  location_coordinates POINT,
  location_radius_km FLOAT,
  estimated_hours VARCHAR(50),
  materials_needed TEXT[],
  prerequisites UUID[], -- quest IDs
  tags TEXT[],
  seasonal_start DATE,
  seasonal_end DATE,
  is_featured BOOLEAN DEFAULT false,
  team_size_limit INTEGER DEFAULT 5,
  path_id UUID REFERENCES quest_paths(id)
);

-- Quest paths/collections
CREATE TABLE quest_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255),
  description TEXT,
  icon_url TEXT,
  quest_order UUID[], -- ordered list of quest IDs
  completion_badge_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Student quest customizations
CREATE TABLE quest_customizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID REFERENCES quests(id),
  user_id UUID REFERENCES users(id),
  custom_tasks JSONB, -- proposed additional/alternative tasks
  status VARCHAR(50), -- "pending", "approved", "rejected"
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Location badges
CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  badge_type VARCHAR(50), -- "local_explorer", "museum_visitor", etc.
  badge_data JSONB,
  earned_at TIMESTAMP DEFAULT NOW()
);

-- User mastery levels (global XP-based)
CREATE TABLE user_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) UNIQUE,
  total_xp INTEGER DEFAULT 0,
  mastery_level INTEGER DEFAULT 1, -- calculated from total_xp
  last_updated TIMESTAMP DEFAULT NOW()
);
```

### 1.3 Update pillar structure - OPTION E: Subject-Aligned
```sql
-- Update pillars to subject-aligned structure
ALTER TABLE quest_tasks 
ALTER COLUMN pillar TYPE VARCHAR(50);

-- New pillar values:
-- 'arts_creativity' - Arts & Creativity
-- 'stem_logic' - STEM & Logic  
-- 'language_communication' - Language & Communication
-- 'society_culture' - Society & Culture
-- 'life_wellness' - Life & Wellness

-- Add subcategories to pillars
CREATE TABLE pillar_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pillar VARCHAR(50),
  subcategory VARCHAR(100),
  description TEXT,
  icon VARCHAR(50)
);

-- Initial subcategories aligned with high school subjects
INSERT INTO pillar_subcategories (pillar, subcategory) VALUES
-- Arts & Creativity
('arts_creativity', 'Visual Arts'),
('arts_creativity', 'Music'),
('arts_creativity', 'Drama & Theater'),
('arts_creativity', 'Creative Writing'),
('arts_creativity', 'Digital Media'),
('arts_creativity', 'Design'),

-- STEM & Logic
('stem_logic', 'Mathematics'),
('stem_logic', 'Biology'),
('stem_logic', 'Chemistry'),
('stem_logic', 'Physics'),
('stem_logic', 'Computer Science'),
('stem_logic', 'Engineering'),
('stem_logic', 'Data Science'),

-- Language & Communication
('language_communication', 'English'),
('language_communication', 'Foreign Languages'),
('language_communication', 'Journalism'),
('language_communication', 'Public Speaking'),
('language_communication', 'Digital Communication'),
('language_communication', 'Literature'),

-- Society & Culture
('society_culture', 'History'),
('society_culture', 'Geography'),
('society_culture', 'Social Studies'),
('society_culture', 'World Cultures'),
('society_culture', 'Civics & Government'),
('society_culture', 'Psychology'),
('society_culture', 'Sociology'),

-- Life & Wellness
('life_wellness', 'Physical Education'),
('life_wellness', 'Health & Nutrition'),
('life_wellness', 'Personal Finance'),
('life_wellness', 'Life Skills'),
('life_wellness', 'Mental Wellness'),
('life_wellness', 'Outdoor Education'),
('life_wellness', 'Sports & Athletics');
```

## Phase 2: Quest Template Structure (Week 1-2)

### 2.1 Finalized Quest JSON Template
```javascript
{
  // Core Identity
  "title": "Action-oriented quest title",
  "description": "What students will create/accomplish",
  "source": "admin|community|ai_assisted",
  
  // Categorization
  "category": "STEM|Creative Arts|Life Skills|Social Impact|Entrepreneurship|Sports & Wellness",
  "difficulty_tier": 1-5,
  "tags": ["searchable", "keywords"],
  
  // Location Features
  "location_type": "anywhere|specific_location|local_community",
  "location_details": {
    "address": "123 Museum Way, City, State",
    "coordinates": [lat, lng],
    "radius_km": 5,
    "venue_name": "Natural History Museum"
  },
  
  // Requirements
  "prerequisites": ["quest_id_1", "quest_id_2"],
  "materials_needed": ["optional list"],
  
  // Seasonal/Time
  "seasonal_dates": {
    "start": "2024-06-01",
    "end": "2024-08-31"
  },
  
  // Tasks - Quality over Quantity
  "tasks": [
    {
      "title": "Do/Create something specific",
      "description": "Clear action instructions",
      "pillar": "arts_creativity|stem_logic|language_communication|society_culture|life_wellness",
      "subcategory": "Visual Arts|Mathematics|etc",
      "xp_value": 50-200,
      "evidence_prompt": "What to document/share",
      "evidence_types": ["text", "image", "video_link", "document", "link"],
      "collaboration_eligible": true,
      "location_required": false,
      "is_optional": false,
      "alternative_to": null // for choose-your-own paths
    }
  ],
  
  // Path/Collection
  "path_id": "entrepreneur_path_uuid",
  "unlocks_quests": ["advanced_quest_id"],
  
  // Collaboration
  "team_size_limit": 5,
  "collaboration_prompts": [
    "Work with someone who has different skills",
    "Team up with family or friends"
  ],
  
  // Metadata
  "is_featured": false,
  "is_active": true,
  "created_by": "admin",
  "ai_generation_prompt": "optional - for AI-assisted creation"
}
```

### 2.2 Mastery Level System (User-Level)
Simple XP-based progression at the USER level (not per quest):

**Level 1** - 0-500 XP
**Level 2** - 501-1,500 XP
**Level 3** - 1,501-3,500 XP
**Level 4** - 3,501-7,000 XP
**Level 5** - 7,001-12,500 XP
**Level 6** - 12,501-20,000 XP
**Level 7** - 20,001-30,000 XP
**Level 8** - 30,001-45,000 XP
**Level 9** - 45,001-65,000 XP
**Level 10** - 65,001-90,000 XP
**Level 11** - 90,001-120,000 XP
**Level 12** - 120,001-160,000 XP
**Level 13+** - Continues scaling by ~40,000 XP per level

This is total XP across all pillars, providing a global mastery level for each user.

## Phase 3: Feature Implementation (Week 2-3)

### 3.1 Location-Based Features
- **Quest Discovery**: "Quests Near Me" using address-level data
- **Local Badge System**: Award badges for completing quests at specific venues
- **Museum/Trail Integration**: Partner-specific quest creation tools
- **Address Storage**: Store specific addresses for location-based quests

### 3.2 Choose Your Own Adventure Paths
- **Alternative Tasks**: Students can choose between 2-3 task options
- **Custom Quest Proposals**: Students propose their own complete quests (existing feature)
- **Adaptive Difficulty**: Optional harder tasks for bonus XP
- **Personal Context**: Students can propose quest variations for their context

### 3.3 Collaboration Features
- **2x XP for ALL tasks** when completed with teammates (up to 5 people)
- **Friend System Integration**: Use existing friend system for team formation
- **Separate Evidence Submission**: Each teammate submits their own evidence
- **Team Completion Tracking**: Show who you completed quests with

### 3.4 Quest Paths/Collections
- **Themed Collections**: "Entrepreneur Path", "Artist Journey", "STEM Explorer"
- **Progressive Unlocking**: Complete foundational quests to unlock advanced ones
- **Path Completion Badges**: Special recognition for completing entire paths
- **Suggested Next Quests**: Smart recommendations based on completed quests

## Phase 4: Content Creation Strategy (Week 3-4)

### 4.1 Admin Quest Creation
- Build admin interface for rapid quest creation
- Template library for common quest patterns
- Bulk import from spreadsheets
- Quality checklist before publishing

### 4.2 AI-Assisted Generation (Gemini API)
- **Extrapolation Feature**: Take existing quest form data and generate additional task ideas
- **Bulk Generation**: Create multiple quests from themes/categories
- **Task Suggestions**: Generate tasks based on quest title and pillars
- **Evidence Prompts**: Auto-generate appropriate evidence requirements
- **Pillar Assignment**: Intelligently assign pillars and subcategories

Implementation approach:
```python
# Example Gemini API integration
def extrapolate_quest(existing_quest_data):
    """Take partial quest and generate more tasks/ideas"""
    prompt = f"""
    Given this quest: {existing_quest_data}
    Generate 5 more tasks that:
    - Align with subject-based pillars
    - Include diverse evidence types
    - Vary in difficulty
    - Support collaboration
    """
    return gemini.generate(prompt)

def bulk_generate_quests(theme, count):
    """Generate multiple quests for a theme"""
    prompt = f"""
    Create {count} unique quests for {theme}
    Each should have 3-8 quality tasks
    Cover all 5 subject-aligned pillars
    """
    return gemini.generate(prompt)
```

### 4.3 Community Submissions
- Use existing quest proposal system
- Admin approval workflow
- No remix function initially
- Attribution to student creators

## Phase 5: UI/UX Updates (Week 4)

### 5.1 Quest Hub Improvements
- Filter by location (show map view)
- Filter by subcategory within pillars
- Path/collection browsing
- Seasonal quest highlights
- "Start with friends" prominent button

### 5.2 Task Display
- Show pillar AND subcategory for each task
- Alternative task paths clearly marked
- Collaboration bonus indicators
- Location requirements with map preview

### 5.3 Progress Tracking
- Mastery level display (1-10+)
- Path progression visualization
- Local explorer badges showcase
- Team completion history

## Phase 6: Finalized Pillar Structure (Option E - Subject-Aligned)

### The 5 Subject-Aligned Pillars:

1. **Arts & Creativity** 
   - Visual Arts, Music, Drama, Creative Writing, Digital Media, Design
   - Focus: Original creation, artistic expression, innovation

2. **STEM & Logic**
   - Mathematics, Sciences, Computer Science, Engineering, Data Science
   - Focus: Analysis, problem-solving, technical skills, research

3. **Language & Communication**
   - English, Foreign Languages, Journalism, Public Speaking, Literature
   - Focus: Expression, connection, teaching, sharing ideas

4. **Society & Culture**
   - History, Geography, Social Studies, Civics, Psychology, World Cultures
   - Focus: Understanding context, community impact, global awareness

5. **Life & Wellness**
   - Physical Education, Health, Personal Finance, Life Skills, Sports
   - Focus: Physical activity, practical skills, personal development

This structure:
- Aligns with familiar school subjects
- Accommodates physical activity naturally
- Makes sense to students, parents, and educators
- Covers all essential learning areas

## Implementation Timeline

**Week 1**: Database schema updates, pillar subcategories
**Week 2**: Quest template finalization, location features
**Week 3**: Collaboration enhancements, mastery levels
**Week 4**: UI updates, admin tools
**Week 5**: AI integration, bulk quest creation
**Week 6**: Testing, refinement, launch preparation

## Success Metrics

- 100+ high-quality quests created in first month
- 50% of quests support collaboration
- 25% of quests are location-specific
- Average 4-6 tasks per quest covering 3+ pillars
- 80% quest completion rate
- Student-proposed task adoption rate >30%

## Next Steps

1. Approve overall plan and pillar structure
2. Begin database schema updates
3. Create first 10 template quests as examples
4. Build admin quest creation interface
5. Develop AI-assisted quest generation tool

Ready to proceed with implementation upon your approval. Which pillar structure (D, E, F, or G) resonates most with your vision?