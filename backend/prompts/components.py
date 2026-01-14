"""
Shared Prompt Components
========================

Single source of truth for all AI prompt building blocks.
This eliminates duplication across ai_tutor_service, quest_ai_service,
sample_task_generator, ai_badge_generation_service, etc.

Usage:
    from prompts.components import CORE_PHILOSOPHY, PILLAR_DEFINITIONS

    prompt = f'''
    {CORE_PHILOSOPHY}

    {PILLAR_DEFINITIONS}

    Your specific instructions here...

    {JSON_OUTPUT_INSTRUCTIONS}
    '''
"""

from typing import Dict, List, Optional, Any

# =============================================================================
# OPTIO AI PERSONA - The unified AI personality across all student-facing features
# =============================================================================

OPTIO_AI_PERSONA = """
You are OptioBot, Optio's friendly AI learning companion.

VOICE & PERSONALITY:
- Warm, encouraging, and genuinely curious
- Speaks like a knowledgeable older sibling or mentor
- Uses "we" language to explore together
- Celebrates effort and curiosity, not just outcomes
- Never condescending, never overly formal
- Age-appropriate for teenagers (13-18)

TONE GUIDELINES:
- Natural and conversational, not robotic
- Thoughtful, not hyperactive or salesy
- Supportive without being patronizing
- Clear and direct, not flowery
- Enthusiastic about learning, not performatively excited
- No exclamation points in most cases (one per response max, if truly warranted)
- Avoid "You're becoming..." and similar motivational phrases
"""

# =============================================================================
# TONE LEVELS - Different contexts require different tones
# =============================================================================

TONE_LEVELS = {
    'student_facing': """
TONE: Student-Facing (Conversational)
- Use warm, encouraging language
- Address students directly ("you")
- Keep responses conversational
- Celebrate curiosity and effort
- Maximum enthusiasm level: gentle encouragement, not hype
- One exclamation point max per response, only when genuinely warranted
""",
    'content_generation': """
TONE: Content Generation (Professional)
- Use clear, professional language
- Focus on clarity over personality
- No exclamation points
- No "You're becoming..." phrases
- Simple, direct, actionable instructions
- Let the content inspire without performative excitement
""",
    'admin_tools': """
TONE: Admin/Internal Tools (Technical)
- Technical and efficient
- Focus on accuracy and completeness
- No personality needed - just quality output
- Professional, concise language
"""
}

# =============================================================================
# CORE PHILOSOPHY - The foundation of all Optio AI interactions
# =============================================================================

CORE_PHILOSOPHY = """
"The Process Is The Goal" - Focus on growth and learning RIGHT NOW, not future outcomes.

Core Principles:
- Learning is about who you're BECOMING, not preparing for something else
- Celebrate curiosity, creation, and discovery for its own sake
- Every step is valuable; mistakes are celebrated as learning
- Focus on how learning FEELS, not how it LOOKS to others
- Internal motivation over external validation
"""

LANGUAGE_GUIDELINES = """
Language Guidelines:
USE these words/phrases:
- "Discover", "Explore", "Create", "Experiment", "Dive into"
- "Notice", "Observe", "Play with", "Try", "Wonder about"
- Present-tense, active verbs celebrating the journey
- "You're becoming...", "You're developing...", "You're exploring..."

NEVER use these words/phrases:
- "Prove", "demonstrate", "show", "impress", "showcase"
- "Will help you", "for college", "for your career", "in the future"
- "Build your resume", "stand out", "get ahead", "compete"
- "Ahead of peers", "prepare for", "prove to others"
"""

# Forbidden words for content validation
FORBIDDEN_WORDS = [
    'prove', 'demonstrate', 'show', 'impress', 'showcase',
    'resume', 'career', 'college', 'future', 'stand out',
    'get ahead', 'compete', 'better than', 'textbook',
    'lecture', 'test', 'worksheet', 'practice problems'
]

# Encouraged words for quality scoring
ENCOURAGED_WORDS = [
    'explore', 'discover', 'create', 'experiment', 'dive',
    'observe', 'notice', 'feel', 'experience', 'play',
    'wonder', 'try', 'learn', 'grow', 'develop'
]

# =============================================================================
# PILLAR DEFINITIONS - The 5 learning pillars
# =============================================================================

# Single-word keys used in database
VALID_PILLARS = ['stem', 'wellness', 'communication', 'civics', 'art']

# Display names for UI
PILLAR_DISPLAY_NAMES = {
    'stem': 'STEM & Logic',
    'wellness': 'Life & Wellness',
    'communication': 'Language & Communication',
    'civics': 'Society & Culture',
    'art': 'Arts & Creativity'
}

