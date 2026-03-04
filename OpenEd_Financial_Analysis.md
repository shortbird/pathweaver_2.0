# OpenEd Academy Partnership - Financial Analysis

**Date**: March 3, 2026
**Prospect**: OpenEd Academy
**Deal Type**: B2B Organization (Homeschool Diploma Tracking)

---

## What OpenEd Needs

| Requirement | Optio Capability | Build Status |
|---|---|---|
| Parent account provisioning via marketplace tile | Organization signup flow | Exists |
| Admin accounts (oversight, no interaction) | Observer/org_admin roles | Exists |
| 3 diploma pathways displayed | Course architecture (Course > Projects > Tasks) | In active development |
| Minimal progress uploading | Task completion + credit approval workflow | In development |
| Level 1 tech support | Email support, 48hr SLA | Needs staffing/scoping |
| Parent-managed task tracking toward annual metrics | Parent role managing dependent tasks | Exists |
| Transcripts on request | Transcript generation from completed credits | Needs building |
| Diploma awarded at completion | Completion logic + certificate generation | Needs building |

---

## COGS Breakdown

### Fixed Infrastructure (Monthly, Already Paid)

| Service | Monthly Cost | Notes |
|---|---|---|
| Supabase (Pro) | ~$25 | Shared across all users |
| Render (4 services) | ~$28-56 | 2 environments x 2 services |
| Gemini API | Usage-based | ~$0.01-0.05 per API call |
| Domain/misc | ~$5-10 | |
| **Total** | **~$60-90** | Exists regardless of OpenEd deal |

These are not true incremental COGS but should be factored into marginal load calculations.

### Incremental Per-Student Costs

| Cost Item | Per Student/Year | Reasoning |
|---|---|---|
| Infrastructure marginal load | $0.25-1.00 | DB rows, API calls, storage. "Minimal" usage = low end |
| Gemini AI usage | $0.50-2.00 | Depends on AI tutoring usage. Minimal scope suggests low |
| Support (Level 1) | $2.00-8.00 | Biggest variable. Even 1 ticket/student/year at $5-8 fully loaded |
| Transcript generation | $0.50-1.00 | Per-request, likely 1-2x/year per student |
| **Total COGS** | **$3-12/year** | Heavily dependent on support volume |

### One-Time Development Costs

| Item | Hours (Est.) | Notes |
|---|---|---|
| OpenEd marketplace integration | 10-20h | Simple link vs OAuth changes scope significantly |
| 3 diploma pathway configuration | 8-15h | Template setup, credit requirements, validation logic |
| Transcript generation feature | 15-25h | PDF generation, data aggregation, formatting |
| Diploma completion/issuance | 8-12h | Completion logic + certificate generation |
| Testing and QA | 10-15h | End-to-end testing across all flows |
| **Total** | **50-90h** | |

At $75-100/hr equivalent, development cost = $3,750-9,000.

---

## Pricing Model: Setup Fee + Annual Per-Student

### Recommended Structure

- **Platform Setup and Configuration**: $2,500 one-time
  - Marketplace integration
  - 3 diploma pathway templates
  - Transcript template setup
  - Admin account configuration
  - Team onboarding/training

- **Per Student/Year**: **$15/student/year** (recommended)
  - Alma SIS charges $10-16/student/year — our closest comp
  - Sycamore Education charges ~$15.60/student/year
  - My School Year Community Edition charges $24/student/year
  - $10/student/year undercuts market for transcript + diploma capability
  - $15 sits at the competitive midpoint while reflecting the value of bundled credentialing
  - ESA-funded orgs absorb this easily against $7,000-8,000 state scholarships

- **Annual Minimum**: $1,500-2,000/year floor
  - Protects against supporting a tiny cohort at a loss

- **Tech Support**: Included (email, 48hr response SLA)

### Margin Scenarios (Per-Student Fee Only, Excluding Setup)

| Students | At $10/yr | At $15/yr | At $20/yr |
|---|---|---|---|
| 50 | $500 rev / ~$250 margin | $750 / ~$500 | $1,000 / ~$750 |
| 100 | $1,000 / ~$500 | $1,500 / ~$1,000 | $2,000 / ~$1,500 |
| 250 | $2,500 / ~$1,250 | $3,750 / ~$2,500 | $5,000 / ~$3,750 |
| 500 | $5,000 / ~$2,500 | $7,500 / ~$5,000 | $10,000 / ~$7,500 |

*Margin assumes ~$5/student COGS at low-to-moderate support volume.*

### Setup Fee ROI

The $2,500 setup fee covers roughly 50-65% of estimated development costs (50-90 hours). The remainder is recovered through per-student recurring revenue over 12-18 months at moderate volume (100+ students).

---

## Open Questions (Pending Client Response)

1. **Student volume**: Initial cohort size and 2-3 year growth projection
2. **Marketplace integration complexity**: Simple link vs embedded SSO
3. **Progress documentation scope**: How minimal is "minimal"?
4. **Transcript workflow**: Parent self-serve vs staff-requested
5. **Diploma issuance**: Optio tracks completion only, or generates diploma document?
6. **Admin oversight depth**: View-only dashboards vs credit approval workflow
7. **Timeline**: Target launch date

