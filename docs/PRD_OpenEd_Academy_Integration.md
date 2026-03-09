# Product Requirements Document: OpenEd Academy Diploma Plan Integration

**Version:** 1.0 (Draft for OEA Approval)
**Date:** March 9, 2026
**Author:** Optio
**Status:** Pending OEA Review

---

## 1. Executive Summary

This document outlines the proposed integration between Optio and OpenEd Academy (OEA) to support the OEA Diploma Plan Program. Parents will enroll through the OpenEd marketplace, select one of three diploma pathways, and use Optio to track credit progress, upload portfolio evidence, and ultimately earn an OEA diploma upon completion of all pathway requirements.

Optio serves as the credit-tracking, learning log, and portfolio layer for diploma completion.

---

## 2. Goals

1. **Seamless enrollment** -- Parents click through from the OpenEd marketplace tile and land on an OEA-branded Optio signup flow
2. **Diploma pathway selection** -- Parents choose from three structured pathways that define their credit requirements
3. **Lightweight progress tracking** -- Learning logs in Optio as primary progress documentation
4. **Portfolio-integrated learning logs** -- Logs completed in Optio become portfolio entries automatically
5. **Oversight without friction** -- OEA staff have read-only admin visibility into enrolled families
6. **Transcript and diploma delivery** -- Academic transcripts available on request; OEA diploma awarded upon pathway completion

---

## 3. User Roles

| Role | Description | Optio Mapping |
|------|-------------|---------------|
| **OEA Parent** | Enrolls family, selects pathway, manages credit progress, uploads evidence | `parent` (platform user) with OEA program flag |
| **OEA Student** | Dependent managed by parent; earns credits toward diploma | `student` (dependent, managed by parent) |
| **OEA Staff (Oversight)** | OpenEd employees who monitor enrollment and progress but do not interact with families directly | `observer` with elevated read-only dashboard |
| **Optio Support** | Handles Level 1 tech support (platform errors, account issues) | Existing support role |

---

## 4. Feature Requirements

### 4.1 Account Provisioning via Marketplace

**Description:** Parents arriving from the OpenEd marketplace tile are directed to an Optio signup page that automatically associates their account with the OEA Diploma Plan Program.

**Mechanism:**
- The marketplace tile links to Optio's signup URL with a partner key parameter (e.g., `https://www.optioeducation.com/signup?partner=opened-academy`)
- The signup page detects the partner key and:
  - Displays OEA-specific branding/welcome messaging
  - Tags the new account as an OEA Diploma Plan participant
  - Skips or simplifies any steps not relevant to OEA families
- After account creation, the parent is guided into the diploma pathway selection flow (Section 4.2)

**No SSO required.** Parents create a standard Optio account. The partner key simply ensures the account is flagged for the OEA program.

**What the parent sees:**
1. Clicks "Optio" tile on OpenEd marketplace
2. Lands on Optio signup page with OEA context messaging
3. Creates account (email, password, family info)
4. Immediately enters pathway selection (Section 4.2)

---

### 4.2 Diploma Plan Pathway Selection

**Description:** After signup, parents select one of three diploma pathways. The chosen pathway defines the credit framework their student(s) will work toward.

#### Pathway 1: Open and Balanced
*12 Foundation Credits + 12 Elective Credits = 24 Total*

| Category | Subject | Credits |
|----------|---------|---------|
| Foundation | Math | 3 |
| Foundation | Language Arts | 3 |
| Foundation | Science | 3 |
| Foundation | Social Studies | 3 |
| Elective | Student Choice | 12 |

**Character:** Maximum flexibility. Students choose all 12 electives freely.

#### Pathway 2: Traditionally Aligned
*13 Foundation Credits + 11 Elective Credits = 24 Total*

| Category | Subject | Credits |
|----------|---------|---------|
| Foundation | Language Arts | 4 |
| Foundation | Math | 3 |
| Foundation | Science | 3 |
| Foundation | Social Studies | 3 |
| Elective | The Arts | 2 |
| Elective | Health & PE | 2 |
| Elective | CTE | 1 |
| Elective | Financial Literacy | 1 |
| Elective | Student Choice | 5 |

