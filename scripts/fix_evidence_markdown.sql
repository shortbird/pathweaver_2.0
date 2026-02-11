-- Fix evidence blocks to remove markdown formatting
-- Run this in Supabase SQL Editor

-- Update Jordan's blocks
UPDATE evidence_document_blocks SET content = jsonb_build_object('text',
'I reviewed all three articles my supervisor provided:

Article 1: The Time Management Matrix by Stephen Covey
Main topic: Prioritizing tasks by urgency vs importance
Author: Best-selling author of 7 Habits of Highly Effective People
First impression: Well-structured framework, corporate-focused

Article 2: Stress in the Modern Workplace by HBR
Main topic: Understanding and managing workplace stress
First impression: Data-driven but dense

Article 3: Simple Techniques for Busy Professionals by Forbes
Main topic: Quick stress-relief tips
First impression: Accessible but superficial

I chose Article 1 for deeper analysis because it offers a practical framework.')
WHERE id = 'c0000001-0001-4000-8000-000000000001';

UPDATE evidence_document_blocks SET content = jsonb_build_object('text',
'Annotation of The Time Management Matrix

Key Claims:
1. Most people spend too much time on urgent but unimportant tasks
2. Quadrant II (important but not urgent) is where effectiveness lives
3. Saying no to the unimportant is saying yes to the important

Supporting Evidence:
- Fortune 500 case study showing 40% productivity increase
- Survey data: 60% feel constantly busy but unproductive
- Research on decision fatigue

Rhetorical Strategies:
- Relatable scenarios like email overload and meetings
- Statistics about burnout
- Clear visual framework')
WHERE id = 'c0000001-0002-4000-8000-000000000001';

UPDATE evidence_document_blocks SET content = jsonb_build_object('text',
'Critical Reading Analysis

1. Purpose and Audience
Purpose: Convince professionals to prioritize proactively
Audience: Mid-level to senior corporate professionals

2. Tone and Style
Prescriptive but accessible. Authoritative without jargon.

3. Evidence Quality
Strengths: Research citations, case studies, survey data
Weaknesses: Only corporate examples, no academic citations

4. Logical Structure
- Problem (busyness without productivity)
- Framework (4 quadrants)
- Implementation steps
- Success stories

5. Biases and Limitations
- Corporate bias in examples
- Assumes schedule control
- Survivorship bias in case studies')
WHERE id = 'c0000001-0003-4000-8000-000000000001';

UPDATE evidence_document_blocks SET content = jsonb_build_object('text',
'Recommendation: Should We Share This Article?

My recommendation: Yes, with modifications

The Time Management Matrix framework is immediately applicable to our distribution center. Our team juggles phone calls, computer work, and customer issues making the Quadrant II concept highly relevant.

Why share it:
- Practical framework for categorizing tasks
- Visual matrix is easy to remember
- Addresses feeling of being overwhelmed

Caveats to include:
Not all advice applies to hourly roles. Our team cannot simply decline meetings, but they can identify which tasks are truly urgent vs can wait until after peak times.')
WHERE id = 'c0000001-0004-4000-8000-000000000001';

UPDATE evidence_document_blocks SET content = jsonb_build_object('text',
'MLA Citation

Works Cited Entry:

Covey, Stephen R. "The Time Management Matrix: Putting First Things First." Franklin Covey, 15 Mar. 2023, www.franklincovey.com/habit-3/. Accessed 6 Feb. 2026.

Elements Verified:
- Author name (Last, First M.)
- Article title in quotation marks
- Publication name in italics
- Publication date
- URL
- Access date

Formatting verified against Purdue OWL MLA 9th edition.')
WHERE id = 'c0000001-0005-4000-8000-000000000001';

-- Update Alex's blocks
UPDATE evidence_document_blocks SET content = jsonb_build_object('text',
'TechCrunch vs WSJ: Same OpenAI Story, Different Framing

TechCrunch Coverage:
Headline: "OpenAI Raises Historic $6.6B Round, Valued at $157B"
Framing: Celebration of startup success
Emphasized: Sam Altman vision, product capabilities
Omitted: Governance concerns, board drama
Tone: Excited, insider-y, bullish on AI

Wall Street Journal Coverage:
Headline: "OpenAI Valuation Soars Amid Questions About Profitability"
Framing: Financial analysis, investor skepticism
Emphasized: Burn rate, competition, regulatory risks
Omitted: Technical breakthroughs, developer enthusiasm
Tone: Cautious, analytical, ROI-focused

Analysis:
TechCrunch serves founders and VCs who want the AI narrative. WSJ serves institutional investors who need risk assessment. Neither is wrong but both are incomplete. Critical reading means triangulating truth from multiple sources.')
WHERE id = 'c0000002-0001-4000-8000-000000000001';

UPDATE evidence_document_blocks SET content = jsonb_build_object('text',
'Critical Analysis: Naval Ravikant Wealth Thread

Key Claims:
1. Seek wealth, not money or status
2. You wont get rich renting out your time
3. Learn to sell and build equals unstoppable
4. Code and media are permissionless leverage

Evidence Provided: Almost none. Relies on personal authority, aphorisms, anecdotes.

Persuasion Techniques:
- Short memorable phrases that feel wise
- False dichotomies (wealth vs status)
- Aspirational identity signaling
- Vague actionability

Does It Work? Partially. Directionally correct but ignores privilege, underplays luck, and permissionless leverage still requires capital.

Verdict: Useful as inspiration, dangerous as a playbook. More philosophy than strategy.')
WHERE id = 'c0000002-0002-4000-8000-000000000001';

UPDATE evidence_document_blocks SET content = jsonb_build_object('text',
'Sara Blakely on How I Built This

The Polished Narrative:
- Cutting feet off pantyhose became a billion-dollar idea
- $5,000 savings, no outside funding
- "I just believed in myself"

What Questions Revealed:
- Had stable sales job while building Spanx (safety net)
- Father encouraged weekly failure discussions
- Cold-called Neiman Marcus successfully (sales skills plus luck)

What Was Obscured:
- First 2 years of actual financial struggle?
- How many manufacturer rejections?
- Role of appearance in getting meetings?

Narrative Control:
Emphasizes: Grit, scrappiness, underdog positioning
Downplays: Sales expertise, supportive family, timing

Takeaway: Founder interviews are marketing, not journalism. The narrative is curated to inspire, not inform.')
WHERE id = 'c0000002-0003-4000-8000-000000000001';

UPDATE evidence_document_blocks SET content = jsonb_build_object('text',
'Bias in A16Z State of Crypto Report

Who Made This?
Andreessen Horowitz has $7.6 billion in crypto. Enormous incentive for positive narratives.

Claims Made:
1. Crypto usage at all-time highs
2. Developer activity signals health
3. Building phase, not speculating
4. Regulatory clarity coming

Data Selected:
- Active addresses (up 20%)
- GitHub commits
- Stablecoin volume
- New dApps launched

Data Omitted:
- Token prices (down 60-80%)
- Exchange volumes (down from 2021)
- VC funding levels (down)
- FTX and Terraform failures
- Enforcement actions

Rhetorical Strategies:
- "Building through the bear" reframes decline as virtue
- "Its 1997!" implies inevitable success
- Selective metrics that look good

Conclusion: Advocacy dressed as analysis. Always ask: Who paid for this? What do they gain?')
WHERE id = 'c0000002-0004-4000-8000-000000000001';

UPDATE evidence_document_blocks SET content = jsonb_build_object('text',
'Zero to One, Chapter 3: All Happy Companies Are Different

Thiels Thesis:
"Competition is for losers." Successful companies escape competition by becoming monopolies.

Evidence Assessment:

Strong Evidence:
- Economics correct (perfect competition equals zero profit)
- Google vs airline margins (verifiable)
- Historical examples (Standard Oil, AT&T)

Weak Evidence:
- Cherry-picked examples
- Fuzzy monopoly definition
- Survivorship bias
- Ignores negative externalities

Rhetorical Strategies:
- Contrarian framing
- Status signaling (elite name-drops)
- Oversimplification
- Provocative language ("losers")

Counterarguments Ignored:
- Monopolies harm consumers
- Competition spurs innovation (Intel/AMD)
- Not always achievable
- Social costs of winner-take-all

Verdict: Differentiation over competition is smart. But "monopoly is good" ignores who gets hurt.')
WHERE id = 'c0000002-0005-4000-8000-000000000001';

-- Verify updates
SELECT 'Updated' as status, COUNT(*) as blocks_updated
FROM evidence_document_blocks
WHERE id::text LIKE 'c0000001%' OR id::text LIKE 'c0000002%';
