"""
Course Generation Prompts
=========================

AI prompts for the multi-stage course generation wizard.
Designed for creating hands-on, action-oriented courses for homeschool families.

Philosophy:
- "The Process Is The Goal" - learning happens through doing
- Just-in-time teaching - minimal info needed to make a solid first try
- Hands-on outcomes - every course produces something you can see/use/share
- Universal design - adaptable across ages 6-18

Stages:
1. Outline Generation - Topic -> Title + 4-6 project outlines (3 alternatives)
2. Lesson Generation - Per project, generate 3-6 lessons with steps
3. Task Generation - Per lesson, generate 2-4 hands-on task suggestions
"""

# =============================================================================
# STAGE 1: OUTLINE GENERATION
# =============================================================================

OUTLINE_GENERATION_PROMPT = """
You are designing hands-on tutorial courses for homeschool families. These are NOT
traditional academic courses. Focus on what students will DO and MAKE.

INPUT:
- Topic: {topic}

TASK:
Generate 3 DIFFERENT course outline alternatives. Each alternative should take a
distinct creative angle on the topic.

=============================================================================
READABILITY GUIDELINES (APPLY TO ALL TEXT)
=============================================================================

Use common words over technical jargon. Keep sentences short and direct.
One main idea per sentence. Avoid abstract phrasing - be concrete.

WORD CHOICES - Use simpler alternatives:
- "demonstrate" -> "show"
- "utilize" -> "use"
- "implement" -> "build" or "add"
- "accomplish" -> "complete" or "finish"
- "facilitate" -> "help"
- "competent attempt" -> "solid first try"
- "tangible outcome" -> "something you can see/use/share"
- "intrinsic motivation" -> "natural curiosity"
- "rapid prototyping" -> "quick test version"
- "iteration" -> "trying again" or "improving"

=============================================================================
TITLE RULES (CRITICAL)
=============================================================================

Each course title must make it immediately obvious what students will DO or MAKE,
not what they'll learn about.

TITLE FORMAT:
- Keep titles SHORT (3-7 words max)
- Start with ACTION VERBS: Build, Design, Create, Cook, Launch, Repair, Write, Program, etc.
- Show the TANGIBLE OUTCOME in simple terms
- Use lowercase for style (capitalize first word only)
- NO exclamation points, NO fluff words like "your dream" or "from scratch"
- Feel fun and slightly unexpected - things traditional school would never offer

GOOD TITLE EXAMPLES:
- "Build a playable board game"
- "Start a micro-business"
- "Write and illustrate a children's book"
- "Take apart and rebuild electronics"
- "Design your own clothing line"
- "Create a stop-motion film"
- "Build a backyard wildlife habitat"
- "Launch a podcast"

BAD TITLE EXAMPLES (DO NOT USE):
- "Build a Playable Board Game from Scratch!" (too long, has exclamation)
- "Design Your Dream Adventure Game and Build It!" (way too long, fluffy)
- "Build a Card Game Kingdom from Your Imagination" (too flowery)
- "The Science of Electricity" (too passive, no action)
- "Introduction to Entrepreneurship" (too abstract, academic framing)
- "Creative Writing Fundamentals" (sounds like a textbook)

=============================================================================
PROJECT RULES
=============================================================================

Each course needs 4-6 PROJECTS that build progressively toward the final outcome.
Projects are hands-on milestones, not chapters to read.

IMPORTANT: Projects must work as STANDALONE QUESTS in addition to being part of the
course. Each project needs its own complete context.

PROJECT SCOPE - BROAD EXPLORATION, NOT PRESCRIPTIVE:
Projects should invite exploration of a topic area, NOT dictate a specific activity.
Let students discover their own path within each project's theme.

BAD (too prescriptive):
- "Build a birdhouse" (dictates exact outcome)
- "Write a haiku about nature" (too specific)
- "Create a poster about recycling" (locks in format)

GOOD (exploratory):
- "Explore woodworking basics" (they choose what to build)
- "Express ideas through poetry" (they choose the form and topic)
- "Share an environmental message" (they choose how)

PROJECT NAMING:
- Keep project titles SHORT (3-6 words)
- Use broad action verbs: Explore, Discover, Experiment, Create, Design, etc.
- Suggest a direction, not a destination
- Progressive: Each project builds on the previous one
- NO fluff words like "your dream", "from scratch", "amazing"

PROJECT STRUCTURE:
- Project 1: Foundation/first exploration (lower stakes, build confidence)
- Projects 2-4: Progressive skill building with increasing complexity
- Final Project: Capstone that combines all skills into a finished product of their choosing

PROJECT FIELDS (REQUIRED):
- title: Short exploratory title (3-6 words)
- description: 1-2 sentences about the area they'll explore (standalone context)
- big_idea: The key insight (1 sentence, simple language, standalone context)
- topic_primary: One of: Creative, Science, Nature, Building, Business, Food, Games, Personal, Academic
- topics: Array of 1-3 specific topic tags relevant to this project

Example for "Build a playable board game":
1. "Explore game rules and mechanics" - big_idea: "Every great game starts with clear rules"
2. "Test your ideas quickly" - big_idea: "A quick test version helps you find problems early"
3. "Learn from player feedback" - big_idea: "Watching others play shows you what works"
4. "Design the look and feel" - big_idea: "Good visuals make your game more fun to play"
5. "Create your final game" - big_idea: "Good materials make your final project shine"

=============================================================================
CATEGORIES
=============================================================================

Assign 1-3 categories from this list:
- outdoor/nature
- digital creation
- food and kitchen
- money and business
- storytelling and media
- repair and making
- community and people
- science and discovery
- art and design
- music and sound
- games and play
- building and construction

=============================================================================
RETURN FORMAT
=============================================================================

Return EXACTLY this JSON structure with 3 alternatives:

{{
  "alternatives": [
    {{
      "title": "Action-oriented course title",
      "description": "2-3 sentences describing what students will create. Use active voice. Focus on the tangible outcome and the journey to get there.",
      "projects": [
        {{
          "title": "Project 1: Foundation title",
          "description": "What they'll create in this project (standalone context)",
          "big_idea": "Key insight or learning outcome for this project",
          "topic_primary": "Creative",
          "topics": ["game design", "prototyping"],
          "order": 1
        }},
        {{
          "title": "Project 2: Building title",
          "description": "What they'll create in this project (standalone context)",
          "big_idea": "Key insight or learning outcome for this project",
          "topic_primary": "Creative",
          "topics": ["iteration", "testing"],
          "order": 2
        }},
        {{
          "title": "Project 3: Building title",
          "description": "What they'll create in this project (standalone context)",
          "big_idea": "Key insight or learning outcome for this project",
          "topic_primary": "Creative",
          "topics": ["visual design"],
          "order": 3
        }},
        {{
          "title": "Project 4: Advanced title",
          "description": "What they'll create in this project (standalone context)",
          "big_idea": "Key insight or learning outcome for this project",
          "topic_primary": "Creative",
          "topics": ["craftsmanship", "finishing"],
          "order": 4
        }}
      ],
      "categories": ["category1", "category2"]
    }},
    {{
      "title": "Different creative angle on the topic",
      "description": "...",
      "projects": [...],
      "categories": [...]
    }},
    {{
      "title": "Third distinct approach",
      "description": "...",
      "projects": [...],
      "categories": [...]
    }}
  ]
}}

=============================================================================
CREATIVE DIFFERENTIATION
=============================================================================

The 3 alternatives should explore DIFFERENT angles:
- Different end products (e.g., for "cooking": a cookbook vs a food blog vs a catering business)
- Different approaches (e.g., traditional vs modern vs fusion)
- Different scales (e.g., personal project vs community project vs business)
- Different audiences (e.g., making for self vs making for others)

Make each alternative genuinely distinct and exciting.
"""


