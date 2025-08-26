# AI Quest Generation System: Implementation Guide

## 1\. High-Level Overview

This document outlines the implementation of an autonomous, multi-agent AI system for generating, managing, and validating quests. The system is designed to be self-improving, ensuring a continuous stream of high-quality, diverse, and engaging content for users.

The system consists of several core AI agents and workflows:

  * **The Generator AI**: Autonomously creates new quests based on a central "seed" prompt, existing quest data, and user feedback. It actively balances quest creation across the five educational pillars.
  * **The Grader AI**: Acts as a quality control agent, automatically reviewing and scoring all newly generated quests. It approves high-quality quests, flags moderate ones for admin review, and discards low-quality ones.
  * **The Expander AI**: Transforms simple user-submitted ideas (a title and description) into fully-formed quests, which are then fed into the same grading pipeline.
  * **The Validator AI**: Analyzes user submissions for completed quests, providing automated feedback and validation.

This entire system is powered by a feedback loop from user and admin ratings, ensuring the AI continuously learns and adapts to what makes a quest successful.

-----

## 2\. Core Features & Workflow

### A. Autonomous Quest Generation & Grading

1.  **Trigger**: A scheduled cron job will hit a secure API endpoint once per day to initiate the cycle.
2.  **Pillar Balancing**: The **Generator AI** first queries the database to find the least-represented pillar.
3.  **Feedback Incorporation**: The AI analyzes the highest and lowest-rated quests in the database to learn what to emulate and what to avoid.
4.  **Generation**: The AI generates a new, complete quest for the underrepresented pillar, including a balanced XP reward. It also checks for semantic duplicates using vector embeddings to ensure originality. The quest is saved to the database with a `status` of `"generated"`.
5.  **Grading**: The **Grader AI** fetches all quests with the `"generated"` status. It scores each one against a rubric defined in the AI Seed Prompt.
6.  **Routing**:
      * **High Score (90-100)**: Status is set to `"approved"`. Quest becomes visible to users.
      * **Medium Score (60-89)**: Status is set to `"pending_review"`. Quest appears in the admin review queue.
      * **Low Score (0-59)**: Quest is deleted.

### B. User-Submitted "Idea to Quest" Pipeline

1.  A user submits a simple idea (title and description) via a form.
2.  This triggers the **Expander AI**, which fleshes out the idea into a complete quest.
3.  The quest is saved with a `status` of `"generated"` and enters the standard grading and routing workflow described above.

### C. Quest Submission Validation

1.  A user submits their work (text, images, links) to complete a quest.
2.  The **Validator AI** analyzes the submission against the quest's requirements.
3.  It assigns a validation score and provides feedback. High scores are auto-approved; lower scores are flagged for manual review by an educator.

-----

## 3\. Implementation Steps

### Step 1: Database Schema Changes (Supabase)

Create a single new migration file in `supabase/migrations/` to apply all the following changes.

#### 1.1. Enable `pgvector` Extension

This is required for semantic similarity searches.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

#### 1.2. Create `ai_seeds` Table

This holds the master prompt for the AI agents.

```sql
CREATE TABLE ai_seeds (
    id SERIAL PRIMARY KEY,
    prompt_name TEXT NOT NULL UNIQUE DEFAULT 'primary_seed',
    prompt_text TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add a placeholder seed prompt
INSERT INTO ai_seeds (prompt_text) VALUES ('Initial seed prompt: Define AI persona, goals, and rules here...');

ALTER TABLE ai_seeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage AI seeds" ON ai_seeds
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );
```

#### 1.3. Create `quest_ideas` Table

For user-submitted ideas.

```sql
CREATE TABLE quest_ideas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_expansion', -- pending_expansion, expanded, failed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE quest_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own quest ideas" ON quest_ideas
    FOR ALL USING (auth.uid() = user_id);
```

#### 1.4. Create `quest_ratings` Table

For user and admin feedback.

```sql
CREATE TABLE quest_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(quest_id, user_id)
);

ALTER TABLE quest_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own quest ratings" ON quest_ratings
    FOR ALL USING (auth.uid() = user_id);
```

#### 1.5. Modify `quests` Table

Add columns for the AI workflow, ratings, and vector embeddings.

```sql
-- Add columns for AI workflow and status
ALTER TABLE quests ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE quests ADD COLUMN ai_grade_score NUMERIC(5, 2);
ALTER TABLE quests ADD COLUMN ai_grade_feedback TEXT;

-- Add columns for ratings
ALTER TABLE quests ADD COLUMN average_rating NUMERIC(3, 2) DEFAULT 0.00;

-- Add column for vector embedding (size depends on the model, e.g., 384 for 'all-MiniLM-L6-v2')
ALTER TABLE quests ADD COLUMN embedding vector(384);

-- Create an index for fast similarity searches
CREATE INDEX ON quests USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);
```

#### 1.6. Modify `submissions` Table

Add columns for AI validation data.

```sql
ALTER TABLE submissions ADD COLUMN ai_validation_score NUMERIC(5, 2);
ALTER TABLE submissions ADD COLUMN ai_validation_summary TEXT;
```

-----

### Step 2: Backend Implementation (Flask)

#### 2.1. Environment Variables

Add the following to your `.env` file and production environment:

```
GEMINI_API_KEY="your_google_ai_api_key"
CRON_SECRET="a_very_strong_and_secret_key_for_your_cron_job"
```

#### 2.2. New AI Services

