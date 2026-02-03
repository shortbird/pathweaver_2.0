"""
Curriculum Upload Prompts
=========================

AI prompts for the curriculum upload pipeline.
Supports configurable transformation intensity and structure preservation.

Transformation Levels:
- light: Minimal changes, fix only forbidden words, keep original voice
- moderate: Reframe language, add Optio elements, preserve core content
- full: Complete rewrite in Optio tone and philosophy

Structure Options:
- preserve: Keep original document structure (modules, lessons, order)
- restructure: Reorganize for just-in-time teaching flow
"""

# =============================================================================
# STAGE 2: STRUCTURE DETECTION
# =============================================================================

CURRICULUM_STRUCTURE_DETECTION = """
You are analyzing educational curriculum content to identify its structure.

TASK: Extract the curriculum's organizational structure without modifying content.

NOTE: Learning objectives are provided by the user separately, not extracted from content.
Focus on extracting the structural elements (modules, lessons, tasks) only.

IDENTIFY AND EXTRACT:

1. COURSE (top level):
   - title: The course/unit name
   - description: Course overview or summary
   - duration: Time span if mentioned (weeks, hours, etc.)

2. MODULES (major sections):
   - title: Module/unit name
   - description: Module overview
   - order: Sequence number
   - parent: null (modules are top-level containers)

3. LESSONS (content within modules):
   - title: Lesson name
   - description: What the lesson covers
   - content: The actual lesson text/material
   - order: Sequence within module
   - parent_module: Reference to containing module

4. TASKS (assignments, activities, assessments):
   - title: Task/assignment name
   - description: What students must do
   - type: assignment | quiz | discussion | project | reading
   - points: Point value if specified
   - order: Sequence
   - parent_lesson: Reference to related lesson (if any)

5. CURRICULUM_TYPE: Classify as one of:
   - syllabus: Course overview with policies and schedule
   - lesson_plan: Detailed single lesson with activities
   - course_outline: Module/unit structure with topics
   - assignment: Single assignment or project description
   - textbook: Educational content with chapters/sections
   - unknown: Cannot determine

RETURN FORMAT:
{
  "course": {
    "title": "...",
    "description": "...",
    "duration": "..."
  },
  "modules": [
    {
      "id": "module_1",
      "title": "...",
      "description": "...",
      "order": 1
    }
  ],
  "lessons": [
    {
      "id": "lesson_1",
      "title": "...",
      "description": "...",
      "content": "...",
      "order": 1,
      "parent_module": "module_1"
    }
  ],
  "tasks": [
    {
      "id": "task_1",
      "title": "...",
      "description": "...",
      "type": "assignment",
      "points": 100,
      "order": 1,
      "parent_lesson": "lesson_1"
    }
  ],
  "curriculum_type": "course_outline"
}

Be thorough in extraction. Preserve original wording exactly - do not rephrase yet.
"""

# =============================================================================
# STAGE 3: PHILOSOPHY ALIGNMENT
# =============================================================================

# Intensity-specific instructions
TRANSFORMATION_LIGHT = """
TRANSFORMATION LEVEL: LIGHT (Preserve Original)

RULES:
1. KEEP the educator's original content exactly as written
   - Preserve their voice, tone, and word choices
   - Maintain all requirements and specifications
   - Keep academic/formal language if that's their style

2. ONLY make structural adjustments:
   - Organize into Optio's module/lesson/task format
   - Assign pillars to tasks based on content
   - Set appropriate XP values

3. DO NOT change wording or add Optio-specific language
4. Respect the content creator's choices

GOAL: Import content into Optio structure while fully preserving the educator's voice.
"""