# =============================================================================
# STAGE 2: PROJECT LESSONS GENERATION
# =============================================================================

PROJECT_LESSONS_PROMPT = """
You are creating lesson content for a hands-on project. Follow just-in-time teaching
principles: provide JUST ENOUGH information to make a solid first try.

INPUT:
- Course: {course_title}
- Project: {project_title}
- Project Description: {project_description}

TASK:
Generate 3-6 lessons that guide students through completing this project.

=============================================================================
READABILITY GUIDELINES (APPLY TO ALL TEXT)
=============================================================================

Use common words over technical jargon. Keep sentences short and direct.
One main idea per sentence. Avoid abstract phrasing - be concrete.

WORD CHOICES - Use simpler alternatives:
- "demonstrate" -> "show"
- "utilize" -> "use"
- "implement" -> "build" or "add"
- "accomplish" -> "complete" or "finish"
- "facilitate" -> "help"
- "competent attempt" -> "solid first try"
- "tangible outcome" -> "something you can see/use/share"
- "intrinsic motivation" -> "natural curiosity"
- "iteration" -> "trying again" or "improving"

=============================================================================
JUST-IN-TIME TEACHING PHILOSOPHY
=============================================================================

Learning happens when knowledge is APPLIED, not when content is consumed.

Each lesson should:
1. Provide the MINIMUM info needed to start a competent attempt
2. Focus on what to DO, not background theory
3. Trust that students will discover knowledge gaps while doing
4. Those gaps create intrinsic motivation to learn more
5. The AI tutor can provide deeper knowledge on-demand

BAD LESSON APPROACH:
- Long explanations before any action
- Complete theory before practice
- Covering all edge cases upfront
- "First, let's understand the history of..."

GOOD LESSON APPROACH:
- Quick context (why this matters)
- Essential info only (what you need RIGHT NOW)
- Immediate action step (try this)
- Learn-by-doing mentality

=============================================================================
LESSON STRUCTURE
=============================================================================

Each lesson needs:
- title: Clear, action-oriented (e.g., "Setting Up Your First Template")
- description: One sentence about what they'll accomplish
- steps: 5-10 steps that guide them through the lesson
- scaffolding: Age adaptation notes

STEP FORMAT:
Each step has:
- id: Unique identifier (format: step_[random 6 alphanumeric chars])
- type: "text" (always text for auto-generated content)
- title: Short action phrase (3-6 words)
- content: HTML content (use <p>, <ul>, <li>, <strong>, <em>)
- order: Sequence number (0-indexed)

CONTENT GUIDELINES:
- Keep paragraphs short (1-3 sentences)
- Use specific, actionable instructions
- Be direct and clear
- Avoid jargon - use everyday words
- One main idea per step
- Use bullet points for lists

=============================================================================
SCAFFOLDING (UNIVERSAL DESIGN)
=============================================================================

For each lesson, provide scaffolding notes to adapt for different ages:
- ages_6_8: Simpler version for younger learners (ages 6-8)
- ages_12_plus: Extended version for older learners (ages 12+)

Examples:
- ages_6_8: "Use pre-made templates instead of starting blank"
- ages_6_8: "Work with a parent or older sibling on the measuring"
- ages_6_8: "Focus on the basic idea before adding more"
- ages_12_plus: "Add a business plan part"
- ages_12_plus: "Look up how professionals do it and try their methods"
- ages_12_plus: "Help teach younger learners what you've learned"

=============================================================================
RETURN FORMAT
=============================================================================

Return EXACTLY this JSON structure:

{{
  "lessons": [
    {{
      "title": "Lesson Title",
      "description": "One sentence about what they'll accomplish",
      "order": 0,
      "steps": [
        {{
          "id": "step_abc123",
          "type": "text",
          "title": "Step Title Here",
          "content": "<p>Brief instructional content with <strong>key points</strong> highlighted.</p><ul><li>Action item one</li><li>Action item two</li></ul>",
          "order": 0
        }},
        {{
          "id": "step_def456",
          "type": "text",
          "title": "Next Step Title",
          "content": "<p>More content...</p>",
          "order": 1
        }}
      ],
      "scaffolding": {{
        "ages_6_8": "Simpler version for younger learners (ages 6-8)",
        "ages_12_plus": "Extended version for older learners (ages 12+)"
      }}
    }}
  ]
}}

Generate step IDs using random 6-character alphanumeric strings (e.g., step_x7k2m9).
"""


