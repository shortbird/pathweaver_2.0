-- Seed Initial Badges for Badge System
-- Run this in Supabase SQL Editor

-- Insert foundational badges across all 5 pillars
INSERT INTO badges (name, identity_statement, description, pillar_primary, pillar_weights, min_quests, min_xp, status, ai_generated) VALUES

-- STEM & Logic Badges
('Systems Thinker',
 'I am becoming a systems thinker who sees connections everywhere',
 'Explore how things connect and interact in complex systems. Learn to identify patterns, understand feedback loops, and see the big picture while appreciating the details.',
 'STEM & Logic',
 '{"STEM & Logic": 70, "Society & Culture": 20, "Language & Communication": 10}'::jsonb,
 5, 1500, 'active', false),

('Scientific Investigator',
 'I can ask questions and design experiments to find answers',
 'Develop your scientific curiosity and investigation skills. Learn to form hypotheses, design experiments, collect data, and draw evidence-based conclusions.',
 'STEM & Logic',
 '{"STEM & Logic": 80, "Language & Communication": 15, "Society & Culture": 5}'::jsonb,
 6, 1800, 'active', false),

('Mathematical Reasoner',
 'I am developing my ability to think logically and solve problems',
 'Build your mathematical thinking skills. Explore patterns, relationships, and logical reasoning through hands-on problem solving and real-world applications.',
 'STEM & Logic',
 '{"STEM & Logic": 90, "Arts & Creativity": 10}'::jsonb,
 8, 2500, 'active', false),

-- Life & Wellness Badges
('Mindful Practitioner',
 'I am cultivating awareness and presence in my daily life',
 'Develop mindfulness practices and emotional awareness. Learn techniques for stress management, focus, and living with intention and presence.',
 'Life & Wellness',
 '{"Life & Wellness": 80, "Language & Communication": 10, "Arts & Creativity": 10}'::jsonb,
 4, 1200, 'active', false),

('Physical Wellness Explorer',
 'I am discovering what helps my body feel strong and healthy',
 'Explore different aspects of physical wellness through movement, nutrition, and self-care. Find what works for your unique body and lifestyle.',
 'Life & Wellness',
 '{"Life & Wellness": 85, "STEM & Logic": 10, "Language & Communication": 5}'::jsonb,
 5, 1500, 'active', false),

-- Language & Communication Badges
('Creative Storyteller',
 'I am becoming a storyteller who brings ideas to life through words',
 'Explore the art of narrative across different mediums. Develop your voice as a writer and learn to craft stories that engage, inspire, and connect with others.',
 'Language & Communication',
 '{"Language & Communication": 60, "Arts & Creativity": 30, "Society & Culture": 10}'::jsonb,
 7, 2000, 'active', false),

('Compelling Communicator',
 'I can express my ideas clearly and listen deeply to others',
 'Build your communication skills across writing, speaking, and listening. Learn to share ideas effectively, engage in meaningful dialogue, and understand different perspectives.',
 'Language & Communication',
 '{"Language & Communication": 70, "Society & Culture": 20, "Arts & Creativity": 10}'::jsonb,
 6, 1800, 'active', false),

-- Society & Culture Badges
('Community Builder',
 'I am learning to bring people together and create positive change',
 'Explore what it means to be an active community member. Learn about collaboration, service, leadership, and making a difference in your community.',
 'Society & Culture',
 '{"Society & Culture": 70, "Language & Communication": 20, "Life & Wellness": 10}'::jsonb,
 5, 1500, 'active', false),

('Cultural Explorer',
 'I am discovering the rich diversity of human cultures and experiences',
 'Journey through different cultures, traditions, and perspectives. Develop cultural awareness, empathy, and appreciation for the beautiful diversity of human experience.',
 'Society & Culture',
 '{"Society & Culture": 75, "Language & Communication": 15, "Arts & Creativity": 10}'::jsonb,
 6, 1800, 'active', false),

('Historical Investigator',
 'I can uncover stories from the past and understand how they shape today',
 'Become a detective of history. Learn to research, analyze primary sources, and understand how past events and decisions continue to influence our present.',
 'Society & Culture',
 '{"Society & Culture": 75, "Language & Communication": 15, "STEM & Logic": 10}'::jsonb,
 7, 2000, 'active', false),

-- Arts & Creativity Badges
('Visual Artist',
 'I am developing my ability to express ideas through visual media',
 'Explore various visual art forms from drawing and painting to digital design. Develop your artistic voice and learn to communicate through images.',
 'Arts & Creativity',
 '{"Arts & Creativity": 80, "Language & Communication": 10, "Society & Culture": 10}'::jsonb,
 6, 1800, 'active', false),

('Creative Problem Solver',
 'I can approach challenges with creativity and innovative thinking',
 'Learn to think outside the box and generate innovative solutions. Apply creative thinking to real-world problems and develop your unique problem-solving style.',
 'Arts & Creativity',
 '{"Arts & Creativity": 50, "STEM & Logic": 30, "Language & Communication": 20}'::jsonb,
 5, 1500, 'active', false),

('Design Thinker',
 'I am learning to design solutions that put people first',
 'Explore the design thinking process from empathy to prototyping. Learn to understand user needs and create thoughtful, human-centered solutions.',
 'Arts & Creativity',
 '{"Arts & Creativity": 60, "STEM & Logic": 20, "Society & Culture": 20}'::jsonb,
 6, 1800, 'active', false);

-- Verify insertion
SELECT name, identity_statement, pillar_primary, min_quests, min_xp, status
FROM badges
ORDER BY pillar_primary, name;