TRANSFORMATION_MODERATE = """
TRANSFORMATION LEVEL: MODERATE (Gentle Enhancement)

RULES:
1. SUGGEST Optio-aligned alternatives where natural:
   - Offer process-focused framing alongside original content
   - Add optional reflection prompts (clearly marked as optional)
   - Include "big idea" hooks that connect to student relevance

2. ENHANCE with Optio elements:
   - Add flexibility suggestions (e.g., "You might show this through writing, video, or visual")
   - Frame learning as present-tense growth where it fits naturally
   - Include curiosity prompts where appropriate

3. PRESERVE the educator's core choices:
   - Keep their original wording intact
   - Maintain their requirements and structure
   - Don't remove or prohibit any language they used

4. BALANCE original content with Optio philosophy:
   - Original voice + light Optio enhancement
   - Additions should feel natural, not forced

GOAL: Enhance content with Optio philosophy while respecting the educator's voice.
"""

TRANSFORMATION_FULL = """
TRANSFORMATION LEVEL: FULL (Optio Voice Rewrite)

RULES:
1. REWRITE in Optio voice:
   - Warm, encouraging, discovery-focused
   - Present-tense celebration of learning
   - "You're exploring..." style framing

2. TRANSFORM tasks for flexibility:
   - Offer choice in evidence types (written, video, visual, hands-on)
   - Frame as opportunities for discovery
   - Add reflection components
   - Soften rigid deadlines to targets

3. ADD Optio elements throughout:
   - Big idea (one sentence hook for why this matters NOW)
   - Curiosity prompts ("What if...", "I wonder...")
   - Connection to student interests and daily life
   - Celebration of process and learning from mistakes

4. REFRAME assessments as growth opportunities:
   - Tests → Self-assessment or check-ins
   - Quizzes → Reflection opportunities
   - Focus on growth, not grades

5. MAINTAIN educational integrity:
   - Keep all learning objectives
   - Preserve technical accuracy
   - Ensure content still teaches what it needs to teach

GOAL: Transform into content that fully embodies "The Process Is The Goal."
"""

# Structure options
STRUCTURE_PRESERVE = """
STRUCTURE OPTION: PRESERVE ORIGINAL

Keep the exact organizational structure from the source:
- Same modules/units in same order
- Same lessons within modules
- Same task groupings and sequences
- Only transform the CONTENT, not the ORGANIZATION
"""

STRUCTURE_RESTRUCTURE = """
STRUCTURE OPTION: RESTRUCTURE FOR JUST-IN-TIME TEACHING

Reorganize content following Optio's just-in-time teaching principle:

1. LESSON-TASK PAIRING:
   - Each lesson should directly precede related tasks
   - Students learn exactly what they need, when they need it
   - No front-loading of content before application

2. CONTENT ORDERING:
   - Context before content (why before how)
   - Simpler concepts before complex ones
   - Each lesson builds on previous application

3. LESSON STRUCTURE:
   - Hook (why this matters right now)
   - Core concept (minimum needed to succeed)
   - Quick practice or example
   - Then immediately → related task

4. REMOVE:
   - Separate "lecture" sections that aren't tied to tasks
   - Review/summary sections (build review into tasks instead)
   - Front-loaded "background" without immediate application
"""