Create a new `services` directory inside `backend/` and add the following files. These will contain the core logic for interacting with the Gemini API and the database.

  * `backend/services/generator_service.py`: For the Generator AI.
  * `backend/services/grader_service.py`: For the Grader AI.
  * `backend/services/expander_service.py`: For the Expander AI.
  * `backend/services/validator_service.py`: For the Validator AI.

#### 2.3. New API Routes

Create new files in `backend/routes/` for the new endpoints.

**`backend/routes/ai_orchestrator.py`**:

```python
# Contains the secure endpoint for the cron job to call
from flask import Blueprint, jsonify, request, current_app
# ... import your service functions

ai_orchestrator_bp = Blueprint('ai_orchestrator', __name__)

@ai_orchestrator_bp.route('/api/ai/run-cycle', methods=['POST'])
def run_ai_cycle():
    auth_header = request.headers.get('Authorization')
    secret_key = current_app.config.get('CRON_SECRET')
    if not auth_header or auth_header != f'Bearer {secret_key}':
        return jsonify({'error': 'Unauthorized'}), 401

    # Call your generator and grader services here
    # ...
    return jsonify({'message': 'AI cycle completed successfully.'}), 200
```

**`backend/routes/quest_ideas.py`**:

```python
# For handling user-submitted quest ideas
from flask import Blueprint, request, jsonify
# ... import your expander_service and auth decorators

quest_ideas_bp = Blueprint('quest_ideas', __name__)

@quest_ideas_bp.route('/api/quest-ideas', methods=['POST'])
# @a_user_required (or your auth decorator)
def submit_quest_idea():
    # ... get user_id from token
    # ... get title and description from request.get_json()
    # ... insert into quest_ideas table
    # ... asynchronously trigger the expander service (use Celery or a simple thread)
    return jsonify({'message': 'Your idea has been submitted!'}), 202
```

**`backend/routes/ratings.py`**:

```python
# For handling user and admin quest ratings
from flask import Blueprint, request, jsonify
# ... import auth decorators and supabase client

ratings_bp = Blueprint('ratings', __name__)

@ratings_bp.route('/api/quests/<uuid:quest_id>/rate', methods=['POST'])
# @a_user_required
def rate_quest(user, quest_id):
    # ... get user role and ID
    # ... get rating from request.get_json()
    # If user is admin, use an upsert operation
    # If user is not admin, ensure they have completed the quest and use an insert operation
    # Recalculate and update the average_rating on the quests table
    return jsonify({'message': 'Thank you for your feedback!'}), 201
```

#### 2.4. Update `app.py`

Register the new blueprints in your main `app.py` file.

```python
from backend.routes.ai_orchestrator import ai_orchestrator_bp
from backend.routes.quest_ideas import quest_ideas_bp
from backend.routes.ratings import ratings_bp

app.register_blueprint(ai_orchestrator_bp)
app.register_blueprint(quest_ideas_bp)
app.register_blueprint(ratings_bp)
```

-----

### Step 3: Frontend Implementation (React)

#### 3.1. New Admin Components

Create the following components inside `frontend/src/components/` or a new `frontend/src/pages/admin/` directory.

  * `AISeedEditor.jsx`: A component with a large `<textarea>` that fetches the current seed prompt from an `/api/ai/seed` endpoint (you'll need to create this simple GET/PUT endpoint). It allows admins to update the master prompt.
  * `AdminReviewQueue.jsx`: A page that fetches and displays all quests with `status = 'pending_review'`. It should show the quest details, the AI's grade and feedback, and provide "Approve" and "Reject" buttons.

#### 3.2. New User-Facing Components

  * `QuestIdeaForm.jsx`: A simple form with "Title" and "Description" fields that POSTs to the `/api/quest-ideas` endpoint.
  * `QuestRating.jsx`: A 5-star rating component that POSTs the rating to the `/api/quests/<quest_id>/rate` endpoint.

#### 3.3. Update Existing Pages

  * **`AdminPage.jsx`**: Add navigation links to the new `AISeedEditor` and `AdminReviewQueue` pages.
  * **`QuestsPage.jsx`**: Add a button or link that opens the `QuestIdeaForm`.
  * **`QuestDetailPage.jsx`**:
      * Display the `<QuestRating />` component.
      * Use logic to control its visibility: always show it for admins, but for regular users, only show it after they have completed the quest.
    <!-- end list -->
    ```jsx
    import { useAuth } from '../contexts/AuthContext'; // Or your auth context
    // ...
    const { user } = useAuth();
    const isAdmin = user && user.role === 'admin';
    const [hasSubmitted, setHasSubmitted] = useState(false); // fetch this status

    // ... in your return statement
    {(isAdmin || hasSubmitted) && <QuestRating questId={quest.id} />}
    ```

-----

### Step 4: Configuration & Deployment

#### 4.1. Cron Job Setup

On your hosting provider (e.g., Render, Vercel), set up a cron job to run daily.

  * **Command**: `curl -X POST -H "Authorization: Bearer your_cron_secret_key" https://your_app_url/api/ai/run-cycle`
  * **Schedule**: `0 0 * * *` (This runs once a day at midnight UTC).

#### 4.2. Vector Embedding Model

In your `generator_service.py`, you will need to use a sentence-transformer library to create the embeddings. A good starting point is the `all-MiniLM-L6-v2` model, which produces 384-dimensional vectors. Ensure this library is added to your `requirements.txt`.