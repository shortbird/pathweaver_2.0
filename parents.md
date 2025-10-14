# Parent Role and Dashboard Implementation Plan

## 1. Feature Overview

This document outlines the implementation plan for the "Parent Role" feature. The goal is to increase parental engagement by providing parents with a dedicated dashboard to view their student's progress, learning rhythm, and key activities within the platform. This feature will be read-only to start, focusing on visibility and support.

## 2. Core Components

### 2.1. Onboarding and Account Linking

The connection between a parent and student must be secure and mutually approved.

**User Flow:**
1.  A student navigates to their "Settings" page and finds a new "Family" section.
2.  The student enters their parent's email address and clicks "Send Invitation."
3.  **Backend:**
    *   A new entry is created in a `parent_invitations` table with a unique, single-use token and an `expires_at` timestamp.
    *   An email is sent to the parent's address containing a link with the unique token (e.g., `https://app.optio.com/register/parent?token=...`).
4.  The parent clicks the link and is taken to a dedicated "Parent Signup" page, where they create their account.
5.  Upon successful account creation, the link between the parent and student is set to a `pending_approval` status.
6.  The student sees the pending connection in their "Family" settings and must click a final "Approve" button.
7.  Once approved, the link becomes `active`, and the parent gains access to their dashboard for that student.

### 2.2. The Parent Dashboard

The parent dashboard is the central hub for all parent-facing information.

**Widgets & Information:**

*   **Learning Rhythm Indicator:** A prominent visual indicator showing the student's current state.
    *   **Green / "Flow State":** Displayed when the student has **no overdue tasks/quests** AND has **made progress in the last 7 calendar days**.
        *   "Progress" is defined as: completing a task, submitting evidence for a quest, or starting a new quest.
    *   **Yellow / "Needs Support":** Displayed if either of the "Flow State" conditions is not met.

*   **Dynamic Content Box:** The content of this box changes based on the Learning Rhythm.
    *   **On "Flow State":** Displays a **"Weekly Wins"** summary, listing accomplishments from the past 7 days (e.g., "Badge Earned: Python Novice," "Quest Completed: The Hero's Journey").
    *   **On "Needs Support":** Displays gentle, **actionable suggestions** for the parent. Examples:
        *   *"It looks like Michael might be stuck. A good conversation starter could be: 'I'd love to see the project you're working on!'"*
        *   *"Sarah has an item that is overdue. It might be a good time to check in and see if she needs help planning her time."*

*   **Read-Only Student Data:**
    *   **Active Quests & Tasks:** A list of all current and overdue items.
    *   **Badges:** A gallery of all badges the student has earned.
    *   **Calendar:** A view of the student's calendar, showing deadlines and scheduled events.

*   **Communication Hub:**
    *   Parents will have read-only access to all of their child's communication on the Optio platform, including with the Optio AI bot.

### 2.3. Data Models & Schema Changes

*   **`users` table:**
    *   Add a `role` column (ENUM: 'student', 'parent', 'tutor', 'admin').

*   **`parent_student_links` table:**
    *   `id` (Primary Key)
    *   `parent_user_id` (Foreign Key to `users.id`)
    *   `student_user_id` (Foreign Key to `users.id`)
    *   `status` (ENUM: 'pending_invitation', 'pending_approval', 'active', 'revoked')
    *   `created_at`, `updated_at`

*   **`parent_invitations` table:**
    *   `id`
    *   `email` (the invited parent's email)
    *   `invited_by_student_id` (Foreign Key to `users.id`)
    *   `token` (unique, indexed)
    *   `expires_at`
    *   `created_at`

### 2.4. Backend API Endpoints

*   `POST /api/v1/parents/invite` (Body: `{ email: "..." }`) - Student sends an invitation.
*   `GET /api/v1/parents/invitations/{token}` - Retrieves invitation details for the signup page.
*   `POST /api/v1/parents/register` (Body: `{ token: "...", name: "...", password: "..." }`) - Parent creates an account.
*   `POST /api/v1/students/approve-parent` (Body: `{ link_id: "..." }`) - Student approves the connection.
*   `GET /api/v1/parent/dashboard/{student_id}` - The primary endpoint to fetch all data needed for the parent dashboard. This will compute the learning rhythm and gather all necessary student information.