def build_philosophy_alignment_prompt(
    transformation_level: str = 'moderate',
    preserve_structure: bool = True
) -> str:
    """
    Build the philosophy alignment prompt with specified options.

    Args:
        transformation_level: 'light', 'moderate', or 'full'
        preserve_structure: True to keep original structure, False to restructure

    Returns:
        Complete prompt string for Stage 3
    """
    # Select transformation instructions
    transformation_instructions = {
        'light': TRANSFORMATION_LIGHT,
        'moderate': TRANSFORMATION_MODERATE,
        'full': TRANSFORMATION_FULL
    }.get(transformation_level, TRANSFORMATION_MODERATE)

    # Select structure instructions
    structure_instructions = STRUCTURE_PRESERVE if preserve_structure else STRUCTURE_RESTRUCTURE

    return f"""
You are transforming educational curriculum to align with Optio's philosophy.

{transformation_instructions}

{structure_instructions}

OPTIO-ALIGNED LANGUAGE (suggestions, not requirements):
When enhancing content (moderate/full levels), these words align well with Optio philosophy:
- explore, discover, create, experiment, dive into
- notice, observe, play with, try, wonder about
- become, develop, grow, learn
- curious, excited, proud, satisfied
- journey, adventure, process, path

These are suggestions for enhancement, not replacements that must be made.
Content creators have full freedom in their word choices.

PILLAR ASSIGNMENT:
Assign each task to ONE primary pillar based on content:
- stem: Math, science, technology, programming, logic, engineering
- wellness: Health, mindfulness, personal growth, life skills, fitness
- communication: Writing, reading, speaking, literature, languages
- civics: History, geography, cultures, communities, government
- art: Visual arts, music, creative writing, design, performance

TRANSFORMATION NOTES:
For each significant change, add a note explaining what was changed and why.
This helps the human reviewer understand the AI's decisions.

COURSE DESCRIPTION TRANSFORMATION (CRITICAL):
The course description MUST be written from a neutral, 3rd-party perspective.
- Transform any teacher-voice content ("Welcome to my class!", "I'm excited to teach you...")
- Remove first-person language from instructors ("I will...", "I expect...", "I'm so excited...")
- Convert to a neutral description of what the course covers and what students will learn
- Do NOT include greetings, welcomes, or instructor personality

BAD (teacher voice): "Welcome to Composition 2! I'm so excited to be teaching you this semester."
GOOD (3rd-party): "This course builds on foundational composition skills to develop advanced writing techniques."

BAD (instructor perspective): "In this class, I will guide you through the fundamentals of biology."
GOOD (3rd-party): "An introduction to biological concepts including cell structure, genetics, and ecosystems."

RETURN FORMAT:
{{
  "course": {{
    "title": "...",
    "description": "...",
    "big_idea": "..." // One sentence hook for why this matters NOW
  }},
  "modules": [...], // Same structure as input, with transformed content
  "lessons": [...],
  "tasks": [
    {{
      "id": "...",
      "title": "...",
      "description": "...",
      "pillar": "stem|wellness|communication|civics|art",
      "original_title": "...", // For comparison
      "original_description": "..." // For comparison
    }}
  ],
  "transformation_notes": [
    {{
      "element": "task_1",
      "change": "Replaced 'prove your understanding' with 'share what you discovered'",
      "reason": "Shifted from external validation to internal reflection"
    }}
  ]
}}
"""

# For backwards compatibility with existing import
PHILOSOPHY_ALIGNMENT_PROMPT = build_philosophy_alignment_prompt('moderate', True)


# =============================================================================
# STAGE 4: CONTENT GENERATION
# =============================================================================