**Character:** Mirrors a conventional high school structure with recommended elective categories.

#### Pathway 3: College Bound
*19 Foundation Credits + 5 Elective Credits = 24 Total*

| Category | Subject | Credits |
|----------|---------|---------|
| Foundation | Language Arts | 4 |
| Foundation | Math | 4 |
| Foundation | Science | 3 |
| Foundation | Social Studies | 3 |
| Foundation | World Language | 2 |
| Foundation | Student Choice | 3 |
| Elective | Student Choice | 5 |

**Character:** Heaviest foundation load aligned with college admissions expectations. OEA recommends aligning course selection with the colleges and universities the student is interested in attending.

#### Pathway Selection UX
- Presented as a clear comparison view (card layout or side-by-side)
- Each pathway shows total credits, foundation vs. elective split, and a short description of who it's best for
- Parent selects pathway for each student individually (siblings may choose different pathways)
- Pathway can be changed later with OEA staff approval

---

### 4.3 OEA Staff Oversight Accounts

**Description:** Designated OpenEd staff receive observer-level accounts that provide read-only visibility into all OEA-enrolled families.

**Capabilities:**
- View list of all enrolled OEA families and their chosen pathways
- View credit progress for any OEA student
- View uploaded portfolio evidence
- View transcript data
- Cannot modify student data, approve tasks, or interact with families directly

**Provisioning:** Optio creates these accounts upon OEA request. Staff accounts are flagged as OEA oversight and automatically linked to all OEA-enrolled students.

**Dashboard:** A dedicated OEA oversight view showing:
- Enrollment summary (total families, pathway distribution)
- Progress overview (students by completion percentage)
- Ability to drill into individual student progress

---

### 4.4 Progress Tracking

**Description:** Parents track their student's credit progress in Optio through learning logs (Section 4.5) and evidence uploads.

**Evidence Uploads:**
- Acceptable formats: documents, images, videos, links, text entries
- Each upload is associated with a specific credit/subject area

**What Counts as Progress:**
- Learning logs completed in Optio (see Section 4.5)
- Work samples, project documentation, test results
- External course completions or certificates
- Any evidence that demonstrates credit-level learning

**Credit Approval:**
- **Parent self-attestation** -- Parents mark credits as complete based on their student's work
- OEA staff can review progress via their oversight dashboard but do not approve individual credits
- This keeps the workflow lightweight and consistent with the homeschool model where parents are the primary educators

---

### 4.5 Learning Logs in Optio

**Description:** Parents complete learning logs directly within Optio. These logs serve as progress documentation for the OEA Diploma Plan and are automatically included in the student's portfolio.

**Learning Log Features:**
- Parents submit learning logs per student, tagged to credit/subject areas
- Logs are stored as portfolio entries and contribute to credit progress tracking

> **OPEN QUESTION FOR OEA:** What fields/information should each learning log entry capture? For example: date range, subject area, activities completed, hours spent, evidence/attachments, parent notes, etc. Please specify what OEA requires so we can build the log form to match your documentation standards.

**Portfolio Display:**
Learning logs appear in the student portfolio as entries showing:
- Fields as specified by OEA (see question above)
- Automatically tagged as part of the OEA Diploma Plan

---

### 4.6 Parent Credit Management Dashboard

**Description:** Parents see a dedicated dashboard view for managing their student's progress toward the selected diploma pathway.

**Dashboard Elements:**
- **Pathway overview** -- Visual progress bar showing credits earned vs. required (e.g., "8 of 24 credits completed")
- **Credit breakdown by category** -- Foundation vs. elective progress, broken down by subject area
- **Subject detail view** -- For each subject (e.g., "Math -- 2 of 3 credits"), view associated tasks, evidence, and completion status
- **Progress log** -- Timeline view of uploads and learning log entries
- **Annual metrics** -- Year-over-year progress toward diploma completion

