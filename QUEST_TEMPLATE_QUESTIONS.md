# Quest Template Design Questions

Please type your answers below each question to help finalize the perfect quest template for Optio.

## 1. Geographic Location Implementation

**How granular should location data be? (City level? Specific addresses? GPS coordinates?)**
YOUR ANSWER: addresses

**Should we partner with specific organizations (museums, parks, community centers)?**
YOUR ANSWER: no

**Do you want location-based discovery features (e.g., "Quests near me")?**
YOUR ANSWER: yes

**Should location-specific quests have special badges or recognition?**
YOUR ANSWER: yes, a local badge

---

## 2. Team-Up Feature Details

**Is the 2x XP for ALL tasks or only collaboration-eligible ones?**
YOUR ANSWER: all tasks

**How do students find teammates? (Friend system, skill matching, interest groups?)**
YOUR ANSWER: a friend system already exists in the application.

**Should there be team size limits? (pairs only or small groups?)**
YOUR ANSWER: limit to 5

**Do both teammates need to submit evidence separately or can they share?**
YOUR ANSWER: separately.

---

## 3. Evidence & Portfolio Considerations

**Should certain evidence types be required for diploma display vs optional?**
YOUR ANSWER: no requirements.

**Do you want quality ratings on evidence (peer review, likes, comments)?**
YOUR ANSWER: no

**Should "public" evidence have different XP rewards than "confidential"?**
YOUR ANSWER: no

**How much storage per student for media uploads?**
YOUR ANSWER: only store images. videos are required to be shared via a link. we'll store 1gb per student (not public info)

---

## 4. Quest Creation & Curation

**Who will create the hundreds of quests? (Admin only? Community contributed? AI-assisted?)**
YOUR ANSWER: admin, there's a functionality for users to propose quest already in the application, and I will develop an ai assisted method of doing this.

**Should quests have expiration dates or seasonal availability?**
YOUR ANSWER: yes, as optional fields that only appear if they are used.

**Do you want quest "paths" or "collections" (e.g., "Entrepreneur Path" = 10 related quests)?**
YOUR ANSWER: yes.

**Should completed quests unlock new ones?**
YOUR ANSWER: in some cases.

---

## 5. XP & Progression Philosophy

**The current system gives 50% bonus for completion - should this vary by difficulty?**
YOUR ANSWER: no

**Should collaboration bonus stack with completion bonus?**
YOUR ANSWER: yes

**Do you want "mastery" levels within quests (bronze/silver/gold based on evidence quality)?**
YOUR ANSWER: yes, but not bronze silver gold. suggest some potential levels we could do that could scale up quite high

**Should geographic/local quests have special XP multipliers?**
YOUR ANSWER: no

---

## 6. Task Balance & Design

**Current demo shows 4 tasks per quest - is this the sweet spot?**
YOUR ANSWER: No. The metric is quality tasks, not a number. it could be 20 tasks or 1. 

**Should every quest REQUIRE all 5 pillars or is 3 pillars minimum okay?**
YOUR ANSWER: the metric is quality, not quantity. If tasks for a particular quest just can't align with a pillar that's fine. but we should try for all 5 if it makes sense.

**Do you prefer equal XP distribution or weighted toward primary pillar?**
YOUR ANSWER: equal

**Should tasks have suggested time estimates?**
YOUR ANSWER: no

Tasks also have sub-categories within pillars (e.g., Creativity could have: Visual Arts, Music, Writing, Design, Innovation. these should be generally aligned with high school subjects or useful skills.)

---

## 7. Student Agency & Customization

**Can students propose their own tasks within existing quests?**
YOUR ANSWER: yes, and this is encouraged.

**Should there be "choose your own adventure" paths within quests?**
YOUR ANSWER: Yes i love this

**Can students remix/adapt quests for their context?**
YOUR ANSWER: yes, but it must be approved by an administrator.

**Should students be able to create public quest templates for others?**
YOUR ANSWER: no

---

## 8. Real-World Integration

**How do you envision partnerships with real organizations?**
YOUR ANSWER: we create quests inside museums, landmarks, hiking trails, etc. 

**Should quests connect to actual certifications or micro-credentials?**
YOUR ANSWER: in some cases they will.

**Do you want employer/mentor verification options for certain evidence?**
YOUR ANSWER: no, evidence is never verified by optio.

**Should location-based quests have real-world rewards (discounts, access)?**
YOUR ANSWER: not at this time.

---

## 9. The Five Pillars - Potential Refinements

### Current Pillars:
1. **Creativity** - Original creation, artistic expression, innovative solutions
2. **Critical Thinking** - Analysis, research, problem-solving, evaluation  
3. **Practical Skills** - Hands-on building, real-world application, technical execution
4. **Communication** - Sharing, teaching, presenting, connecting with others
5. **Cultural Literacy** - Understanding context, community impact, historical/cultural awareness