# =============================================================================
# STAGE 3: TASK GENERATION
# =============================================================================

TASK_GENERATION_PROMPT = """
You are generating hands-on task suggestions for a lesson. Tasks are where learning
actually happens - students apply what they learned to create something real.

INPUT:
- Course: {course_title}
- Project: {project_title}
- Lesson: {lesson_title}
- Lesson Content Summary: {lesson_summary}

TASK:
Generate 2-4 task suggestions that let students apply what they learned.

=============================================================================
READABILITY GUIDELINES (APPLY TO ALL TEXT)
=============================================================================

Use common words over technical jargon. Keep sentences short and direct.
One main idea per sentence. Avoid abstract phrasing - be concrete.

WORD CHOICES - Use simpler alternatives:
- "demonstrate" -> "show"
- "utilize" -> "use"
- "implement" -> "build" or "add"
- "accomplish" -> "complete" or "finish"
- "facilitate" -> "help"
- "tangible outcome" -> "something you can see/use/share"

=============================================================================
TASK PHILOSOPHY
=============================================================================

Tasks should:
1. Require APPLYING the lesson content (not just reading or watching)
2. Produce a TANGIBLE outcome (something they made/did/created)
3. Allow PERSONALIZATION (students can make it their own)
4. Be COMPLETABLE in a reasonable session (not multi-day projects)

Students can also create their own tasks - these are starting suggestions.

=============================================================================
TASK PILLARS
=============================================================================

Assign each task a pillar based on what skill it mainly uses:

- creativity: Making new things, art, design
- knowledge: Research, learning, understanding how things work
- social: Working with others, sharing, teaching, community projects
- physical: Building, hands-on work, physical activity

Try to vary pillars across tasks in a lesson.

=============================================================================
XP VALUES
=============================================================================

Assign XP based on effort and complexity:
- 50-100 XP: Quick tasks (15-30 minutes), simple application
- 100-150 XP: Moderate tasks (30-60 minutes), requires thought and effort (most common)
- 150-200 XP: Substantial tasks (1-2 hours), significant creation or challenge

=============================================================================
TASK NAMING AND LANGUAGE (5th-6th GRADE READING LEVEL)
=============================================================================

Use simple action verbs that show what they'll DO:
- Make, Build, Draw, Write, Record, Create, Try, etc.

The TASK can be challenging, but the WORDS should be simple enough for a 10-year-old to understand.

BAD task names (too complex or passive):
- "Synthesize a comprehensive color palette" -> "Pick colors for your project"
- "Demonstrate understanding of techniques" -> "Show what you learned"
- "Analyze and evaluate your prototype" -> "Test your project and find problems"

GOOD task names (simple words, clear action):
- "Pick colors for your project"
- "Build a quick test version with stuff from home"
- "Record a 2-minute video explaining your idea"
- "Draw three different logo ideas"

BAD descriptions:
- "Synthesize your research to formulate a comprehensive design strategy"

GOOD descriptions:
- "Look at what you learned and use it to plan your design. Write down your ideas."

=============================================================================
RETURN FORMAT
=============================================================================

Return EXACTLY this JSON structure:

{{
  "tasks": [
    {{
      "title": "Action-verb task title",
      "description": "Clear description of what to do and what the outcome looks like. Be specific enough that students know when they're done.",
      "pillar": "creativity",
      "xp_value": 125
    }},
    {{
      "title": "Another task title",
      "description": "...",
      "pillar": "knowledge",
      "xp_value": 75
    }},
    {{
      "title": "Third task option",
      "description": "...",
      "pillar": "physical",
      "xp_value": 175
    }}
  ]
}}

Generate 2-4 tasks per lesson. Vary the pillars and XP values.
"""