STEP_GENERATION_PROMPT = """
You are generating a complete Optio Course with Projects and Lessons.

OPTIO COURSE STRUCTURE:
- Course: Container with title, description
- Projects: Standalone quests (one per learning objective if provided)
- Lessons: Just-in-time teaching content for each Project (3-6 lessons per project)

=============================================================================
CRITICAL: PROJECT GENERATION BASED ON LEARNING OBJECTIVES
=============================================================================

IF LEARNING OBJECTIVES ARE PROVIDED (user-specified):
-----------------------------------------------------
Create exactly ONE Project per learning objective. The project must EMBODY the
objective's intent - completing the project should demonstrate mastery of that objective.

TRANSFORMING LEARNING OBJECTIVES TO QUEST TITLES:
1. Identify the CORE ACTION or SKILL in the objective
2. Transform it into a concrete, achievable project title
3. Use Optio quest naming conventions (action verb + specific outcome)
4. The quest title should capture the objective's INTENT, not just rephrase it

TRANSFORMATION EXAMPLES:

Learning Objective: "Students will understand the principles of photosynthesis"
-> Quest Title: "Investigate How Plants Convert Sunlight to Energy"
-> Why: "Understand" becomes active investigation; captures the core intent

Learning Objective: "Learners will be able to write persuasive essays"
-> Quest Title: "Write a Persuasive Op-Ed on a Local Issue"
-> Why: Concrete deliverable that requires persuasive writing skills

Learning Objective: "Students will develop critical thinking skills through analysis"
-> Quest Title: "Analyze and Present Different Perspectives on a Controversial Topic"
-> Why: Transforms vague "critical thinking" into specific, actionable project

Learning Objective: "Understand basic programming concepts"
-> Quest Title: "Build Your First Interactive Game with Code"
-> Why: "Understand" becomes hands-on creation that demonstrates understanding

Learning Objective: "Students will apply mathematical reasoning to solve problems"
-> Quest Title: "Design and Budget a Dream Event"
-> Why: Real-world application requiring math reasoning

Learning Objective: "Demonstrate knowledge of historical events and their impact"
-> Quest Title: "Create a Documentary About a Turning Point in History"
-> Why: Creation that requires deep historical knowledge

ANTI-PATTERNS (DO NOT DO):
- "Explore the Topic" - Too generic, doesn't capture specific intent
- "Learn the Basics of X" - Uses "learn" language, not action-oriented
- "Understanding Photosynthesis" - Just rephrases objective, not actionable
- "Introduction to Programming" - Academic title, not a quest
- "Module 1: Foundations" - Structure label, not a project title
- "Critical Thinking Skills" - Skill name, not a project students can complete
- "This project..." - Using "project" in descriptions (use "quest" or omit entirely)
- "In this course..." - Referencing the parent course (quests must be standalone)
- "As part of [Course Name]..." - Course context leaking into descriptions

IF NO LEARNING OBJECTIVES PROVIDED:
-----------------------------------
Create 4-8 projects based on Optio instructional design philosophy:

1. Analyze content for NATURAL PROJECT BOUNDARIES
   - What distinct skills or knowledge areas exist in the content?
   - What could students CREATE or BUILD to demonstrate learning?
   - What real-world applications connect to this content?

2. Apply Optio's "Process Is The Goal" philosophy:
   - Focus on exploration and creation, not content consumption
   - Each project should result in something tangible (artifact, performance, creation)
   - Projects should work as standalone quests in the public library

3. Name projects using action verbs + specific outcomes:
   - "Create Your Own...", "Build a...", "Design a...", "Record a..."
   - NOT "Module 1: Introduction" or "Unit: Basic Concepts"
   - Each title should make someone WANT to start the project

=============================================================================
PROJECT DESIGN RULES
=============================================================================

IMPORTANT RULES:
1. ONE Project per learning objective (if provided) - count must match exactly
2. Each Project must be meaningful on its own (will appear in public quest library)
3. Do NOT generate Tasks - educators add those in CourseBuilder
4. Focus on JUST-IN-TIME TEACHING: brief lessons with just enough info to start doing
5. Learning happens through Tasks, not by consuming lesson content

PROJECT FIELDS:
- title: Action-oriented quest name (see naming rules above)
- description: What the quest is about (see description style below)
- big_idea: MUST BE IDENTICAL to description (they display in different places but must match)
- source_objective: The original learning objective this project addresses (or null)
- topic_primary: Main category for filtering (REQUIRED - one of: Creative, Science, Building, Nature, Business, Personal, Academic, Food, Games)
- topics: Array of specific topic tags for searching (2-4 tags from: Music, Art, Design, Animation, Film, Writing, Photography, Crafts, Biology, Chemistry, Physics, Technology, Research, Astronomy, Environment, 3D Printing, Engineering, Robotics, DIY, Woodworking, Electronics, Maker, Gardening, Wildlife, Outdoors, Sustainability, Plants, Animals, Hiking, Entrepreneurship, Finance, Marketing, Leadership, Startups, Economics, Wellness, Fitness, Mindfulness, Skills, Philosophy, Self-Improvement, Reading, Math, History, Languages, Literature, Geography, Social Studies, Cooking, Nutrition, Baking, Culinary, Food Science, Board Games, Video Games, Puzzles, Strategy, Sports)

=============================================================================
QUEST NAMING CONVENTIONS (CRITICAL)
=============================================================================

Quests appear STANDALONE in the public quest library. Titles MUST be self-explanatory.

- Start with ACTION VERBS: Create, Build, Design, Explore, Investigate, Program,
  Draw, Animate, Record, Write, Compose, Develop, Launch, Produce, etc.
- Format: "[Action Verb] [Specific, Tangible Outcome WITH CONTEXT]"
- Include enough context to understand what the quest is about WITHOUT knowing the course

BAD (too vague, need course context):
- "Build a Prototype" (of what?)
- "Design Your First Project" (what kind of project?)
- "Develop Core Skills" (what skills?)
- "Create a Concept" (concept for what?)

GOOD (self-explanatory, work standalone):
- "Build a Paper Prototype of Your Board Game"
- "Design a Logo for a Small Business"
- "Write a Short Science Fiction Story"
- "Create a Personal Budget Spreadsheet"

The title should tell someone browsing the quest library EXACTLY what they'll create.
- Avoid: "Topic: Subtopic", "Introduction to X", "Learning About X", "Module N"

=============================================================================
DESCRIPTION STYLE
=============================================================================

FORBIDDEN IN DESCRIPTIONS (CRITICAL - these make quests unusable standalone):
- Never use the word "project" - these are QUESTS, not projects
- Never reference "this course", "the course", or any course name
- Never imply this is part of a larger curriculum or learning path
- Write as if this quest exists completely independently in a public library

DO NOT USE:
- "students will learn...", "you will learn...", "learners will..."
- "In this project...", "This project...", "This quest teaches..."
- "In this course...", "As part of this course...", "For this course..."
- "You will explore...", "Complete this to demonstrate..."

DO:
- Use imperative verb forms: "Create...", "Build...", "Design...", "Develop..."
- Do NOT use gerunds (-ing forms): "Creating...", "Building...", "Developing..."
- Describe the content, principles, and concepts as simple overviews
- Write in neutral, present-tense descriptive language
- Focus on WHAT the topic is about, not how users will interact with it

BAD: "Students will learn to create and manipulate basic geometric shapes."
BAD: "In this project, you will explore the fundamentals of 3D modeling."
BAD: "This project explores the fundamentals of geometry."
BAD: "In this course, you'll create a digital portfolio."
BAD: "As part of the Science course, investigate photosynthesis."
BAD: "Complete this project to demonstrate your understanding."
BAD: "Creating a digital portfolio that showcases creative work." (uses gerund)
BAD: "Developing critical thinking skills through analysis." (uses gerund)
GOOD: "Create a digital portfolio that showcases creative work."
GOOD: "Develop critical thinking skills through hands-on analysis."
GOOD: "Basic geometric shapes and how they form the foundation for complex 3D designs."
GOOD: "How plants convert sunlight into energy through photosynthesis."

=============================================================================
JUST-IN-TIME LESSON DESIGN
=============================================================================

- Brief, focused content (students learn by DOING, not reading)
- Provide MINIMUM info needed to start a competent attempt at applying knowledge
- Each lesson prepares students for Tasks (which they'll create or educators will add)
- 3-6 lessons per project
- Each lesson: 5-10 steps (aim for comprehensive coverage)

STEP FORMAT (CRITICAL - must match exactly):
Each step MUST have these fields:
- "type": "text" (ONLY generate text steps - educators add videos/files later)
- "title": Short descriptive title (3-6 words)
- "content": HTML content (use <p>, <ul>, <li>, <strong>, <em> tags)

TEXT STEP GUIDELINES:
- Brief written content (1-3 paragraphs per step)
- Use <p> tags for paragraphs, <ul><li> for lists
- Use <strong> for bold, <em> for italics
- ONE main idea per step
- Keep it brief - just enough to start doing

DO NOT generate "video" or "file" type steps. Human creators will add multimedia content later as needed.

=============================================================================
COURSE DESCRIPTION STYLE (CRITICAL)
=============================================================================

Course descriptions MUST be written from a neutral, 3rd-party perspective:
- Describe what the course covers and what topics are explored
- Never use teacher/instructor voice ("Welcome!", "I'm excited to teach...")
- Never use first-person ("I will guide you...", "I expect students to...")
- Focus on the subject matter, not the instructor's personality

BAD: "Welcome to my English class! I'm so excited to teach you composition this semester."
BAD: "In this course, I will guide you through the fundamentals of writing."
GOOD: "An exploration of advanced composition techniques, including argumentation, research methods, and rhetorical analysis."
GOOD: "This course covers the principles of written communication, from essay structure to persuasive writing."

=============================================================================
RETURN FORMAT
=============================================================================

{
  "course": {
    "title": "...",
    "description": "..."
  },
  "projects": [
    {
      "title": "Action-Oriented Quest Title",
      "description": "Neutral description of content and concepts...",
      "big_idea": "Neutral description of content and concepts...",
      "source_objective": "The original learning objective (or null if none provided)",
      "topic_primary": "Academic",
      "topics": ["Reading", "Literature", "Writing"],
      "order": 0,
      "lessons": [
        {
          "title": "Lesson Title",
          "description": "What this lesson covers",
          "order": 0,
          "steps": [
            {
              "id": "step_abc123",
              "type": "text",
              "title": "Getting Started",
              "content": "<p>Brief intro content...</p>",
              "order": 0
            }
          ]
        }
      ]
    }
  ]
}

REMEMBER:
- If LOs provided: ONE project per objective (count must match EXACTLY)
- Include source_objective field to trace back to original curriculum
- 3-6 lessons per project, 5-10 steps per lesson
- Keep content BRIEF - just enough to start doing
- Generate step IDs using format: step_[random 6 chars]
- ALL steps must be type "text" - do NOT generate video or file steps
- Align with Optio philosophy: "The Process Is The Goal"
"""