# Brief definitions for prompts
PILLAR_DEFINITIONS = """
Learning Pillars:
1. STEM (stem) - Math, science, technology, programming, logic, engineering
2. Wellness (wellness) - Health, mindfulness, personal growth, life skills
3. Communication (communication) - Writing, reading, speaking, literature
4. Civics (civics) - History, geography, cultures, communities, social studies
5. Art (art) - Visual arts, music, creative writing, design, imagination
"""

# Detailed definitions for comprehensive prompts
PILLAR_DEFINITIONS_DETAILED = """
LEARNING PILLARS (use lowercase key in parentheses):

1. STEM & Logic (stem)
   Keywords: math, science, technology, programming, logic, engineering, data
   Concepts: problem solving, critical thinking, hypothesis, experiment, analysis
   Examples: coding projects, science experiments, math puzzles, engineering challenges

2. Life & Wellness (wellness)
   Keywords: health, wellness, mindfulness, growth, habits, fitness, nutrition
   Concepts: self-care, emotional intelligence, goal setting, reflection, resilience
   Examples: fitness routines, meditation practice, cooking healthy meals, journaling

3. Language & Communication (communication)
   Keywords: writing, reading, speaking, literature, grammar, storytelling
   Concepts: expression, communication, creativity, argumentation, clarity
   Examples: creative writing, public speaking, book discussions, podcasting

4. Society & Culture (civics)
   Keywords: history, culture, geography, community, tradition, government
   Concepts: diversity, perspective, change, connection, citizenship, justice
   Examples: community service, cultural exploration, current events, local history

5. Arts & Creativity (art)
   Keywords: art, music, creative, design, imagination, performance
   Concepts: expression, originality, aesthetics, innovation, interpretation
   Examples: painting, music composition, filmmaking, craft projects, dance
"""

# =============================================================================
# JSON OUTPUT INSTRUCTIONS
# =============================================================================

JSON_OUTPUT_INSTRUCTIONS = """
OUTPUT FORMAT:
Return ONLY valid JSON. No markdown code blocks, no explanation text, no preamble.
If returning an object, start with { and end with }.
If returning an array, start with [ and end with ].
Ensure all strings are properly escaped.
"""

JSON_OUTPUT_INSTRUCTIONS_STRICT = """
OUTPUT FORMAT (STRICT):
Return ONLY valid JSON.
- NO markdown code blocks (no ```)
- NO explanation text before or after
- NO "Here is..." or "I've created..." preamble
- Just the raw JSON object or array
- All strings must be properly escaped
- All keys must be double-quoted
"""

# =============================================================================
# CONTEXT BUILDERS - Dynamic context sections for prompts
# =============================================================================

def build_context(
    quest: Optional[Dict] = None,
    task: Optional[Dict] = None,
    lesson: Optional[Dict] = None,
    user_age: Optional[int] = None,
    learning_style: Optional[str] = None,
    previous_messages: Optional[List[Dict]] = None,
    vision_statement: Optional[str] = None
) -> str:
    """
    Build a context section for AI prompts.

    Args:
        quest: Quest data dict with title, description, etc.
        task: Task data dict with title, pillar, etc.
        lesson: Lesson data dict with title, content, etc.
        user_age: User's age for age-appropriate responses
        learning_style: visual, auditory, kinesthetic, or mixed
        previous_messages: List of previous conversation messages
        vision_statement: User's learning vision/goals (from profile bio)

    Returns:
        Formatted context string to include in prompts
    """
    sections = []

    if user_age:
        sections.append(f"USER AGE: {user_age} years old")

    if vision_statement:
        sections.append(f"STUDENT'S LEARNING VISION:\n{vision_statement[:1000]}")

    if learning_style:
        style_descriptions = {
            'visual': 'Prefers diagrams, charts, and visual representations',
            'auditory': 'Prefers verbal explanations and discussions',
            'kinesthetic': 'Prefers hands-on activities and movement',
            'mixed': 'Benefits from multiple learning approaches'
        }
        desc = style_descriptions.get(learning_style, '')
        sections.append(f"LEARNING STYLE: {learning_style} - {desc}")

    if quest:
        quest_section = f"CURRENT QUEST: {quest.get('title', 'Unknown')}"
        if quest.get('description'):
            quest_section += f"\nQUEST DESCRIPTION: {quest['description'][:200]}"
        if quest.get('big_idea'):
            quest_section += f"\nBIG IDEA: {quest['big_idea']}"
        if quest.get('pillar_primary'):
            pillar_name = PILLAR_DISPLAY_NAMES.get(quest['pillar_primary'], quest['pillar_primary'])
            quest_section += f"\nPRIMARY PILLAR: {pillar_name}"
        sections.append(quest_section)

    if task:
        task_section = f"CURRENT TASK: {task.get('title', 'Unknown')}"
        if task.get('pillar'):
            pillar_name = PILLAR_DISPLAY_NAMES.get(task['pillar'], task['pillar'])
            task_section += f" (Pillar: {pillar_name})"
        if task.get('description'):
            task_section += f"\nTASK DESCRIPTION: {task['description'][:150]}"
        sections.append(task_section)

    if lesson:
        lesson_section = f"CURRENT LESSON: {lesson.get('title', 'Unknown')}"
        if lesson.get('quest_title'):
            lesson_section += f"\nFROM QUEST: {lesson['quest_title']}"
        sections.append(lesson_section)

    if previous_messages:
        recent = previous_messages[-3:]  # Last 3 messages
        msgs = []
        for msg in recent:
            role = "Student" if msg.get('role') == 'user' else "Assistant"
            content = msg.get('content', '')[:150]
            msgs.append(f"{role}: {content}")
        sections.append("RECENT CONVERSATION:\n" + "\n".join(msgs))

    if not sections:
        return ""

    return "--- CONTEXT ---\n" + "\n\n".join(sections) + "\n--- END CONTEXT ---"


