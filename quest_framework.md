The Unified Quest Framework
Core Philosophy: The Process is the Goal
Every quest designed for this platform must be built on a single, core tenet: the process and goal of education are one and the same. A quest is not a task to be checked off to impress a future employer or college; it is an experience to be undertaken for its own sake.

Our goal is to move beyond the "prove you did it" model of traditional education. Instead, we aim to inspire students to do, create, and reflect. This framework uses visual cues and a layered design to make quests feel more like an adventure and less like an assignment.

All quests must follow this framework.

The Foundation: The Five Diploma Pillars
Every quest is grounded in one of the five pillars. Each pillar has a unique icon and color that will be used consistently across the platform to provide immediate visual context.

Pillar

Icon

Color

Description

Creativity

🎨

#FFCA3A (Gold)

Generating new ideas and bringing them to life.

Critical Thinking

🧠

#8B5CF6 (Purple)

Analyzing information and making reasoned judgments.

Practical Skills

🛠️

#F97316 (Orange)

Hands-on, real-world abilities for life and work.

Communication

💬

#3B82F6 (Blue)

Sharing and receiving information effectively.

Cultural Literacy

🌍

#10B981 (Green)

Understanding the context of the world.

The Anatomy of a Visual Quest
Each quest is presented as a series of collapsible, icon-driven sections. This allows students to get the big picture at a glance and dive into the details as they're ready.

1. The Quest Header (Always Visible)
This is the quest's "cover." It's visually engaging and provides the most critical information instantly.

quest_banner_image (URL, Optional): A visually appealing, abstract image or pattern related to the quest's theme. This can be AI-generated to be scalable.

primary_pillar_icon (Enum): The icon for the quest's main pillar is prominently displayed.

title (Text): The compelling, action-oriented title.

Good: "Launch a Podcast Mini-Series"

Bad: "Learn About Podcasting"

big_idea (Text): The single, powerful sentence explaining the quest's purpose.

Example: "Share your voice and ideas with the world by creating and publishing a three-episode podcast on a topic you love."

Key Info Bar: A clean, icon-driven summary of key stats.

⏱️ estimated_time: "10-15 hours"

✨ total_xp: "350 XP"

👥 collaboration: "2x XP Bonus"

2. The Core Sections (Collapsible)
These sections are collapsed by default, with clear, icon-driven headers. Clicking on a header expands the section.

▶ 🎯 The Mission
Expands to show the core outcomes and the suggested path.

what_youll_create (Array of Text): 2-4 tangible, exciting outcomes.

Example: ["A three-episode podcast series, live online", "Custom cover art and a show description"]

your_mission (Array of Text): The suggested, step-by-step guide focused on the creative process.

Example: ["1. Plan Your Series: Choose a topic and outline three episodes.", "2. Record & Produce: Record your audio and learn basic editing.", "3. Design & Publish: Create cover art and upload your episodes."]

showcase_your_journey (Text): The prompt that reframes "evidence" as a celebration of the work and the process.

Example: "Share a link to your live podcast series. In your submission, include a key quote from your interview and a short reflection on the most surprising thing you learned."

▶ 🛠️ Your Toolkit
Expands to show the resources and practical details for the journey.

core_competencies (Array of Text): The specific skills the student will practice, presented as tags. These must align with the primary_pillar.

Example: ["reading_writing_speaking", "digital_media_production", "learning_and_reflection"]

helpful_resources (Array of Objects): A simple, curated list of 1-3 high-quality starting points with icons for type (Tool, Tutorial, Inspiration).

Example: [{"type": "Tool", "name": "Audacity (Free)", "url": "..."}, {"type": "Inspiration", "name": "The Daily Podcast", "url": "..."}]

heads_up (Text, Conditional): For necessary warnings or important context. Appears only if needed.

Example: "This quest involves using power tools, so make sure you have adult guidance."

location (Text, Conditional): For quests tied to a specific place. Appears only if needed.

Example: "This quest is designed to be completed at the Natural History Museum of Utah."

▶ 📓 Learning Log
Expands to show the feature for documenting the process.

Log Entry Form: A simple text area for adding notes, photos, or videos.

log_bonus (Object, Optional): A visually distinct callout for the bonus, encouraging reflection.

Example: {"prompt": "✨ Process Bonus (+25 XP): Add 3 log entries to document your journey!"}

▶ ✨ Go Further
Expands to show optional challenges for deeper engagement.

real_world_bonus (Array of Objects, Optional): Each bonus is presented as a mini-challenge card that incentivizes interaction outside the platform.

collaboration_spark (Text, Creator+ Feature): A visually distinct section encouraging teamwork.