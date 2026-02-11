-- =====================================================
-- SNHU DEMO DATA - Complete Script
-- Run this in Supabase SQL Editor
-- =====================================================

-- Use valid UUID format (version 4 compliant)
-- Jordan: a0000001-0000-4000-8000-000000000001
-- Alex: a0000002-0000-4000-8000-000000000002

-- =====================================================
-- STEP 1: Create Auth Users
-- =====================================================

-- Jordan (Traditional Path)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_sso_user, is_anonymous, created_at, updated_at
) VALUES (
  'a0000001-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'tannerbowman+snhu.jordan@gmail.com',
  crypt('Demo2024!', gen_salt('bf')),
  NOW(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "Jordan Mitchell"}'::jsonb,
  false,
  false,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Alex (Personalized Path)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_sso_user, is_anonymous, created_at, updated_at
) VALUES (
  'a0000002-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'tannerbowman+snhu.alex@gmail.com',
  crypt('Demo2024!', gen_salt('bf')),
  NOW(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "Alex Rivera"}'::jsonb,
  false,
  false,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STEP 2: Create Public Users
-- =====================================================

INSERT INTO public.users (
  id, email, display_name, first_name, last_name, role, total_xp, created_at
) VALUES (
  'a0000001-0000-4000-8000-000000000001',
  'tannerbowman+snhu.jordan@gmail.com',
  'Jordan Mitchell',
  'Jordan',
  'Mitchell',
  'student',
  700,
  NOW()
) ON CONFLICT (id) DO UPDATE SET total_xp = 700;

INSERT INTO public.users (
  id, email, display_name, first_name, last_name, role, total_xp, created_at
) VALUES (
  'a0000002-0000-4000-8000-000000000002',
  'tannerbowman+snhu.alex@gmail.com',
  'Alex Rivera',
  'Alex',
  'Rivera',
  'student',
  800,
  NOW()
) ON CONFLICT (id) DO UPDATE SET total_xp = 800;

-- =====================================================
-- STEP 3: Create Quests
-- =====================================================

-- Quest 1: Traditional (SNHU-style)
INSERT INTO quests (
  id, title, description, quest_type, is_active, is_v3, is_public,
  topic_primary, topics, header_image_url, created_by, created_at
) VALUES (
  'b0000001-0000-4000-8000-000000000001',
  'Analyze Written Works (ENG-23516)',
  'Learn how to analyze written works using critical reading techniques. In this competency-aligned project, you take on the role of an employee at a large distribution company. Your supervisor has asked you to review articles on time and stress management and determine if they would be helpful to share with your team.',
  'course',
  true,
  true,
  true,
  'Critical Reading',
  ARRAY['Communication', 'Critical Thinking', 'Written Analysis', 'Information Literacy', 'Professional Development'],
  'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg',
  'a0000001-0000-4000-8000-000000000001',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Quest 2: Personalized (Optio-style)
INSERT INTO quests (
  id, title, description, quest_type, is_active, is_v3, is_public,
  topic_primary, topics, header_image_url, created_by, created_at
) VALUES (
  'b0000002-0000-4000-8000-000000000002',
  'Critical Reading in the Real World',
  'Develop critical reading skills by analyzing written works that matter to you. Apply analytical techniques to business content, startup coverage, and entrepreneurship materials. Same competency, your unique path.',
  'optio',
  true,
  true,
  true,
  'Critical Reading',
  ARRAY['Communication', 'Critical Thinking', 'Entrepreneurship', 'Media Literacy', 'Business Analysis'],
  'https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg',
  'a0000002-0000-4000-8000-000000000002',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STEP 4: Enroll Students in Quests
-- =====================================================

-- Jordan in Quest 1
-- Note: status must be 'available', 'picked_up', or 'set_down' - completion tracked via completed_at
INSERT INTO user_quests (
  id, user_id, quest_id, status, is_active, started_at,
  times_picked_up, last_picked_up_at, personalization_completed, completed_at
) VALUES (
  'd0000001-0000-4000-8000-000000000001',
  'a0000001-0000-4000-8000-000000000001',
  'b0000001-0000-4000-8000-000000000001',
  'picked_up',
  true,
  NOW() - INTERVAL '7 days',
  1,
  NOW() - INTERVAL '7 days',
  true,
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Alex in Quest 2
INSERT INTO user_quests (
  id, user_id, quest_id, status, is_active, started_at,
  times_picked_up, last_picked_up_at, personalization_completed, completed_at
) VALUES (
  'd0000002-0000-4000-8000-000000000002',
  'a0000002-0000-4000-8000-000000000002',
  'b0000002-0000-4000-8000-000000000002',
  'picked_up',
  true,
  NOW() - INTERVAL '7 days',
  1,
  NOW() - INTERVAL '7 days',
  true,
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STEP 5: Create User Quest Tasks (Jordan - Traditional)
-- =====================================================

INSERT INTO user_quest_tasks (id, user_id, quest_id, user_quest_id, title, description, pillar, xp_value, order_index, is_required, is_manual, approval_status) VALUES
('e0000001-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'd0000001-0000-4000-8000-000000000001',
 'Review the Three Article Options', 'Read all three time/stress management articles provided by your supervisor. Take initial notes on each article including the main topic, author credentials, and your first impressions.',
 'communication', 100, 1, true, false, 'approved'),

('e0000001-0002-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'd0000001-0000-4000-8000-000000000001',
 'Select and Annotate Your Chosen Article', 'Choose one article for deep analysis. Highlight key claims, supporting evidence, and rhetorical strategies used by the author.',
 'communication', 150, 2, true, false, 'approved'),

('e0000001-0003-4000-8000-000000000003', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'd0000001-0000-4000-8000-000000000001',
 'Complete Critical Reading Analysis', 'Use the provided template to analyze your article. Address: purpose, audience, tone, evidence quality, and logical structure.',
 'communication', 200, 3, true, false, 'approved'),

('e0000001-0004-4000-8000-000000000004', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'd0000001-0000-4000-8000-000000000001',
 'Evaluate Article Appropriateness', 'Write a 2-paragraph recommendation on whether this article should be shared with your team and why.',
 'communication', 150, 4, true, false, 'approved'),

('e0000001-0005-4000-8000-000000000005', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'd0000001-0000-4000-8000-000000000001',
 'Create Proper Source Citation', 'Cite your selected article using MLA format. Include all required elements.',
 'communication', 100, 5, true, false, 'approved')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STEP 6: Create User Quest Tasks (Alex - Personalized)
-- =====================================================

INSERT INTO user_quest_tasks (id, user_id, quest_id, user_quest_id, title, description, pillar, xp_value, order_index, is_required, is_manual, approval_status) VALUES
('e0000002-0001-4000-8000-000000000001', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'd0000002-0000-4000-8000-000000000002',
 'Compare TechCrunch vs WSJ Coverage of OpenAI', 'I chose to analyze how TechCrunch and Wall Street Journal covered the same OpenAI news because I follow AI startups closely.',
 'communication', 150, 1, false, true, 'approved'),

('e0000002-0002-4000-8000-000000000002', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'd0000002-0000-4000-8000-000000000002',
 'Analyze Naval Ravikant Thread on Wealth', 'I analyzed a viral Naval Ravikant thread about building wealth because I admire his thinking.',
 'communication', 100, 2, false, true, 'approved'),

('e0000002-0003-4000-8000-000000000003', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'd0000002-0000-4000-8000-000000000002',
 'Critical Read of How I Built This Interview', 'I love the How I Built This podcast. Analyzed the Spanx founder interview to see how the narrative is controlled.',
 'communication', 200, 3, false, true, 'approved'),

('e0000002-0004-4000-8000-000000000004', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'd0000002-0000-4000-8000-000000000002',
 'Identify Bias in A16Z State of Crypto Report', 'I analyzed the a16z State of Crypto 2024 report to identify how their $7.6B investment affects their conclusions.',
 'communication', 200, 4, false, true, 'approved'),

('e0000002-0005-4000-8000-000000000005', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'd0000002-0000-4000-8000-000000000002',
 'Critical Review of Zero to One Chapter', 'Currently reading Peter Thiel''s Zero to One. Analyzed Chapter 3 on competition to understand his argument structure.',
 'communication', 150, 5, false, true, 'approved')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STEP 7: Create Task Completions
-- =====================================================

-- Jordan's completions
INSERT INTO quest_task_completions (id, user_id, quest_id, task_id, user_quest_task_id, evidence_text, completed_at, is_confidential) VALUES
('f0000001-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'e0000001-0001-4000-8000-000000000001', 'e0000001-0001-4000-8000-000000000001', 'Multi-format evidence document', NOW() - INTERVAL '4 days', false),
('f0000001-0002-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'e0000001-0002-4000-8000-000000000002', 'e0000001-0002-4000-8000-000000000002', 'Multi-format evidence document', NOW() - INTERVAL '3 days', false),
('f0000001-0003-4000-8000-000000000003', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'e0000001-0003-4000-8000-000000000003', 'e0000001-0003-4000-8000-000000000003', 'Multi-format evidence document', NOW() - INTERVAL '2 days', false),
('f0000001-0004-4000-8000-000000000004', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'e0000001-0004-4000-8000-000000000004', 'e0000001-0004-4000-8000-000000000004', 'Multi-format evidence document', NOW() - INTERVAL '1 day', false),
('f0000001-0005-4000-8000-000000000005', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'e0000001-0005-4000-8000-000000000005', 'e0000001-0005-4000-8000-000000000005', 'Multi-format evidence document', NOW(), false)
ON CONFLICT (id) DO NOTHING;

-- Alex's completions
INSERT INTO quest_task_completions (id, user_id, quest_id, task_id, user_quest_task_id, evidence_text, completed_at, is_confidential) VALUES
('f0000002-0001-4000-8000-000000000001', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'e0000002-0001-4000-8000-000000000001', 'e0000002-0001-4000-8000-000000000001', 'Multi-format evidence document', NOW() - INTERVAL '5 days', false),
('f0000002-0002-4000-8000-000000000002', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'e0000002-0002-4000-8000-000000000002', 'e0000002-0002-4000-8000-000000000002', 'Multi-format evidence document', NOW() - INTERVAL '4 days', false),
('f0000002-0003-4000-8000-000000000003', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'e0000002-0003-4000-8000-000000000003', 'e0000002-0003-4000-8000-000000000003', 'Multi-format evidence document', NOW() - INTERVAL '2 days', false),
('f0000002-0004-4000-8000-000000000004', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'e0000002-0004-4000-8000-000000000004', 'e0000002-0004-4000-8000-000000000004', 'Multi-format evidence document', NOW() - INTERVAL '1 day', false),
('f0000002-0005-4000-8000-000000000005', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'e0000002-0005-4000-8000-000000000005', 'e0000002-0005-4000-8000-000000000005', 'Multi-format evidence document', NOW(), false)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STEP 8: Create Evidence Documents
-- =====================================================

-- Jordan's Evidence Documents
INSERT INTO user_task_evidence_documents (id, user_id, quest_id, task_id, status, completed_at, is_confidential) VALUES
('10000001-0001-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'e0000001-0001-4000-8000-000000000001', 'completed', NOW() - INTERVAL '4 days', false),
('10000001-0002-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'e0000001-0002-4000-8000-000000000002', 'completed', NOW() - INTERVAL '3 days', false),
('10000001-0003-4000-8000-000000000003', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'e0000001-0003-4000-8000-000000000003', 'completed', NOW() - INTERVAL '2 days', false),
('10000001-0004-4000-8000-000000000004', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'e0000001-0004-4000-8000-000000000004', 'completed', NOW() - INTERVAL '1 day', false),
('10000001-0005-4000-8000-000000000005', 'a0000001-0000-4000-8000-000000000001', 'b0000001-0000-4000-8000-000000000001', 'e0000001-0005-4000-8000-000000000005', 'completed', NOW(), false)
ON CONFLICT (id) DO NOTHING;

-- Alex's Evidence Documents
INSERT INTO user_task_evidence_documents (id, user_id, quest_id, task_id, status, completed_at, is_confidential) VALUES
('20000002-0001-4000-8000-000000000001', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'e0000002-0001-4000-8000-000000000001', 'completed', NOW() - INTERVAL '5 days', false),
('20000002-0002-4000-8000-000000000002', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'e0000002-0002-4000-8000-000000000002', 'completed', NOW() - INTERVAL '4 days', false),
('20000002-0003-4000-8000-000000000003', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'e0000002-0003-4000-8000-000000000003', 'completed', NOW() - INTERVAL '2 days', false),
('20000002-0004-4000-8000-000000000004', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'e0000002-0004-4000-8000-000000000004', 'completed', NOW() - INTERVAL '1 day', false),
('20000002-0005-4000-8000-000000000005', 'a0000002-0000-4000-8000-000000000002', 'b0000002-0000-4000-8000-000000000002', 'e0000002-0005-4000-8000-000000000005', 'completed', NOW(), false)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STEP 9: Create Evidence Blocks (Jordan - Traditional)
-- =====================================================

-- Task 1: Review Articles
INSERT INTO evidence_document_blocks (id, document_id, block_type, content, order_index, is_private) VALUES
('c0000001-0001-4000-8000-000000000001', '10000001-0001-4000-8000-000000000001', 'text',
 '{"text": "I reviewed all three articles my supervisor provided on time and stress management:\n\n**Article 1: \"The Time Management Matrix\" by Stephen Covey**\n- Main topic: Prioritizing tasks by urgency vs importance\n- Author credentials: Best-selling author of \"7 Habits of Highly Effective People\"\n- First impression: Well-structured framework, but very corporate-focused\n\n**Article 2: \"Stress in the Modern Workplace\" by Harvard Business Review**\n- Main topic: Understanding and managing workplace stress\n- Author credentials: Published in respected business journal\n- First impression: Data-driven but somewhat dense\n\n**Article 3: \"Simple Techniques for Busy Professionals\" by Forbes**\n- Main topic: Quick stress-relief tips\n- Author credentials: Career columnist\n- First impression: Accessible but perhaps superficial\n\nBased on my initial review, I am leaning toward Article 1 for deeper analysis because it offers a practical framework that could be immediately useful to our team."}'::jsonb,
 0, false),
('c0000001-0001-4000-8000-000000000002', '10000001-0001-4000-8000-000000000001', 'image',
 '{"url": "https://images.pexels.com/photos/590016/pexels-photo-590016.jpeg", "caption": "My workspace while reviewing the three articles", "alt_text": "Office desk with printed documents and notes"}'::jsonb,
 1, false)
ON CONFLICT (id) DO NOTHING;

-- Task 2: Annotate Article
INSERT INTO evidence_document_blocks (id, document_id, block_type, content, order_index, is_private) VALUES
('c0000001-0002-4000-8000-000000000001', '10000001-0002-4000-8000-000000000002', 'text',
 '{"text": "## Annotation of \"The Time Management Matrix\" by Stephen Covey\n\n**Key Claims Identified:**\n1. \"Most people spend too much time on urgent but unimportant tasks\"\n2. \"Quadrant II (important but not urgent) is where effectiveness lives\"\n3. \"Saying no to the unimportant is saying yes to the important\"\n\n**Supporting Evidence:**\n- Case study of a Fortune 500 executive who increased productivity 40% using the matrix\n- Survey data showing 60% of workers feel \"constantly busy but unproductive\"\n- Reference to psychological research on decision fatigue\n\n**Rhetorical Strategies:**\n- Uses relatable scenarios (email overload, constant meetings)\n- Creates urgency through statistics about burnout\n- Provides a clear visual framework that is easy to remember\n\n**Questions/Concerns:**\n- The case studies are from large corporations - will this work in our distribution context?\n- Some advice assumes you have control over your schedule (hourly workers may not)\n- No mention of digital tools for implementation"}'::jsonb,
 0, false),
('c0000001-0002-4000-8000-000000000002', '10000001-0002-4000-8000-000000000002', 'image',
 '{"url": "https://images.pexels.com/photos/6238050/pexels-photo-6238050.jpeg", "caption": "My annotated copy with highlighted key passages", "alt_text": "Document with yellow highlights and handwritten margin notes"}'::jsonb,
 1, false)
ON CONFLICT (id) DO NOTHING;

-- Task 3: Critical Reading Analysis
INSERT INTO evidence_document_blocks (id, document_id, block_type, content, order_index, is_private) VALUES
('c0000001-0003-4000-8000-000000000001', '10000001-0003-4000-8000-000000000003', 'text',
 '{"text": "# Critical Reading Analysis Template\n\n## Article: \"The Time Management Matrix\" by Stephen Covey\n\n### 1. Author''s Purpose and Intended Audience\n**Purpose:** To convince busy professionals to rethink how they prioritize their time, moving away from reactive urgency toward proactive importance.\n**Intended Audience:** Mid-level to senior professionals, primarily in corporate environments, who have some control over their schedules.\n\n### 2. Tone and Style Choices\nThe author uses a **prescriptive but accessible** tone. The writing is authoritative but avoids jargon. The use of simple 2x2 matrix makes complex ideas digestible.\n\n### 3. Quality of Evidence Presented\n**Strengths:**\n- Cites psychological research on decision-making\n- Includes specific case studies with measurable outcomes\n- References survey data from reputable sources\n\n**Weaknesses:**\n- Case studies are exclusively from large corporations\n- No peer-reviewed academic citations\n- Testimonials may be cherry-picked\n\n### 4. Logical Structure and Flow\nThe article follows a clear problem-solution structure:\n1. Establishes the problem (busyness without productivity)\n2. Introduces the framework (4 quadrants)\n3. Provides implementation steps\n4. Offers success stories as proof\n\n### 5. Potential Biases or Limitations\n- **Corporate bias:** All examples assume white-collar, salaried work\n- **Control assumption:** Presumes readers can decline meetings/tasks\n- **Survivorship bias:** Only successful implementations are highlighted"}'::jsonb,
 0, false),
('c0000001-0003-4000-8000-000000000002', '10000001-0003-4000-8000-000000000003', 'image',
 '{"url": "https://images.pexels.com/photos/4145153/pexels-photo-4145153.jpeg", "caption": "Working on my analysis at the coffee shop", "alt_text": "Laptop on table with coffee cup and notes nearby"}'::jsonb,
 1, false)
ON CONFLICT (id) DO NOTHING;

-- Task 4: Evaluate Appropriateness
INSERT INTO evidence_document_blocks (id, document_id, block_type, content, order_index, is_private) VALUES
('c0000001-0004-4000-8000-000000000001', '10000001-0004-4000-8000-000000000004', 'text',
 '{"text": "## Recommendation: Should We Share This Article?\n\n**My recommendation: Yes, with modifications**\n\nI recommend sharing \"The Time Management Matrix\" article with our customer service team, but with some important context added. The core framework—organizing tasks by urgency and importance—is immediately applicable to our distribution center environment. Our team regularly juggles phone calls, computer work, and unexpected customer issues, making the Quadrant II concept particularly relevant.\n\n**Why share it:**\nThe article''s strength is its practical framework. Even team members with packed schedules can benefit from consciously categorizing their tasks. The visual matrix is easy to remember and reference. Several colleagues have mentioned feeling overwhelmed, and this offers a concrete strategy.\n\n**Important caveats to include:**\nWhen sharing, I would add a note acknowledging that not all advice will apply directly to hourly customer service roles. For example, our team cannot simply \"decline meetings\"—but they can identify which follow-up tasks are truly urgent vs. which can wait until after peak call times. I would also suggest discussing as a team which Quadrant II activities we could collectively prioritize."}'::jsonb,
 0, false),
('c0000001-0004-4000-8000-000000000002', '10000001-0004-4000-8000-000000000004', 'image',
 '{"url": "https://images.pexels.com/photos/3184287/pexels-photo-3184287.jpeg", "caption": "Team meeting context - where this article could be shared", "alt_text": "Professional meeting room with colleagues discussing"}'::jsonb,
 1, false)
ON CONFLICT (id) DO NOTHING;

-- Task 5: Citation
INSERT INTO evidence_document_blocks (id, document_id, block_type, content, order_index, is_private) VALUES
('c0000001-0005-4000-8000-000000000001', '10000001-0005-4000-8000-000000000005', 'text',
 '{"text": "## MLA Citation\n\n**Works Cited Entry:**\n\nCovey, Stephen R. \"The Time Management Matrix: Putting First Things First.\" *Franklin Covey*, 15 Mar. 2023, www.franklincovey.com/habit-3/. Accessed 6 Feb. 2026.\n\n---\n\n**Citation Elements Verified:**\n- Author name (Last, First M.)\n- Article title in quotation marks\n- Publication/Website name in italics\n- Publication date (Day Month Year)\n- URL (without https://)\n- Access date\n\n**Note:** I verified formatting against the Purdue OWL MLA 9th edition guidelines."}'::jsonb,
 0, false),
('c0000001-0005-4000-8000-000000000002', '10000001-0005-4000-8000-000000000005', 'image',
 '{"url": "https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg", "caption": "Research reference materials", "alt_text": "Library books and citation guide"}'::jsonb,
 1, false)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STEP 10: Create Evidence Blocks (Alex - Personalized)
-- =====================================================

-- Task 1: TechCrunch vs WSJ
INSERT INTO evidence_document_blocks (id, document_id, block_type, content, order_index, is_private) VALUES
('c0000002-0001-4000-8000-000000000001', '20000002-0001-4000-8000-000000000001', 'text',
 '{"text": "# TechCrunch vs Wall Street Journal: Covering the Same OpenAI Story\n\n## The Story\nBoth outlets covered OpenAI''s latest funding round in January 2026. Same news, completely different framing.\n\n## TechCrunch Coverage\n**Headline:** \"OpenAI Raises Historic $6.6B Round, Valued at $157B\"\n**Framing:** Celebration of startup success, focus on technical achievements\n**Emphasized:** Sam Altman''s vision, product capabilities, developer ecosystem\n**Omitted:** Governance concerns, previous board drama, employee turnover\n**Tone:** Excited, insider-y, assumes reader is bullish on AI\n\n## Wall Street Journal Coverage  \n**Headline:** \"OpenAI Valuation Soars Amid Questions About Path to Profitability\"\n**Framing:** Financial analysis, investor skepticism\n**Emphasized:** Burn rate, competition from Google/Anthropic, regulatory risks\n**Omitted:** Technical breakthroughs, developer enthusiasm, product adoption\n**Tone:** Cautious, analytical, assumes reader cares about ROI\n\n## My Analysis\n**Why the difference?** TechCrunch serves founders and VCs who want to believe the AI narrative. WSJ serves institutional investors who need realistic risk assessment.\n\n**What I learned:** Neither is \"wrong\" but both are incomplete. Critical reading means reading BOTH and triangulating the truth. The real story is somewhere in between.\n\n**Bias I identified:** TechCrunch reporter has covered OpenAI since 2020 and has built relationships with the team. WSJ reporter previously wrote skeptically about WeWork."}'::jsonb,
 0, false),
('c0000002-0001-4000-8000-000000000002', '20000002-0001-4000-8000-000000000001', 'image',
 '{"url": "https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg", "caption": "Side-by-side comparison of the two articles", "alt_text": "Split screen showing tech startup office and newspaper"}'::jsonb,
 1, false),
('c0000002-0001-4000-8000-000000000003', '20000002-0001-4000-8000-000000000001', 'link',
 '{"url": "https://techcrunch.com", "title": "TechCrunch Article Reference", "description": "Link to original TechCrunch coverage for comparison"}'::jsonb,
 2, false)
ON CONFLICT (id) DO NOTHING;

-- Task 2: Viral Business Thread
INSERT INTO evidence_document_blocks (id, document_id, block_type, content, order_index, is_private) VALUES
('c0000002-0002-4000-8000-000000000001', '20000002-0002-4000-8000-000000000002', 'text',
 '{"text": "# Critical Analysis: Naval Ravikant''s \"How to Get Rich\" Thread\n\nI chose to analyze Naval''s famous tweetstorm on wealth-building because I''ve seen it shared constantly in entrepreneur circles. Does it hold up to critical reading?\n\n## Key Claims Made\n1. \"Seek wealth, not money or status\"\n2. \"You''re not going to get rich renting out your time\"\n3. \"Learn to sell. Learn to build. If you can do both, you will be unstoppable\"\n4. \"Code and media are permissionless leverage\"\n\n## Evidence Provided\n**Almost none.** Naval relies on:\n- Personal authority (successful angel investor)\n- Aphoristic phrasing that sounds profound\n- Anecdotes from his own career\n\nNo data. No studies. No acknowledgment of survivorship bias.\n\n## Persuasion Techniques\n- **Aphorisms:** Short, memorable phrases that feel wise\n- **False dichotomies:** \"Wealth vs status\" as if you must choose\n- **Aspirational identity:** Makes reader feel like an insider\n- **Vague actionability:** \"Learn to build\" - okay, but how?\n\n## Does This Advice Actually Work?\n**Partially.** The thread is directionally correct but:\n- Ignores privilege (Naval had CS degree, early tech connections)\n- Underplays luck (right place, right time for angel investing)\n- \"Permissionless leverage\" still requires capital to start\n\n## My Verdict\nUseful as inspiration, dangerous as a playbook. Critical reading revealed this is more philosophy than strategy."}'::jsonb,
 0, false),
('c0000002-0002-4000-8000-000000000002', '20000002-0002-4000-8000-000000000002', 'image',
 '{"url": "https://images.pexels.com/photos/607812/pexels-photo-607812.jpeg", "caption": "Analyzing the thread on my phone", "alt_text": "Smartphone displaying social media business content"}'::jsonb,
 1, false)
ON CONFLICT (id) DO NOTHING;

-- Task 3: Founder Interview Analysis
INSERT INTO evidence_document_blocks (id, document_id, block_type, content, order_index, is_private) VALUES
('c0000002-0003-4000-8000-000000000001', '20000002-0003-4000-8000-000000000003', 'text',
 '{"text": "# Critical Analysis: Sara Blakely on \"How I Built This\"\n\n## Why I Chose This\nI love the How I Built This podcast and Sara Blakely (Spanx founder) is one of my favorite entrepreneurs. But I wanted to critically analyze how founder origin stories are constructed.\n\n## What the Interview Reveals\n**The Polished Narrative:**\n- Cutting feet off pantyhose = billion-dollar idea\n- $5,000 savings, no outside funding\n- \"I just believed in myself\"\n\n**What Guy Raz''s Questions Surface:**\n- She had a stable sales job while building Spanx (safety net)\n- Father encouraged \"failure of the week\" dinner discussions (unusual upbringing)\n- She cold-called Neiman Marcus and got a meeting (sales skills + luck)\n\n## What the Interview Obscures\n**Questions I wish Guy had asked:**\n- What did the first 2 years of financial struggle actually look like?\n- How many manufacturer rejections before finding one?\n- What role did being young, white, and attractive play in getting meetings?\n- How did she handle copying competitors that emerged?\n\n## How Sara Controls the Narrative\n- **Emphasizes:** Personal grit, creative scrappiness, underdog positioning\n- **Downplays:** Existing sales expertise, supportive family, timing\n- **Reframes failures as:** Learning experiences (classic founder trope)\n\n## My Takeaway\nFounder interviews are **marketing**, not journalism. Sara Blakely is genuinely impressive, but the narrative is curated to inspire, not inform. Critical reading means asking: \"What would the FULL story include?\""}'::jsonb,
 0, false),
('c0000002-0003-4000-8000-000000000002', '20000002-0003-4000-8000-000000000003', 'link',
 '{"url": "https://www.npr.org/podcasts/510313/how-i-built-this", "title": "How I Built This Podcast", "description": "Link to the podcast episode analyzed"}'::jsonb,
 1, false),
('c0000002-0003-4000-8000-000000000003', '20000002-0003-4000-8000-000000000003', 'image',
 '{"url": "https://images.pexels.com/photos/3756679/pexels-photo-3756679.jpeg", "caption": "Listening to the podcast interview", "alt_text": "Person with headphones listening to podcast"}'::jsonb,
 2, false)
ON CONFLICT (id) DO NOTHING;

-- Task 4: VC Report Bias
INSERT INTO evidence_document_blocks (id, document_id, block_type, content, order_index, is_private) VALUES
('c0000002-0004-4000-8000-000000000001', '20000002-0004-4000-8000-000000000004', 'text',
 '{"text": "# Identifying Bias: A16Z ''State of Crypto 2024'' Report\n\n## Context: Who Made This Report?\nAndreessen Horowitz (a16z) is one of the largest crypto investors in the world with **$7.6 billion** deployed across crypto/web3 companies. They have an enormous financial incentive for positive crypto narratives.\n\n## The Report''s Key Claims\n1. \"Crypto usage is at all-time highs\"\n2. \"Developer activity signals long-term health\"\n3. \"We''re in a building phase, not a speculating phase\"\n4. \"Regulatory clarity is coming\"\n\n## What Data Is Selected\n- Active addresses (up 20%)\n- Developer commits on GitHub\n- Stablecoin transaction volume\n- Number of new dApps launched\n\n## What Data Is Omitted\n- Token prices (many down 60-80% from highs)\n- Exchange volumes (way down from 2021)\n- VC funding levels (down significantly)\n- Major project failures (FTX, Terraform Labs)\n- Regulatory enforcement actions\n\n## Rhetorical Strategies Used\n- **\"Building through the bear\"**: Reframes declining interest as virtue\n- **Early internet comparison**: \"It''s 1997!\" - implies inevitable success\n- **Selective metrics**: Chooses KPIs that look good\n- **Forward-looking framing**: Future potential over present reality\n\n## My Conclusions\nThis report is **advocacy dressed as analysis**. It''s not lying, but it''s not the full truth either. If I were investing based on this, I''d be missing critical risk factors.\n\n**Critical reading lesson:** Always ask \"Who paid for this research?\" and \"What do they gain from this conclusion?\""}'::jsonb,
 0, false),
('c0000002-0004-4000-8000-000000000002', '20000002-0004-4000-8000-000000000004', 'image',
 '{"url": "https://images.pexels.com/photos/6801648/pexels-photo-6801648.jpeg", "caption": "Annotated sections of the a16z report showing selected vs omitted data", "alt_text": "Business charts and analytics on screen with highlighted annotations"}'::jsonb,
 1, false),
('c0000002-0004-4000-8000-000000000003', '20000002-0004-4000-8000-000000000004', 'link',
 '{"url": "https://a16zcrypto.com/state-of-crypto", "title": "A16Z State of Crypto Report", "description": "Link to the original report analyzed"}'::jsonb,
 2, false)
ON CONFLICT (id) DO NOTHING;

-- Task 5: Business Book Chapter
INSERT INTO evidence_document_blocks (id, document_id, block_type, content, order_index, is_private) VALUES
('c0000002-0005-4000-8000-000000000001', '20000002-0005-4000-8000-000000000005', 'text',
 '{"text": "# Critical Review: Zero to One, Chapter 3 - \"All Happy Companies Are Different\"\n\n## Why This Chapter\nI''m reading Peter Thiel''s book because everyone in startup world references it. Chapter 3 argues that competition is bad and monopoly is good. Let me test this.\n\n## Thiel''s Main Argument\n**Thesis:** \"Competition is for losers.\" Successful companies escape competition by being so different they become monopolies.\n\n**Supporting Points:**\n1. Perfect competition eliminates profits (Econ 101)\n2. Google is a monopoly but pretends it''s not\n3. Airlines are competitive and have terrible margins\n4. Differentiation beats competition\n\n## Evidence Quality Assessment\n\n**Strong Evidence:**\n- Correct economics (perfect competition = zero profit)\n- Google profit margins vs airline margins (verifiable data)\n- Historical examples (Standard Oil, AT&T)\n\n**Weak Evidence:**\n- Cherry-picked examples (ignores successful competitive companies)\n- Monopoly definition is fuzzy (is Apple a monopoly?)\n- Survivorship bias (only talks about winners)\n- Ignores negative externalities of monopoly\n\n## Rhetorical Strategies\n- **Contrarian framing:** \"Everyone thinks X, but actually Y\"\n- **Status signaling:** Name-drops elite thinkers\n- **Oversimplification:** Complex markets = simple binary\n- **Provocative language:** \"Losers\" makes you want to not be one\n\n## Counterarguments Thiel Ignores\n- Monopolies can harm consumers (higher prices, less innovation)\n- Competition spurs innovation (Intel vs AMD, iOS vs Android)\n- Monopoly isn''t always achievable or desirable\n- Social costs of winner-take-all dynamics\n\n## My Verdict\nThiel makes a compelling argument that holds **partially**. Aiming for differentiation over direct competition is smart. But the \"monopoly is good\" framing ignores who gets hurt and the luck required to achieve it."}'::jsonb,
 0, false),
('c0000002-0005-4000-8000-000000000002', '20000002-0005-4000-8000-000000000005', 'image',
 '{"url": "https://images.pexels.com/photos/1765033/pexels-photo-1765033.jpeg", "caption": "My copy of Zero to One with margin notes", "alt_text": "Business book with coffee and notes on desk"}'::jsonb,
 1, false)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- VERIFICATION QUERY
-- =====================================================
SELECT
  'Demo data created successfully!' as status,
  (SELECT count(*) FROM public.users WHERE id IN ('a0000001-0000-4000-8000-000000000001', 'a0000002-0000-4000-8000-000000000002')) as users_created,
  (SELECT count(*) FROM quests WHERE id IN ('b0000001-0000-4000-8000-000000000001', 'b0000002-0000-4000-8000-000000000002')) as quests_created,
  (SELECT count(*) FROM user_quests WHERE id IN ('d0000001-0000-4000-8000-000000000001', 'd0000002-0000-4000-8000-000000000002')) as enrollments_created,
  (SELECT count(*) FROM user_quest_tasks WHERE user_id IN ('a0000001-0000-4000-8000-000000000001', 'a0000002-0000-4000-8000-000000000002')) as tasks_created,
  (SELECT count(*) FROM user_task_evidence_documents WHERE user_id IN ('a0000001-0000-4000-8000-000000000001', 'a0000002-0000-4000-8000-000000000002')) as evidence_docs_created,
  (SELECT count(*) FROM evidence_document_blocks WHERE document_id IN (
    SELECT id FROM user_task_evidence_documents WHERE user_id IN ('a0000001-0000-4000-8000-000000000001', 'a0000002-0000-4000-8000-000000000002')
  )) as evidence_blocks_created;