# =============================================================================
# ALTERNATIVE GENERATION (For regeneration feature)
# =============================================================================

REGENERATE_LESSONS_PROMPT = """
You are generating ALTERNATIVE lesson content for a project. The user wants to see
different approaches to teaching this same project.

INPUT:
- Course: {course_title}
- Project: {project_title}
- Project Description: {project_description}
- Previous Lessons (to differentiate from): {previous_lessons}

TASK:
Generate 2-3 ALTERNATIVE lesson sets. Each should take a different teaching approach
while still covering the same project goals.

=============================================================================
READABILITY GUIDELINES (APPLY TO ALL TEXT)
=============================================================================

Use common words over technical jargon. Keep sentences short and direct.
One main idea per sentence. Avoid abstract phrasing - be concrete.

WORD CHOICES - Use simpler alternatives:
- "demonstrate" -> "show"
- "utilize" -> "use"
- "implement" -> "build" or "add"
- "accomplish" -> "complete" or "finish"
- "facilitate" -> "help"

SCAFFOLDING KEYS:
- Use "ages_6_8" for younger learner adaptations
- Use "ages_12_plus" for older learner extensions

Differentiation ideas:
- Different ordering of concepts
- Different examples and analogies
- More hands-on vs more conceptual
- Different pacing (fewer deep lessons vs more quick lessons)
- Different entry points (where to start)

Return the same JSON structure as PROJECT_LESSONS_PROMPT, but wrapped in an "alternatives" array:

{{
  "alternatives": [
    {{
      "approach": "Brief description of this teaching approach",
      "lessons": [...]
    }},
    {{
      "approach": "Different approach description",
      "lessons": [...]
    }}
  ]
}}
"""


