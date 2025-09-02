-- Quest Template System Migration
-- This migration updates the database schema for the new quest template system
-- with subject-aligned pillars, location features, and enhanced collaboration

-- =====================================================
-- PHASE 1: Update existing tables
-- =====================================================

-- 1.1 Update quest_tasks table
ALTER TABLE quest_tasks 
ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100),
ADD COLUMN IF NOT EXISTS collaboration_eligible BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS location_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS evidence_prompt TEXT,
ADD COLUMN IF NOT EXISTS is_optional BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS alternative_to UUID REFERENCES quest_tasks(id);

-- Add index for alternative task lookups
CREATE INDEX IF NOT EXISTS idx_quest_tasks_alternative ON quest_tasks(alternative_to);

-- =====================================================
-- PHASE 2: Create new tables
-- =====================================================

-- 2.1 Quest metadata table
CREATE TABLE IF NOT EXISTS quest_metadata (
  quest_id UUID PRIMARY KEY REFERENCES quests(id) ON DELETE CASCADE,
  category VARCHAR(100),
  difficulty_tier INTEGER CHECK (difficulty_tier BETWEEN 1 AND 5),
  location_type VARCHAR(50) CHECK (location_type IN ('anywhere', 'specific_location', 'local_community')),
  location_address TEXT,
  location_coordinates POINT,
  location_radius_km FLOAT,
  venue_name VARCHAR(255),
  estimated_hours VARCHAR(50),
  materials_needed TEXT[],
  prerequisites UUID[],
  tags TEXT[],
  seasonal_start DATE,
  seasonal_end DATE,
  is_featured BOOLEAN DEFAULT false,
  team_size_limit INTEGER DEFAULT 5 CHECK (team_size_limit BETWEEN 1 AND 5),
  path_id UUID,
  unlocks_quests UUID[],
  collaboration_prompts TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2.2 Quest paths/collections table
CREATE TABLE IF NOT EXISTS quest_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  icon_url TEXT,
  quest_order UUID[],
  completion_badge_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add foreign key for path_id in quest_metadata
ALTER TABLE quest_metadata 
ADD CONSTRAINT fk_quest_metadata_path 
FOREIGN KEY (path_id) REFERENCES quest_paths(id);

-- 2.3 Student quest customizations table
CREATE TABLE IF NOT EXISTS quest_customizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  custom_tasks JSONB,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  admin_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

-- 2.4 User badges table
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  badge_type VARCHAR(50) NOT NULL,
  badge_name VARCHAR(100),
  badge_description TEXT,
  badge_icon_url TEXT,
  badge_data JSONB,
  earned_at TIMESTAMP DEFAULT NOW()
);

-- Create index for badge lookups
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_type ON user_badges(badge_type);

-- 2.5 User mastery levels table
CREATE TABLE IF NOT EXISTS user_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  total_xp INTEGER DEFAULT 0,
  mastery_level INTEGER DEFAULT 1,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- 2.6 Pillar subcategories table
CREATE TABLE IF NOT EXISTS pillar_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pillar VARCHAR(50) NOT NULL,
  subcategory VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  display_order INTEGER,
  UNIQUE(pillar, subcategory)
);

-- =====================================================
-- PHASE 3: Migrate existing pillar data
-- =====================================================

-- 3.1 Create mapping for old pillars to new pillars
CREATE TEMPORARY TABLE pillar_mapping (
  old_pillar VARCHAR(50),
  new_pillar VARCHAR(50)
);

INSERT INTO pillar_mapping VALUES
('creativity', 'arts_creativity'),
('critical_thinking', 'stem_logic'),
('practical_skills', 'life_wellness'),
('communication', 'language_communication'),
('cultural_literacy', 'society_culture');

-- 3.2 Update existing quest_tasks with new pillar values
UPDATE quest_tasks qt
SET pillar = pm.new_pillar
FROM pillar_mapping pm
WHERE qt.pillar = pm.old_pillar;

-- 3.3 Update user_skill_xp table with new pillar values
UPDATE user_skill_xp xp
SET pillar = pm.new_pillar
FROM pillar_mapping pm
WHERE xp.pillar = pm.old_pillar;

DROP TABLE pillar_mapping;

-- =====================================================
-- PHASE 4: Populate pillar subcategories
-- =====================================================

INSERT INTO pillar_subcategories (pillar, subcategory, display_order) VALUES
-- Arts & Creativity
('arts_creativity', 'Visual Arts', 1),
('arts_creativity', 'Music', 2),
('arts_creativity', 'Drama & Theater', 3),
('arts_creativity', 'Creative Writing', 4),
('arts_creativity', 'Digital Media', 5),
('arts_creativity', 'Design', 6),

-- STEM & Logic
('stem_logic', 'Mathematics', 1),
('stem_logic', 'Biology', 2),
('stem_logic', 'Chemistry', 3),
('stem_logic', 'Physics', 4),
('stem_logic', 'Computer Science', 5),
('stem_logic', 'Engineering', 6),
('stem_logic', 'Data Science', 7),

-- Language & Communication
('language_communication', 'English', 1),
('language_communication', 'Foreign Languages', 2),
('language_communication', 'Journalism', 3),
('language_communication', 'Public Speaking', 4),
('language_communication', 'Digital Communication', 5),
('language_communication', 'Literature', 6),

-- Society & Culture
('society_culture', 'History', 1),
('society_culture', 'Geography', 2),
('society_culture', 'Social Studies', 3),
('society_culture', 'World Cultures', 4),
('society_culture', 'Civics & Government', 5),
('society_culture', 'Psychology', 6),
('society_culture', 'Sociology', 7),