def build_quest_context(quest_data: Dict) -> str:
    """
    Build rich quest context from quest_id lookup data.
    Used when backend fetches full quest details for tutor context.

    Args:
        quest_data: Dict with 'quest', 'tasks', 'completed_count', 'total_count', 'recent_evidence'

    Returns:
        Formatted quest context string
    """
    if not quest_data:
        return ""

    quest = quest_data.get('quest', {})
    tasks = quest_data.get('tasks', [])
    completed = quest_data.get('completed_count', 0)
    total = quest_data.get('total_count', 0)
    evidence = quest_data.get('recent_evidence', [])

    sections = []

    # Quest info
    sections.append(f"QUEST: {quest.get('title', 'Unknown')}")
    if quest.get('description'):
        desc = quest['description'][:200] + '...' if len(quest.get('description', '')) > 200 else quest['description']
        sections.append(f"DESCRIPTION: {desc}")
    if quest.get('big_idea'):
        sections.append(f"BIG IDEA: {quest['big_idea']}")
    if quest.get('pillar_primary'):
        sections.append(f"PRIMARY PILLAR: {PILLAR_DISPLAY_NAMES.get(quest['pillar_primary'], quest['pillar_primary'])}")

    # Progress
    sections.append(f"\nPROGRESS: {completed}/{total} tasks completed")

    # Remaining tasks
    remaining = [t for t in tasks if not t.get('is_completed')]
    if remaining:
        sections.append("REMAINING TASKS:")
        for task in remaining[:5]:
            pillar = PILLAR_DISPLAY_NAMES.get(task.get('pillar', ''), task.get('pillar', 'General'))
            sections.append(f"  - {task['title']} ({pillar}, {task.get('xp_value', 0)} XP)")

    # Recent evidence
    if evidence:
        sections.append("\nRECENT WORK (student's own words):")
        for ev in evidence[:2]:
            text = ev.get('evidence_text', '')[:150]
            if len(ev.get('evidence_text', '')) > 150:
                text += '...'
            sections.append(f"  - Task '{ev.get('task_title', '')}': \"{text}\"")

    return "--- QUEST CONTEXT ---\n" + "\n".join(sections) + "\n--- END QUEST CONTEXT ---"


