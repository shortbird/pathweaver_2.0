-- Seed Reflection Prompts for Quest Set Down Flow
-- Run this AFTER badge_system_redesign.sql migration

-- ============================================
-- Reflection Prompts by Category
-- ============================================

INSERT INTO quest_reflection_prompts (prompt_text, category, is_active) VALUES

-- DISCOVERY Category (5 prompts)
('What surprised you most about this exploration?', 'discovery', true),
('What new question emerged from this journey?', 'discovery', true),
('What did you discover that you didn''t expect?', 'discovery', true),
('What was the most interesting thing you learned?', 'discovery', true),
('What would you explore next based on what you discovered?', 'discovery', true),

-- GROWTH Category (5 prompts)
('How did this quest stretch your thinking?', 'growth', true),
('What skill feels stronger now than when you started?', 'growth', true),
('What did you learn about how you learn?', 'growth', true),
('How has your perspective changed since picking this up?', 'growth', true),
('What can you do now that you couldn''t do before?', 'growth', true),

-- CHALLENGE Category (5 prompts)
('What was the hardest part, and how did you navigate it?', 'challenge', true),
('When did you feel most out of your comfort zone?', 'challenge', true),
('What obstacle did you overcome during this quest?', 'challenge', true),
('What would you do differently if you picked this up again?', 'challenge', true),
('What helped you push through when things got difficult?', 'challenge', true),

-- CONNECTION Category (5 prompts)
('How does this connect to something else you''re learning?', 'connection', true),
('What real-world application can you see for this?', 'connection', true),
('How might this knowledge help you in your daily life?', 'connection', true),
('What other topics does this make you curious about?', 'connection', true),
('How does this relate to your other interests or passions?', 'connection', true),

-- IDENTITY Category (5 prompts)
('What did this teach you about yourself?', 'identity', true),
('How has this changed the way you see your abilities?', 'identity', true),
('What strength did you discover in yourself through this?', 'identity', true),
('How does this fit into who you''re becoming?', 'identity', true),
('What part of this experience feels most like "you"?', 'identity', true);

-- ============================================
-- Verification
-- ============================================

-- Check that all prompts were inserted
SELECT category, COUNT(*) as prompt_count
FROM quest_reflection_prompts
WHERE is_active = true
GROUP BY category
ORDER BY category;

-- Show sample of prompts
SELECT category, prompt_text
FROM quest_reflection_prompts
WHERE is_active = true
ORDER BY category, created_at
LIMIT 10;

COMMIT;