-- Life & Wellness
('life_wellness', 'Physical Education', 1),
('life_wellness', 'Health & Nutrition', 2),
('life_wellness', 'Personal Finance', 3),
('life_wellness', 'Life Skills', 4),
('life_wellness', 'Mental Wellness', 5),
('life_wellness', 'Outdoor Education', 6),
('life_wellness', 'Sports & Athletics', 7)
ON CONFLICT (pillar, subcategory) DO NOTHING;

-- =====================================================
-- PHASE 5: Initialize user mastery for existing users
-- =====================================================

-- Calculate total XP for each user and create mastery records
INSERT INTO user_mastery (user_id, total_xp, mastery_level)
SELECT 
  u.id,
  COALESCE(SUM(xp.xp_amount), 0) as total_xp,
  CASE
    WHEN COALESCE(SUM(xp.xp_amount), 0) <= 500 THEN 1
    WHEN COALESCE(SUM(xp.xp_amount), 0) <= 1500 THEN 2
    WHEN COALESCE(SUM(xp.xp_amount), 0) <= 3500 THEN 3
    WHEN COALESCE(SUM(xp.xp_amount), 0) <= 7000 THEN 4
    WHEN COALESCE(SUM(xp.xp_amount), 0) <= 12500 THEN 5
    WHEN COALESCE(SUM(xp.xp_amount), 0) <= 20000 THEN 6
    WHEN COALESCE(SUM(xp.xp_amount), 0) <= 30000 THEN 7
    WHEN COALESCE(SUM(xp.xp_amount), 0) <= 45000 THEN 8
    WHEN COALESCE(SUM(xp.xp_amount), 0) <= 65000 THEN 9
    WHEN COALESCE(SUM(xp.xp_amount), 0) <= 90000 THEN 10
    WHEN COALESCE(SUM(xp.xp_amount), 0) <= 120000 THEN 11
    WHEN COALESCE(SUM(xp.xp_amount), 0) <= 160000 THEN 12
    ELSE 13 + ((COALESCE(SUM(xp.xp_amount), 0) - 160000) / 40000)
  END as mastery_level
FROM users u
LEFT JOIN user_skill_xp xp ON u.id = xp.user_id
GROUP BY u.id
ON CONFLICT (user_id) DO NOTHING;

-- =====================================================
-- PHASE 6: Create indexes for performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_quest_metadata_location ON quest_metadata(location_type);
CREATE INDEX IF NOT EXISTS idx_quest_metadata_category ON quest_metadata(category);
CREATE INDEX IF NOT EXISTS idx_quest_metadata_seasonal ON quest_metadata(seasonal_start, seasonal_end);
CREATE INDEX IF NOT EXISTS idx_quest_metadata_featured ON quest_metadata(is_featured);
CREATE INDEX IF NOT EXISTS idx_quest_tasks_pillar ON quest_tasks(pillar);
CREATE INDEX IF NOT EXISTS idx_quest_tasks_subcategory ON quest_tasks(subcategory);

-- =====================================================
-- PHASE 7: Create helper functions
-- =====================================================

-- Function to calculate user mastery level from XP
CREATE OR REPLACE FUNCTION calculate_mastery_level(total_xp INTEGER)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE
    WHEN total_xp <= 500 THEN 1
    WHEN total_xp <= 1500 THEN 2
    WHEN total_xp <= 3500 THEN 3
    WHEN total_xp <= 7000 THEN 4
    WHEN total_xp <= 12500 THEN 5
    WHEN total_xp <= 20000 THEN 6
    WHEN total_xp <= 30000 THEN 7
    WHEN total_xp <= 45000 THEN 8
    WHEN total_xp <= 65000 THEN 9
    WHEN total_xp <= 90000 THEN 10
    WHEN total_xp <= 120000 THEN 11
    WHEN total_xp <= 160000 THEN 12
    ELSE 13 + ((total_xp - 160000) / 40000)
  END;
END;
$$ LANGUAGE plpgsql;

-- Function to update user mastery level
CREATE OR REPLACE FUNCTION update_user_mastery()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE user_mastery
  SET 
    total_xp = (SELECT COALESCE(SUM(xp_amount), 0) FROM user_skill_xp WHERE user_id = NEW.user_id),
    mastery_level = calculate_mastery_level((SELECT COALESCE(SUM(xp_amount), 0) FROM user_skill_xp WHERE user_id = NEW.user_id)),
    last_updated = NOW()
  WHERE user_id = NEW.user_id;
  
  -- Create mastery record if it doesn't exist
  IF NOT FOUND THEN
    INSERT INTO user_mastery (user_id, total_xp, mastery_level)
    VALUES (
      NEW.user_id,
      (SELECT COALESCE(SUM(xp_amount), 0) FROM user_skill_xp WHERE user_id = NEW.user_id),
      calculate_mastery_level((SELECT COALESCE(SUM(xp_amount), 0) FROM user_skill_xp WHERE user_id = NEW.user_id))
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update mastery on XP changes
CREATE TRIGGER update_mastery_on_xp_change
AFTER INSERT OR UPDATE ON user_skill_xp
FOR EACH ROW
EXECUTE FUNCTION update_user_mastery();

-- =====================================================
-- PHASE 8: Grant permissions (adjust as needed)
-- =====================================================

-- Grant permissions to authenticated users
GRANT SELECT ON quest_metadata TO authenticated;
GRANT SELECT ON quest_paths TO authenticated;
GRANT SELECT ON pillar_subcategories TO authenticated;
GRANT SELECT ON user_badges TO authenticated;
GRANT SELECT ON user_mastery TO authenticated;
GRANT INSERT, UPDATE ON quest_customizations TO authenticated;

-- Grant full access to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- =====================================================
-- Migration complete!
-- =====================================================