def build_lesson_context(lesson_data: Dict) -> str:
    """
    Build lesson context for curriculum-integrated chatbot.

    Args:
        lesson_data: Dict with 'lesson', 'current_block', 'progress', 'linked_tasks', 'learning_style'

    Returns:
        Formatted lesson context string
    """
    if not lesson_data:
        return ""

    lesson = lesson_data.get('lesson', {})
    block = lesson_data.get('current_block')
    progress = lesson_data.get('progress', {})
    linked_tasks = lesson_data.get('linked_tasks', [])
    style = lesson_data.get('learning_style', 'mixed')

    sections = []

    # Lesson info
    sections.append(f"LESSON: {lesson.get('title', 'Unknown')}")
    sections.append(f"QUEST: {lesson.get('quest_title', 'Unknown')}")
    if lesson.get('description'):
        sections.append(f"DESCRIPTION: {lesson['description'][:200]}")

    # Current content block
    if block:
        sections.append(f"\nSTUDENT IS VIEWING (Block {block.get('index', 0) + 1}):")
        sections.append(f'"""\n{block.get("content", "")}\n"""')

    # Progress
    sections.append(f"\nPROGRESS: {progress.get('progress_percentage', 0)}% complete")
    minutes = progress.get('time_spent_seconds', 0) // 60
    sections.append(f"TIME SPENT: {minutes} minutes")

    # Linked tasks
    if linked_tasks:
        sections.append("\nRELATED TASKS:")
        for task in linked_tasks[:3]:
            pillar = PILLAR_DISPLAY_NAMES.get(task.get('pillar', ''), task.get('pillar', ''))
            sections.append(f"  - {task.get('title', '')} ({pillar})")

    # Learning style
    sections.append(f"\nSTUDENT'S LEARNING STYLE: {style}")

    return "--- LESSON CONTEXT ---\n" + "\n".join(sections) + "\n--- END LESSON CONTEXT ---"


# =============================================================================
# SCHOOL SUBJECTS - For diploma credit mapping
# =============================================================================

SCHOOL_SUBJECTS = [
    'language_arts', 'math', 'science', 'social_studies',
    'financial_literacy', 'health', 'pe', 'fine_arts',
    'cte', 'digital_literacy', 'electives'
]

SCHOOL_SUBJECT_DISPLAY_NAMES = {
    'language_arts': 'Language Arts',
    'math': 'Math',
    'science': 'Science',
    'social_studies': 'Social Studies',
    'financial_literacy': 'Financial Literacy',
    'health': 'Health',
    'pe': 'Physical Education',
    'fine_arts': 'Fine Arts',
    'cte': 'Career & Technical Education',
    'digital_literacy': 'Digital Literacy',
    'electives': 'Electives'
}


# =============================================================================
# ACTION TYPE INSTRUCTIONS - For lesson helper (pre-set responses)
# =============================================================================

# Style override for all lesson helper actions - makes responses feel prepared, not chatbot-like
LESSON_HELPER_STYLE = """
CRITICAL STYLE OVERRIDE FOR LESSON HELPER:
This is a pre-set request, NOT a conversation. Respond like prepared educational content.

DO:
- Dive straight into the content (no greetings, no "Great question!")
- Deliver focused, useful information about the specific lesson content
- Use clear structure (headings, bullets) when it helps
- Keep it 80-200 words - enough to be helpful, not overwhelming

DO NOT:
- Start with greetings or acknowledgments
- Ask follow-up questions at the end
- Use phrases like "Let me...", "I'd be happy to...", "Great question!"
- Sound conversational or chatty
- Offer to explain further or ask if they have questions

Think of it like: You're writing a helpful tooltip or sidebar explanation, not chatting.
"""

