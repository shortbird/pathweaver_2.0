-- Seed OnFire Pathway Badges
-- These badges require 3 OnFire courses + 2 custom Optio quests
-- Run this AFTER badge_system_redesign.sql migration

-- ============================================
-- PART 1: Insert 10 OnFire Pathway Badges
-- ============================================

INSERT INTO badges (
    name,
    identity_statement,
    description,
    pillar_primary,
    badge_type,
    onfire_course_requirement,
    optio_quest_requirement,
    min_quests,
    quest_source_filter,
    status,
    ai_generated
) VALUES

-- 1. Digital Creator (STEM)
(
    'Digital Creator',
    'I build digital solutions and create multimedia content',
    'Master the tools of digital creation by completing OnFire courses in web development, graphic design, and video production. Then design your own custom STEM projects to showcase your unique creative vision.',
    'stem',
    'onfire_pathway',
    3,  -- 3 OnFire courses required
    2,  -- 2 custom Optio quests required
    5,  -- Total 5 quests
    'any',
    'active',
    false
),

-- 2. Young Entrepreneur (Civics)
(
    'Young Entrepreneur',
    'I design business solutions and understand economics',
    'Develop entrepreneurial thinking through OnFire business and finance courses. Learn to identify opportunities, create value, and understand how money works in the real world.',
    'civics',
    'onfire_pathway',
    3,
    2,
    5,
    'any',
    'active',
    false
),

-- 3. Creative Technologist (Art)
(
    'Creative Technologist',
    'I merge technology and artistic expression',
    'Blend art and technology by mastering 3D modeling, animation, and game design through OnFire courses. Then create custom art quests that push the boundaries of digital creativity.',
    'art',
    'onfire_pathway',
    3,
    2,
    5,
    'any',
    'active',
    false
),

-- 4. STEM Explorer (STEM)
(
    'STEM Explorer',
    'I investigate how things work through hands-on exploration',
    'Build your foundation in science, technology, engineering, and math through structured OnFire courses. Then design experiments and projects that answer your unique questions about the world.',
    'stem',
    'onfire_pathway',
    3,
    2,
    5,
    'any',
    'active',
    false
),

-- 5. Wellness Advocate (Wellness)
(
    'Wellness Advocate',
    'I cultivate mind-body practices for holistic health',
    'Explore movement, mindfulness, and physical wellness through OnFire fitness and yoga courses. Create your own wellness quests that address your personal health goals and practices.',
    'wellness',
    'onfire_pathway',
    3,
    2,
    5,
    'any',
    'active',
    false
),

-- 6. Storytelling Master (Communication)
(
    'Storytelling Master',
    'I craft narratives that engage and inspire audiences',
    'Develop your voice as a writer through OnFire creative writing and literature courses. Then write and publish your own stories that share your unique perspective with the world.',
    'communication',
    'onfire_pathway',
    3,
    2,
    5,
    'any',
    'active',
    false
),

-- 7. Cultural Connector (Civics)
(
    'Cultural Connector',
    'I explore global cultures and build cross-cultural understanding',
    'Expand your worldview through OnFire language and cultural studies courses. Design quests that help you engage with diverse communities and perspectives in meaningful ways.',
    'civics',
    'onfire_pathway',
    3,
    2,
    5,
    'any',
    'active',
    false
),

-- 8. Visual Artist (Art)
(
    'Visual Artist',
    'I express ideas through visual media and design',
    'Master visual art fundamentals through OnFire art, design, and photography courses. Create custom art quests that showcase your evolving artistic style and vision.',
    'art',
    'onfire_pathway',
    3,
    2,
    5,
    'any',
    'active',
    false
),

-- 9. Scientific Investigator (STEM)
(
    'Scientific Investigator',
    'I ask questions and design experiments to find answers',
    'Think like a scientist by completing OnFire science courses in geology, biology, or earth science. Then design your own investigations that test hypotheses and expand scientific knowledge.',
    'stem',
    'onfire_pathway',
    3,
    2,
    5,
    'any',
    'active',
    false
),

-- 10. Game Designer (Art + STEM)
(
    'Game Designer',
    'I design interactive experiences that engage players',
    'Learn game design principles through OnFire courses in video game creation, board game design, and programming. Build custom game projects that showcase your unique design philosophy.',
    'art',
    'onfire_pathway',
    3,
    2,
    5,
    'any',
    'active',
    false
);

-- ============================================
-- PART 2: Create visual stage progressions for OnFire badges
-- ============================================

-- Define 5-stage abstract shape progression for each badge
-- Each stage represents completing one required quest (visual grows)

UPDATE badges
SET visual_stages = '[
    {
        "stage": 1,
        "description": "Simple circle foundation",
        "svg_path": "M50,50 m-30,0 a30,30 0 1,0 60,0 a30,30 0 1,0 -60,0",
        "color_intensity": 0.4
    },
    {
        "stage": 2,
        "description": "Circle with first geometric layer",
        "svg_path": "M50,50 m-30,0 a30,30 0 1,0 60,0 a30,30 0 1,0 -60,0 M35,35 L65,35 L65,65 L35,65 Z",
        "color_intensity": 0.6
    },
    {
        "stage": 3,
        "description": "Two intersecting shapes",
        "svg_path": "M50,20 L80,50 L50,80 L20,50 Z M35,35 m-15,0 a15,15 0 1,0 30,0 a15,15 0 1,0 -30,0",
        "color_intensity": 0.7
    },
    {
        "stage": 4,
        "description": "Complex pattern emerging",
        "svg_path": "M50,50 m-35,0 a35,35 0 1,0 70,0 a35,35 0 1,0 -70,0 M50,20 L65,40 L80,50 L65,60 L50,80 L35,60 L20,50 L35,40 Z",
        "color_intensity": 0.85
    },
    {
        "stage": 5,
        "description": "Complete mandala - full badge earned",
        "svg_path": "M50,50 m-40,0 a40,40 0 1,0 80,0 a40,40 0 1,0 -80,0 M50,15 L55,35 L65,30 L60,45 L75,50 L60,55 L65,70 L55,65 L50,85 L45,65 L35,70 L40,55 L25,50 L40,45 L35,30 L45,35 Z M35,35 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0 M65,35 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0 M35,65 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0 M65,65 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0",
        "color_intensity": 1.0
    }
]'::jsonb
WHERE badge_type = 'onfire_pathway';

-- ============================================
-- PART 3: Verification Queries
-- ============================================

-- Show all OnFire pathway badges
SELECT
    name,
    identity_statement,
    pillar_primary,
    onfire_course_requirement,
    optio_quest_requirement,
    min_quests,
    status
FROM badges
WHERE badge_type = 'onfire_pathway'
ORDER BY pillar_primary, name;

-- Count by pillar
SELECT
    pillar_primary,
    COUNT(*) as pathway_badge_count
FROM badges
WHERE badge_type = 'onfire_pathway'
GROUP BY pillar_primary
ORDER BY pillar_primary;

-- Verify visual stages are populated
SELECT
    name,
    jsonb_array_length(visual_stages) as stage_count
FROM badges
WHERE badge_type = 'onfire_pathway'
ORDER BY name;

COMMIT;