REGENERATE_TASKS_PROMPT = """
You are generating ALTERNATIVE task suggestions for a lesson. The user wants to see
different task options.

INPUT:
- Course: {course_title}
- Project: {project_title}
- Lesson: {lesson_title}
- Lesson Content Summary: {lesson_summary}
- Previous Tasks (to differentiate from): {previous_tasks}

TASK:
Generate 2-3 ALTERNATIVE task sets. Each should offer different ways to apply the
lesson content.

=============================================================================
READABILITY GUIDELINES (APPLY TO ALL TEXT)
=============================================================================

Use common words over technical jargon. Keep sentences short and direct.
One main idea per sentence. Avoid abstract phrasing - be concrete.

WORD CHOICES - Use simpler alternatives:
- "demonstrate" -> "show"
- "utilize" -> "use"
- "implement" -> "build" or "add"
- "accomplish" -> "complete" or "finish"
- "facilitate" -> "help"

Differentiation ideas:
- Different output formats (written vs visual vs video vs physical)
- Different complexity levels
- Different pillars emphasis
- Individual vs collaborative options
- Different real-world applications

Return the same JSON structure as TASK_GENERATION_PROMPT, but wrapped in an "alternatives" array:

{{
  "alternatives": [
    {{
      "approach": "Brief description of this task set approach",
      "tasks": [...]
    }},
    {{
      "approach": "Different approach description",
      "tasks": [...]
    }}
  ]
}}
"""


# =============================================================================
# LESSON CONTENT GENERATION (for existing lessons with empty content)
# =============================================================================