---

## Competitive Analysis

### Tier 1: Homeschool Transcript/Diploma Platforms (B2C)

| Platform | Pricing | Setup Fee | Target |
|---|---|---|---|
| Scholaric | $3-7/mo per family | $0 | Individual families |
| Homeschool Tracker | $65/yr (up to 20 students) | $0 | Families / small co-ops |
| Homeschool Manager | $49/yr | $0 | Families |
| My School Year | $2/student/mo (Community Ed.) | $0 | Co-ops / umbrella schools |
| Homeschool Reporting Online | $10-20/yr per family | $0 | Families via affiliate schools |

**Takeaway**: B2C tier is a race to the bottom ($30-60/yr). Zero setup fees across the board. These are not direct competitors -- they lack organizational admin oversight, credit approval workflows, and formal diploma issuance.

### Tier 2: Student Information Systems (B2B)

| Platform | Pricing | Setup Fee | Target |
|---|---|---|---|
| Alma SIS | ~$10-16/student/yr (~$4,000 min) | Custom (significant) | Formal schools |
| Sycamore Education | $1.30/user/mo (~$15.60/yr) | $0 (included) | Mid-market schools |
| Bridgeway Academy | $975-3,580/yr | Varies | Families / orgs wanting accreditation |

**Takeaway**: This is our competitive tier. Alma is the premium benchmark at $10-16/student with significant setup fees. Sycamore undercuts on setup by including implementation. Bridgeway shows that accreditation/credentialing commands a massive premium ($975/yr just for records).

### Tier 3: Micro-School SaaS

| Platform | Pricing | Setup Fee | Target |
|---|---|---|---|
| Prenda | $2,199/student/yr (ESA) or $219.90/mo | $0 | ESA-funded micro-schools |
| Schoolhouse.world | Free | $0 | Donor-subsidized |

**Takeaway**: ESA-funded orgs have dramatically lower price sensitivity. Prenda charges $2,199/student because state scholarship funds absorb the cost. If OpenEd's families use ESA funds, our $15/student/yr is negligible.

### Tier 4: LMS Platforms

| Platform | Pricing | Setup Fee | Target |
|---|---|---|---|
| Canvas (Instructure) | ~$25/user/yr (enterprise) | Custom (significant) | Institutional |
| Thinkific | $49-199/mo flat | $0 | Creator economy / small orgs |
| Teachable | $39-299/mo flat | $0 | Creator economy / small orgs |

**Takeaway**: Not direct competitors. Included for context -- LMS platforms charge more but deliver content, not administrative/credentialing infrastructure.

### Tier 5: Transcript/Credentialing Services

| Platform | Pricing | Setup Fee | Target |
|---|---|---|---|
| Parchment | Free to send; $5-10/transcript to student | $0 | Students (transactional) |
| National Student Clearinghouse | Free to send; ~$7.90/transcript | $0 | Students (transactional) |
| Transcript Maker | $59/yr | $0 | Families / small orgs |

**Takeaway**: Parchment/NSC charge $5-10 per document at point of request. A family requesting 3-4 transcripts pays $20-40 in fees. Our bundled model (unlimited transcripts within per-student pricing) is a clear value advantage.

### Umbrella School Economics

- Annual enrollment fees: $30-100/student (family caps at $195-225)
- Graduation/diploma fees: $50-125 additional
- Admin document fees: $10-15 per request (DMV forms, extra transcripts)
- Average family education spend: ~$600/yr total, with ~75% going to curriculum
- Software budget is extremely thin at the family level -- but the *organization* paying for backend tools is the buyer here

### Setup Fee Risk Assessment

The $2,500 setup fee is an outlier in this market. Every competitor in Tiers 1-3 advertises $0 setup fees. However, the fee is justifiable if positioned as white-glove implementation covering:

- Historical data migration (competitors don't offer this)
- 3 custom diploma pathway configurations
- Transcript template design and validation
- Admin account setup and team training
- Marketplace integration engineering

**Mitigation options if the fee creates deal friction:**
1. Amortize into per-student pricing (add ~$2-3/student/yr over 3 years)
2. Waive for commitments above a student volume threshold (e.g., 200+ students)
3. Offer a phased payment (50% upfront, 50% at go-live)

### Industry Metrics

- **EdTech monthly churn**: 9.6% average (115% annualized) -- highest in B2B SaaS
- **Valuation multiples**: Compressed from 20.9x revenue (2024) to 11.5x (2025)
- **Market shift**: Product-Led Growth (PLG) and self-serve onboarding outperform traditional enterprise sales in this decentralized market
- **Critical integrations**: Clever, ClassLink, and Google Workspace SSO are baseline expectations at enterprise pricing tiers

---

## Next Steps

1. Send discovery email (done) -- get volume and schedule call
2. ~~Complete competitive analysis via Gemini Deep Research~~ (done)
3. Finalize per-student price point based on volume -- **$15/student/yr recommended, flex to $12-20 based on volume commitment**
4. Decide setup fee strategy: flat $2,500, amortized, or volume-waived
5. Prepare formal quote/proposal after discovery call