**Task Management:**
- Parents create tasks representing credit-earning activities
- Tasks are tagged to a subject/credit area
- Completing tasks contributes XP toward credit thresholds
- When a credit's XP threshold is met, the credit is marked as earned

---

### 4.7 Transcripts

**Description:** Academic transcripts generated from Optio are available upon request.

**Transcript Contents:**
- Student name and identifying information
- Selected diploma pathway
- Credits earned by subject area with completion dates
- Credits in progress
- GPA equivalent (if applicable -- TBD with OEA)
- OEA program affiliation noted on transcript

**Availability:**
- Parents can generate and download transcripts from their dashboard at any time
- OEA staff can generate transcripts for any enrolled student via oversight dashboard
- Format options: PDF (printable), HTML (web view)

> **OPEN QUESTION FOR OEA:** Should transcripts include a GPA or grade equivalent? If so, what grading standard should be used? Or is credit/no-credit sufficient for the OEA diploma program?

---

### 4.8 OEA Diploma Completion

**Description:** When a student completes all credit requirements for their chosen pathway, they are eligible for the OEA diploma.

**Completion Criteria:**
- All 24 credits earned (per pathway-specific requirements)
- All foundation credit requirements met
- All elective credit requirements met (including any pathway-specific categories)

**Completion Flow:**
1. System detects all pathway credits are fulfilled
2. Student's status changes to "Diploma Requirements Met"
3. OEA staff are notified via oversight dashboard
4. OEA performs final review/verification
5. OEA awards diploma (OEA's process, outside Optio)
6. Optio records diploma as issued and updates student portfolio

**Diploma Record in Optio:**
- Diploma status displayed on student profile and portfolio
- Issued date, pathway completed, and OEA affiliation recorded
- Public portfolio (if enabled) reflects diploma achievement

> **NOTE:** The diploma itself is awarded by OEA, not Optio. Optio's role is tracking progress toward completion and recording the diploma once OEA confirms it has been awarded.

---

### 4.9 Level 1 Tech Support

**Description:** Optio provides Level 1 technical support for OEA families using the platform.

**Scope:**
- Account access issues (password resets, login problems)
- Platform errors ("I get an error when I try to XYZ")
- Navigation help ("How do I upload evidence?")
- Bug reports and resolution

**Out of Scope (handled by OEA):**
- Diploma pathway guidance ("Which pathway should I choose?")
- Curriculum questions ("Does this count as a Science credit?")
- OpenEd platform issues
- Enrollment/billing for the OEA program

**Support Channel:** Email support at **support@optioeducation.com**. OEA families contact Optio directly for platform issues.

---

## 5. Open Questions for OEA

| # | Question | Impact |
|---|----------|--------|
| 1 | **Learning log fields** -- What information should each learning log entry capture? (e.g., date range, subject, activities, hours, evidence, notes) | Learning log form design |
| 2 | **Grading standard** -- Credit/no-credit or letter grades/GPA on transcripts? | Transcript design |
| 3 | **Pathway changes** -- Can families switch pathways? If so, what's the approval process? | Policy + workflow |
| 4 | **Multi-student families** -- Can siblings be on different pathways? | Dashboard design |
| 5 | **Annual metrics** -- What specific annual milestones does OEA expect (e.g., minimum credits per year)? | Progress tracking rules |
| 6 | **Timeline** -- Target launch date for the program? | Development planning |
| 7 | **Volume** -- Estimated number of families at launch and Year 1? | Infrastructure planning |

---

## 6. Assumptions

1. All OEA diploma students are minors managed by a parent account (COPPA/FERPA compliant)
2. Each student is on exactly one diploma pathway at a time
3. All three pathways require 24 total credits
4. One credit = one full course equivalent (scope TBD with OEA)
5. The OEA program operates as a partnership, not an Optio organization -- OEA families are platform users with a program tag, not org-managed users
6. Optio handles the platform; OEA handles the diploma certification

---
Next Steps

1. OEA reviews this PRD and answers open questions
2. Agree on grading standard and transcript format
3. Confirm support routing and annual metrics expectations
4. Optio produces technical implementation plan and timeline estimate
5. Development begins