LESSON_CONTENT_PROMPT = """
You are generating content for an existing lesson that only has a title.
Follow just-in-time teaching principles: provide JUST ENOUGH information to make a solid first try.

INPUT:
- Course: {course_title}
- Project: {project_title}
- Project Description: {project_description}
- Lesson Title: {lesson_title}
- Lesson Description: {lesson_description}

TASK:
Generate the step-by-step content for this specific lesson.

=============================================================================
READABILITY GUIDELINES (APPLY TO ALL TEXT)
=============================================================================

Use common words over technical jargon. Keep sentences short and direct.
One main idea per sentence. Avoid abstract phrasing - be concrete.

WORD CHOICES - Use simpler alternatives:
- "demonstrate" -> "show"
- "utilize" -> "use"
- "implement" -> "build" or "add"
- "accomplish" -> "complete" or "finish"
- "facilitate" -> "help"
- "competent attempt" -> "solid first try"
- "tangible outcome" -> "something you can see/use/share"
- "intrinsic motivation" -> "natural curiosity"
- "iteration" -> "trying again" or "improving"

=============================================================================
JUST-IN-TIME TEACHING PHILOSOPHY
=============================================================================

Learning happens when knowledge is APPLIED, not when content is consumed.

Each lesson should:
1. Provide the MINIMUM info needed to start a competent attempt
2. Focus on what to DO, not background theory
3. Trust that students will discover knowledge gaps while doing
4. Those gaps create intrinsic motivation to learn more
5. The AI tutor can provide deeper knowledge on-demand

=============================================================================
STEP FORMAT
=============================================================================

Each step has:
- id: Unique identifier (format: step_[random 6 alphanumeric chars])
- type: "text" (always text for auto-generated content)
- title: Short action phrase (3-6 words)
- content: HTML content (use <p>, <ul>, <li>, <strong>, <em>)
- order: Sequence number (0-indexed)

CONTENT GUIDELINES:
- Keep paragraphs short (1-3 sentences)
- Use specific, actionable instructions
- Be direct and clear
- Avoid jargon - use everyday words
- One main idea per step
- Use bullet points for lists

=============================================================================
SCAFFOLDING (UNIVERSAL DESIGN)
=============================================================================

Provide scaffolding notes to adapt for different ages:
- ages_6_8: Simpler version for younger learners (ages 6-8)
- ages_12_plus: Extended version for older learners (ages 12+)

=============================================================================
RETURN FORMAT
=============================================================================

Return EXACTLY this JSON structure:

{{
  "description": "One sentence about what they'll accomplish (if not already provided)",
  "steps": [
    {{
      "id": "step_abc123",
      "type": "text",
      "title": "Step Title Here",
      "content": "<p>Brief instructional content with <strong>key points</strong> highlighted.</p><ul><li>Action item one</li><li>Action item two</li></ul>",
      "order": 0
    }},
    {{
      "id": "step_def456",
      "type": "text",
      "title": "Next Step Title",
      "content": "<p>More content...</p>",
      "order": 1
    }}
  ],
  "scaffolding": {{
    "ages_6_8": "Simpler version for younger learners (ages 6-8)",
    "ages_12_plus": "Extended version for older learners (ages 12+)"
  }}
}}

Generate step IDs using random 6-character alphanumeric strings (e.g., step_x7k2m9).
Generate 5-10 steps that guide students through this lesson.
"""


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def get_outline_prompt(topic: str) -> str:
    """Get the outline generation prompt with topic filled in."""
    return OUTLINE_GENERATION_PROMPT.format(topic=topic)


def get_lessons_prompt(course_title: str, project_title: str, project_description: str) -> str:
    """Get the lesson generation prompt with context filled in."""
    return PROJECT_LESSONS_PROMPT.format(
        course_title=course_title,
        project_title=project_title,
        project_description=project_description
    )


def get_tasks_prompt(
    course_title: str,
    project_title: str,
    lesson_title: str,
    lesson_summary: str
) -> str:
    """Get the task generation prompt with context filled in."""
    return TASK_GENERATION_PROMPT.format(
        course_title=course_title,
        project_title=project_title,
        lesson_title=lesson_title,
        lesson_summary=lesson_summary
    )


def get_regenerate_lessons_prompt(
    course_title: str,
    project_title: str,
    project_description: str,
    previous_lessons: list
) -> str:
    """Get the lesson regeneration prompt for alternatives."""
    import json
    return REGENERATE_LESSONS_PROMPT.format(
        course_title=course_title,
        project_title=project_title,
        project_description=project_description,
        previous_lessons=json.dumps(previous_lessons, indent=2)
    )


def get_regenerate_tasks_prompt(
    course_title: str,
    project_title: str,
    lesson_title: str,
    lesson_summary: str,
    previous_tasks: list
) -> str:
    """Get the task regeneration prompt for alternatives."""
    import json
    return REGENERATE_TASKS_PROMPT.format(
        course_title=course_title,
        project_title=project_title,
        lesson_title=lesson_title,
        lesson_summary=lesson_summary,
        previous_tasks=json.dumps(previous_tasks, indent=2)
    )


def get_lesson_content_prompt(
    course_title: str,
    project_title: str,
    project_description: str,
    lesson_title: str,
    lesson_description: str = ''
) -> str:
    """Get the lesson content generation prompt for a lesson with just a title."""
    return LESSON_CONTENT_PROMPT.format(
        course_title=course_title,
        project_title=project_title,
        project_description=project_description,
        lesson_title=lesson_title,
        lesson_description=lesson_description or ''
    )
