# In-Person Microschool Sprints & Badges Implementation Summary

## 1. Feature Overview

This document outlines the implementation plan for creating a special class of badges unique to in-person microschool "sprints." These sprints are timed, subject-focused learning periods (e.g., 2-week CAD course).

The core requirements are:
- An easy way for teachers/admins to create sprints and their associated badges.
- A clear distinction between these "sprint badges" and the general badge library.
- Access to sprints and their badges will be restricted to students with the `"excel"` subscription tier.

## 2. Database Schema Changes

Two changes are required in the database: a new table to define sprints and a modification to the existing `badges` table to link them.

### New Table: `sprints`

This table will store information about each sprint event.

```sql
CREATE TABLE public.sprints (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name character varying NOT NULL,
        pillar character varying NOT NULL CHECK (pillar::text = ANY (ARRAY['life_wellness'::character varying, 'language_communication'::character varying, 'stem_logic'::character varying, 'society_culture'::character varying, 'arts_creativity'::character varying]::text[])),
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT sprints_pkey PRIMARY KEY (id),
    CONSTRAINT sprints_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- Add RLS policy for tier-based access
ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sprints are viewable by users with excel tier"
ON public.sprints FOR SELECT
TO authenticated
USING (
  (SELECT subscription_tier FROM public.users WHERE id = auth.uid()) = 'excel'
);

CREATE POLICY "Admins and educators can manage sprints"
ON public.sprints FOR ALL
TO authenticated
USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'educator')
)
WITH CHECK (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'educator')
);
```

### Modification to `badges` Table

A foreign key column `sprint_id` will be added to the `badges` table. This creates the link to a sprint and serves as the primary differentiator for sprint-specific badges.

```sql
ALTER TABLE public.badges
ADD COLUMN sprint_id uuid,
ADD CONSTRAINT badges_sprint_id_fkey FOREIGN KEY (sprint_id) REFERENCES public.sprints(id) ON DELETE SET NULL;

-- Create an index for faster lookups
CREATE INDEX idx_badges_sprint_id ON public.badges(sprint_id);
```
**Implication:** A badge is considered a "Sprint Badge" if its `sprint_id` is NOT NULL. The frontend and backend can use this field to filter these badges from the main public library.

## 3. Backend API Endpoints

The following RESTful endpoints will be needed. They should be built following the existing patterns in the `backend/routes/` directory.

### `POST /api/sprints`
- **Description:** Creates a new sprint and its corresponding unique badge.
- **Authorization:** Restricted to `admin` or `educator` roles.
- **Validation:** The `pillar` field must be one of the five valid pillar names. The API should validate this and return a 400 Bad Request with a clear error message if an invalid pillar name is provided.
- **Body:**
  ```json
  {
    "name": "CAD Fundamentals",
    "pillar": "stem_logic",
    "start_date": "2025-11-01T09:00:00Z",
    "end_date": "2025-11-15T17:00:00Z"
  }
  ```
- **Workflow:**
  1. Create the `sprint` record.
  2. Create a new `badge` record with a name derived from the sprint (e.g., "CAD Fundamentals Sprint Badge") and set its `sprint_id` to the newly created sprint's ID.
  3. Return the new sprint and badge information.

### `GET /api/sprints`
- **Description:** Returns a list of all available sprints.
- **Authorization:** The RLS policy will automatically filter this list to only include sprints for users with the `excel` subscription tier.

### `GET /api/sprints/:id`
- **Description:** Retrieves the details for a single sprint, including its associated badge and the quests required for that badge.
- **Authorization:** RLS policy applies.

### `PUT /api/sprints/:id`
- **Description:** Updates the details of a sprint.
- **Authorization:** `admin` or `educator` roles.

### `DELETE /api/sprints/:id`
- **Description:** Deletes a sprint. The associated badge's `sprint_id` should be set to NULL.
- **Authorization:** `admin` or `educator` roles.

## 4. Frontend User Flow

### Admin/Educator Experience
1.  Navigate to a new "Sprints" section in the admin dashboard.
2.  Click "Create New Sprint."
3.  A form appears asking for Sprint Name, Pillar, Start Date, and End Date.
4.  On submission, the sprint and its unique badge are created. The admin is redirected to the standard "Edit Badge" page for this new badge.
5.  The admin uses the existing UI to add the required quests and tasks to the sprint badge.

### Student Experience
1.  For students with the `"excel"` subscription tier, a new "Sprints" tab or section will be visible on their dashboard. Students without this tier will not see this UI.
2.  Inside the "Sprints" section, they will see a list of currently active and upcoming sprints.
3.  Clicking on a sprint takes them to a detail page showing the sprint's associated badge, the quests required to earn it, and the time remaining.
4.  The student journey for completing the quests and earning the badge proceeds as it does for any other badge.