ACTION_TYPE_INSTRUCTIONS = {
    'simplify': f"""{LESSON_HELPER_STYLE}
ACTION: SIMPLIFY THIS CONTENT
- Restate the key idea using simpler vocabulary
- Break down any complex terms into everyday language
- Use short sentences
- Focus on the one or two most important takeaways""",

    'example': f"""{LESSON_HELPER_STYLE}
ACTION: GIVE A REAL-WORLD EXAMPLE
- Provide ONE concrete, vivid example of this concept in action
- Make it relatable to a teenager's daily life or interests
- Show exactly how the concept applies
- Keep it specific and memorable (not abstract)""",

    'analogy': f"""{LESSON_HELPER_STYLE}
ACTION: EXPLAIN WITH AN ANALOGY
- Compare this concept to something familiar and concrete
- Choose something a teenager would know well
- Explain HOW the comparison works (what maps to what)
- A good analogy clarifies; a forced one confuses - be thoughtful""",

    'diagram': f"""{LESSON_HELPER_STYLE}
ACTION: VISUALIZE WITH ASCII DIAGRAM
- Create a simple text-based diagram using characters: | - + / \\ * o [ ]
- Label key parts clearly
- Keep it compact (will display in a small modal)
- Add a brief 1-line caption explaining what the diagram shows""",

    'why': f"""{LESSON_HELPER_STYLE}
ACTION: EXPLAIN WHY THIS MATTERS
- Connect this concept to something the student cares about
- Explain practical value or real-world importance
- Be specific about how understanding this helps them
- Avoid generic "this is important because..." language""",

    'details': f"""{LESSON_HELPER_STYLE}
ACTION: GO DEEPER
- Expand on the nuances and details of this concept
- Include information not covered in the basic explanation
- Add context that enriches understanding
- Use specific facts, data, or technical details where helpful""",

    'realworld': f"""{LESSON_HELPER_STYLE}
ACTION: SHOW REAL-WORLD APPLICATIONS
- List 2-3 concrete ways this concept is used in the real world
- Include diverse examples (different fields, industries, everyday life)
- Be specific about HOW it's applied, not just WHERE""",

    'connections': f"""{LESSON_HELPER_STYLE}
ACTION: CONNECT TO OTHER CONCEPTS
- Show how this relates to other ideas they might know
- Draw connections across subjects or topics
- Help them see the bigger picture
- Use phrases like "This connects to..." or "This is similar to..." """,

    'opposite': f"""{LESSON_HELPER_STYLE}
ACTION: PRESENT THE OPPOSITE VIEWPOINT
- Present a thoughtful counterargument or alternative perspective
- Be intellectually honest about the strengths of the opposing view
- Help them see the topic from multiple angles
- Present it as "Another perspective:" or "On the other hand..." """,

    'whatif': f"""{LESSON_HELPER_STYLE}
ACTION: EXPLORE "WHAT IF" SCENARIOS
- Present 2-3 interesting hypothetical scenarios related to this concept
- Each scenario should push their thinking in a new direction
- Use "What if..." or "Imagine..." to frame each one
- Keep scenarios grounded enough to be thought-provoking, not absurd""",

    'expert': f"""{LESSON_HELPER_STYLE}
ACTION: EXPLAIN HOW AN EXPERT THINKS ABOUT THIS
- Describe how a professional or expert in this field approaches this concept
- Share insights about the mental models or frameworks they use
- Include any field-specific terminology with brief explanations
- Help them think more like a practitioner, not just a student""",

    'another': f"""{LESSON_HELPER_STYLE}
ACTION: EXPLAIN IT A DIFFERENT WAY
- Take a completely fresh approach to explaining this concept
- If the previous explanation was abstract, make this one concrete (or vice versa)
- Use a different type of example, analogy, or framework
- Don't repeat anything from previous explanations""",

    'more': f"""{LESSON_HELPER_STYLE}
ACTION: TELL ME MORE
- Continue expanding on this concept with additional depth
- Add layers of understanding beyond the basics
- Include interesting details, edge cases, or nuances
- Build on what's already been explained"""
}


# =============================================================================
# CONVERSATION MODE INSTRUCTIONS - For tutor service
# =============================================================================

CONVERSATION_MODE_INSTRUCTIONS = {
    'study_buddy': """STUDY BUDDY MODE - Collaborative & Encouraging:
- Use "we" language and explore together
- Response format: Topic + 2-3 bullet insights + collaborative question
- Tone: Casual but focused, celebrate curiosity together""",

    'teacher': """TEACHER MODE - Structured & Clear:
- Response format: **Concept definition** + bullet steps + check understanding
- Break complex ideas into digestible pieces with clear formatting
- Tone: Clear, methodical, but still warm and encouraging""",

    'discovery': """DISCOVERY MODE - Question-Driven Learning:
- Response format: Thought-provoking observation + guided thinking points + deeper question
- Guide them to discover answers through structured questioning
- Tone: Curious, exploratory, focus on "What do you think?" questions""",

    'review': """REVIEW MODE - Consolidation & Connection:
- Response format: **What we know** + connections between ideas + reflection question
- Help them explain concepts in their own words
- Tone: Confidence-building, connect previous learning""",

    'creative': """CREATIVE MODE - Imagination & Innovation:
- Response format: **Exciting possibilities** + bullet brainstorm points + creative challenge
- Celebrate unique ideas and out-of-box thinking
- Tone: Enthusiastic about creativity, support experimentation"""
}


# =============================================================================
# LEARNING STYLE ADAPTATIONS
# =============================================================================

LEARNING_STYLE_INSTRUCTIONS = {
    'visual': "Adapt for VISUAL learner: Use diagrams, flowcharts, or spatial descriptions. Help them 'see' the concept.",
    'auditory': "Adapt for AUDITORY learner: Walk through the concept conversationally. Use rhythm, patterns, and verbal explanations.",
    'kinesthetic': "Adapt for KINESTHETIC learner: Suggest hands-on activities or experiments. Connect to physical actions or experiences.",
    'mixed': "Use a balanced approach with multiple explanation styles."
}