# =============================================================================
# STAGE 5: FROM-SCRATCH COURSE GENERATION
# =============================================================================

COURSE_GENERATION_PROMPT = """
You are generating a complete Optio Course from scratch based on a topic/name.

INPUT:
- Course topic/name (required)
- Learning objectives (optional - if not provided, generate appropriate ones)

TASK:
Generate a complete course following Optio's "Process Is The Goal" philosophy.

=============================================================================
LEARNING OBJECTIVES HANDLING
=============================================================================

IF LEARNING OBJECTIVES ARE PROVIDED:
- Create exactly ONE Project per objective
- Transform each objective into an action-verb quest title
- The project must EMBODY the objective's intent

IF NO LEARNING OBJECTIVES PROVIDED:
- Generate 4-6 appropriate learning objectives for the topic
- Create ONE Project per generated objective
- Each objective should cover a distinct aspect of the topic

=============================================================================
PROJECT DESIGN RULES
=============================================================================

QUEST NAMING (CRITICAL - quests appear standalone in public library):
- Start with ACTION VERBS: Create, Build, Design, Explore, Investigate, Program, etc.
- Format: "[Action Verb] [Specific, Tangible Outcome WITH CONTEXT]"
- Use imperative form: "Create a..." NOT "Creating a..."
- MUST include enough context to understand standalone (without knowing the course)
- Avoid vague titles that only make sense within a course

BAD QUEST TITLES (too vague, need course context):
- "Conceptualize Your Core Game Idea" (what kind of game?)
- "Engineer Your Game's Core Mechanics" (what game? what mechanics?)
- "Build a Playable Prototype" (prototype of what?)
- "Design Your First Project" (what project?)
- "Develop Core Skills" (what skills?)

GOOD QUEST TITLES (self-explanatory, work standalone):
- "Design a Board Game Concept from Scratch"
- "Create Balanced Mechanics for a Tabletop Game"
- "Build a Paper Prototype of Your Board Game"
- "Build Your First Personal Website"
- "Design a Logo for a Small Business"
- "Write a Short Science Fiction Story"

The quest title should tell someone browsing the quest library EXACTLY what they'll create.

DESCRIPTION STYLE (CRITICAL):
- Use imperative verbs: "Create...", "Build...", "Develop...", "Explore..."
- Do NOT use gerunds (-ing forms): "Creating...", "Building...", "Developing..."
- Write standalone descriptions (quests appear in public library)
- Never reference "this course", "this project", or parent context

BAD: "Creating a digital portfolio that showcases work." (gerund)
BAD: "In this project, you will learn photography basics." (project reference)
BAD: "Developing skills through hands-on practice." (gerund)
GOOD: "Create a digital portfolio that showcases your creative work."
GOOD: "Master the fundamentals of camera settings and composition."
GOOD: "Build a personal budget using spreadsheet tools."

PROJECT FIELDS:
- title: Action-oriented quest name
- description: Standalone description using imperative verbs
- big_idea: MUST BE IDENTICAL to description
- source_objective: The original learning objective (or AI-generated one)
- topic_primary: Main category (Creative, Science, Building, Nature, Business, Personal, Academic, Food, Games)
- topics: 2-4 specific topic tags for searching

=============================================================================
JUST-IN-TIME LESSON DESIGN
=============================================================================

For each Project, generate 3-6 lessons following just-in-time teaching principles:
- Brief, focused content (students learn by DOING, not reading)
- Provide MINIMUM info needed to start a competent attempt
- Each lesson prepares students for hands-on tasks
- 5-10 steps per lesson (text type only)

STEP FORMAT:
Each step MUST have these fields:
- "type": "text" (ONLY generate text steps)
- "title": Short descriptive title (3-6 words)
- "content": HTML content (use <p>, <ul>, <li>, <strong>, <em> tags)

TEXT STEP GUIDELINES:
- Brief written content (1-3 paragraphs per step)
- ONE main idea per step
- Keep it brief - just enough to start doing

=============================================================================
COURSE DESCRIPTION STYLE (CRITICAL)
=============================================================================

Course descriptions MUST be written from a neutral, 3rd-party perspective:
- Describe what the course covers and what topics are explored
- Never use teacher/instructor voice ("Welcome!", "I'm excited to teach...")
- Never use first-person ("I will guide you...", "I expect students to...")
- Focus on the subject matter, not the instructor's personality

BAD: "Welcome to my class! I'm so excited to teach you this semester."
GOOD: "An exploration of key concepts and practical skills in this subject area."

=============================================================================
RETURN FORMAT
=============================================================================

{
  "course": {
    "title": "Course Title",
    "description": "Brief course description in 3rd-party voice"
  },
  "generated_objectives": [
    "Objective 1 (if AI-generated)",
    "Objective 2",
    ...
  ],
  "projects": [
    {
      "title": "Action-Oriented Quest Title",
      "description": "Standalone description using imperative verbs...",
      "big_idea": "Same as description",
      "source_objective": "The learning objective this addresses",
      "topic_primary": "Academic",
      "topics": ["Reading", "Literature", "Writing"],
      "order": 0,
      "lessons": [
        {
          "title": "Lesson Title",
          "description": "What this lesson covers",
          "order": 0,
          "steps": [
            {
              "id": "step_abc123",
              "type": "text",
              "title": "Getting Started",
              "content": "<p>Brief intro content...</p>",
              "order": 0
            }
          ]
        }
      ]
    }
  ]
}

REMEMBER:
- If LOs provided: ONE project per objective (count must match EXACTLY)
- If no LOs: Generate 4-6 objectives and create one project per objective
- 3-6 lessons per project, 5-10 steps per lesson
- Keep content BRIEF - just enough to start doing
- Generate step IDs using format: step_[random 6 chars]
- ALL steps must be type "text"
- Use imperative verbs, NOT gerunds
- Align with Optio philosophy: "The Process Is The Goal"
"""


# =============================================================================
# UTILITY: Get prompt with options
# =============================================================================

def get_alignment_prompt(
    transformation_level: str = 'moderate',
    preserve_structure: bool = True
) -> str:
    """
    Get the philosophy alignment prompt with specified options.

    This is the main entry point for Stage 3 of the pipeline.

    Args:
        transformation_level: How aggressively to transform content
            - 'light': Minimal changes, fix forbidden words only
            - 'moderate': Balanced reframe with Optio elements (default)
            - 'full': Complete rewrite in Optio voice
        preserve_structure: Whether to keep original structure
            - True: Keep original modules/lessons/order (default)
            - False: Restructure for just-in-time teaching

    Returns:
        Complete prompt string ready for AI
    """
    return build_philosophy_alignment_prompt(transformation_level, preserve_structure)
