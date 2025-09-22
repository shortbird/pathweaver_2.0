## Implementation Plan

Based on the feedback provided, here is a proposed phased implementation plan. This plan breaks down the development into logical steps, starting with the foundational elements.

### Phase 1: Establish the Advisor Role & Dashboard (Core Foundation)

This phase focuses on creating the basic infrastructure for the advisor role and providing them with a central view of their students.

#### **Backend Tasks:**

1.  **Database Schema Changes:**
    *   In the `users` table (or equivalent), add a new `role` enum value: `advisor`.
    *   Create a new join table: `advisor_student_links`
        *   `id` (Primary Key)
        *   `advisor_id` (Foreign Key to `users.id`)
        *   `student_id` (Foreign Key to `users.id`)
        *   `created_at` (Timestamp)

2.  **API Endpoint Development (in a new `backend/routes/advisor.py`):**
    *   **`GET /api/v3/advisor/students`**
        *   **Auth:** Requires `advisor` role.
        *   **Action:** Fetches a list of all students linked to the currently logged-in advisor.
        *   **Response Data:** For each student, return `id`, `first_name`, `last_name`, `profile_picture_url`, `last_active_at`.

3.  **Admin API for Linking:**
    *   **`POST /api/v3/admin/links/advisor-student`**
        *   **Auth:** Requires `admin` role.
        *   **Action:** Creates a new link in the `advisor_student_links` table.
        *   **Request Body:** `{ "advisor_id": "...", "student_id": "..." }`

#### **Frontend Tasks:**

1.  **Role-Based Routing:**
    *   Update `src/components/PrivateRoute.jsx` to recognize and protect routes for the new `advisor` role.

2.  **New Advisor Dashboard Page:**
    *   Create `src/pages/AdvisorDashboardPage.jsx`.
    *   This page will be the default view for logged-in advisors.
    *   It will call the `GET /api/v3/advisor/students` endpoint to fetch data.
    *   **UI:** Display students in a card grid or list.
    *   **Inactivity Alert:** On the frontend, compare each student's `last_active_at` with the current date. If it's longer than a threshold (e.g., 7 days), display a visual indicator.

3.  **Admin UI for Linking:**
    *   In `src/pages/AdminPage.jsx`, add a new section for managing advisor-student relationships with an interface to link them.

---

### Phase 2: Collaborative Learning Pathway (Calendar & To-Do List)

This phase implements the primary collaborative planning tool for students and advisors. It functions as both a quest planner and a general-purpose to-do list.

#### **Backend Tasks:**

1.  **Database Schema Changes:**
    *   Create `learning_plan_items` table:
        *   `id` (Primary Key)
        *   `user_id` (Foreign Key to `users.id` - the student)
        *   `quest_id` (Foreign Key to `quests.id`, nullable)
        *   `task_id` (Foreign Key to `tasks.id`, nullable)
        *   `title` (VARCHAR, nullable) - For custom to-do items
        *   `description` (TEXT, nullable) - For custom to-do items
        *   `planned_completion_date` (Date)
        *   `created_by_user_id` (Foreign Key to `users.id` - who planned it)
        *   `created_at` / `updated_at` (Timestamps)
    *   *Constraint:* `CHECK (quest_id IS NOT NULL OR task_id IS NOT NULL OR title IS NOT NULL)`

2.  **API Endpoint Development (in a new `backend/routes/learning_pathway.py`):**
    *   **`GET /api/v3/users/{user_id}/learning-plan`**: Fetches all items for the student.
        *   **Auth:** Requesting user must be the student (`user_id`) or an advisor linked to the student.
    *   **`GET /api/v3/users/{user_id}/unplanned-quests`**: Fetches enrolled quests not yet on the plan.
        *   **Auth:** Same as above.
    *   **`POST /api/v3/users/{user_id}/learning-plan`**: Creates a new item.
        *   **Auth:** Same as above.
        *   **Request Body (Quest/Task):** `{ "quest_id": "..." or "task_id": "...", "planned_completion_date": "YYYY-MM-DD" }`
        *   **Request Body (Custom To-Do):** `{ "title": "...", "description": "...", "planned_completion_date": "YYYY-MM-DD" }`
    *   **`PUT /api/v3/learning-plan/{item_id}`**: Updates an item (date, title, etc.).
        *   **Auth:** Same as above.
    *   **`DELETE /api/v3/learning-plan/{item_id}`**: Deletes an item.
        *   **Auth:** Same as above.

#### **Frontend Tasks:**

1.  **New Page: `src/pages/LearningPathwayPage.jsx`**
    *   Main container for the calendar and backlog, accessible to students and linked advisors.

2.  **Component: Backlog/Unplanned Quests (`src/components/pathway/Backlog.jsx`)**
    *   Fetches from `GET /api/v3/users/{user_id}/unplanned-quests`.
    *   Renders quests and their tasks as draggable items.

3.  **Component: Pathway Calendar (`src/components/pathway/Calendar.jsx`)**
    *   **Library Integration:** Integrate a calendar library supporting drag-and-drop (e.g., **FullCalendar**).
    *   **Data Handling:** Fetches from `GET /api/v3/users/{user_id}/learning-plan` and renders items as events.
    *   **Drag-and-Drop:** Handle drops from the backlog (triggers `POST`) and internal calendar drags (triggers `PUT`).
    *   **Visual Distinction:** Render quest/task items differently from custom to-do items (e.g., different colors).
    *   **Real-time (Recommended):** Use Supabase Realtime to keep the calendar view in sync between users.

4.  **UI for Custom To-Do Items:**
    *   Add an "Add Item" button on the `LearningPathwayPage.jsx`.
    *   This button opens a modal with a form for `title`, `description`, and `date`.
    *   Submitting the form calls the `POST /api/v3/users/{user_id}/learning-plan` endpoint.