### Questions About the Pillars:

**Are these 5 pillars comprehensive enough for all learning? Any gaps?**
YOUR ANSWER: phyiscal activity is hard to fit into these.

**Should we rename any pillars to be more student-friendly or exciting?**
(e.g., "Cultural Literacy" → "Community Impact" or "Global Awareness"?)
YOUR ANSWER: no, the focus should be on making them core subject concepts.

**Should certain quest categories emphasize specific pillars?**
(e.g., STEM quests emphasize Critical Thinking + Practical Skills)
YOUR ANSWER: no

**Do you want sub-categories within pillars?**
(e.g., Creativity could have: Visual Arts, Music, Writing, Design, Innovation)
YOUR ANSWER: yes.

**Should the pillars have different XP caps or progression rates?**
YOUR ANSWER: no

**Alternative Pillar Structures to Consider:**

Option A - Keep current 5 pillars but add clarity:
- **Creativity & Innovation** (making new things)
- **Critical Thinking & Research** (understanding deeply)
- **Practical & Technical Skills** (building and doing)
- **Communication & Collaboration** (connecting with others)
- **Cultural & Global Awareness** (understanding context)

Option B - Expand to 6-7 pillars for more granularity:
- Add **Entrepreneurship & Leadership**
- Add **Wellness & Self-Care**
- Add **Digital Literacy**

Option C - Simplify to 3-4 core pillars:
- **Create** (Creativity + Communication)
- **Think** (Critical Thinking + Cultural Literacy)
- **Build** (Practical Skills)
- **Connect** (new - combining Communication + Cultural aspects)

**Which approach resonates most with your vision?**
YOUR ANSWER: still not sure. give more ideas.

**Should pillars be visible/prominent in the UI or more behind-the-scenes?**
YOUR ANSWER: visible.

---

## Additional Thoughts

**Any other requirements or ideas for the quest template?**
YOUR ANSWER: 

---

## Proposed Quest Template Structure

```javascript
{
  // Core Identity
  "title": "Build a Sustainable Garden",
  "tagline": "Transform any space into a thriving ecosystem",
  "category": "Life Skills",
  "difficulty_tier": 2, // 1-4 scale
  
  // Discovery & Matching
  "tags": ["sustainability", "nature", "hands-on", "community"],
  "location_type": "local_community", 
  "location_details": {
    "requirement": "Access to outdoor/indoor growing space",
    "radius_km": null,
    "specific_venues": []
  },
  
  // Requirements & Time
  "estimated_hours": "6-10 hours over 2-4 weeks",
  "prerequisites": [],
  "materials_needed": ["Basic gardening supplies"],
  
  // Tasks (4-6 optimal, covering 3-5 pillars)
  "tasks": [
    {
      "title": "Research Your Local Growing Zone",
      "description": "Discover what grows best in your climate",
      "pillar": "critical_thinking",
      "xp_value": 100,
      "evidence_prompt": "Share your research findings and plant selection",
      "collaboration_eligible": true,
      "location_required": false
    },
    {
      "title": "Design Your Garden Layout", 
      "description": "Create a visual plan for your space",
      "pillar": "creativity",
      "xp_value": 125,
      "evidence_prompt": "Upload your garden design sketches or digital plan",
      "collaboration_eligible": true,
      "location_required": false
    },
    {
      "title": "Plant and Build Your Garden",
      "description": "Get your hands dirty and bring your design to life",
      "pillar": "practical_skills", 
      "xp_value": 150,
      "evidence_prompt": "Document your planting process with photos/video",
      "collaboration_eligible": true,
      "location_required": true
    },
    {
      "title": "Create a Care Guide",
      "description": "Document care instructions for your plants",
      "pillar": "communication",
      "xp_value": 75,
      "evidence_prompt": "Share your guide that others could follow",
      "collaboration_eligible": false,
      "location_required": false
    },
    {
      "title": "Connect to Food Systems",
      "description": "Research how gardens impact communities",
      "pillar": "cultural_literacy",
      "xp_value": 100,
      "evidence_prompt": "Explain your garden's role in sustainability",
      "collaboration_eligible": true,
      "location_required": false
    }
  ],
  
  // Collaboration Features
  "team_size_limit": 3,
  "collaboration_bonus_multiplier": 2.0,
  "collaboration_prompts": [
    "Partner with someone who has different gardening experience",
    "Work with family members to create a shared garden"
  ],
  
  // Metadata
  "total_xp": 550,
  "completion_bonus_xp": 275, // 50% bonus
  "is_seasonal": false,
  "is_featured": false,
  "created_by": "admin",
  "is_active": true
}
```

**What adjustments would you make to this template structure?**
YOUR ANSWER: implement the changes I suggested in my answers.