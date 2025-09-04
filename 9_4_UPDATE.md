# Optimized Implementation Plan - 9.4 Update (v2)

This document provides a highly specific, step-by-step guide for a developer agent to execute a series of updates. Follow each instruction precisely.

---

## I. Dashboard UI and Data Flow Updates

**Objective:** Simplify the dashboard by removing the "Completed Quests" section and creating a unified "Recent Completions" feed.

### Action 1: Modify Frontend Component (`frontend/src/pages/DashboardPage.jsx`)

1.  **Delete Completed Quests Section:** In `DashboardPage.jsx`, find and delete the following JSX block entirely:
    ```jsx
    <div className="card">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Completed Quests</h2>
        <Link
          to="/diploma"
          className="text-sm text-primary hover:text-purple-700 font-medium"
        >
          View Full Diploma →
        </Link>
      </div>
      <CompletedQuests activeQuests={dashboardData?.active_quests} />
    </div>
    ```
2.  **Rename Recent Completions Header:** Find the `h2` element with the text `Recent Task Completions` and change it to `Recent Completions`.

### Action 2: Update Backend Logic (`backend/routes/users/dashboard.py`)

1.  **Add New Function:** In `dashboard.py`, add the following function to combine and sort recent activities. This function should be placed before the main `get_dashboard` route.
    ```python
    from datetime import datetime, timezone

    def get_recent_completions_combined(supabase, user_id: str, limit: int = 5) -> list:
        """Get combined list of recent task and quest completions."""
        try:
            tasks = get_recent_task_completions(supabase, user_id, limit)
            quests = get_recent_completions(supabase, user_id, limit)

            for task in tasks:
                task['type'] = 'task'
                task['title'] = task.get('task_description', 'Task Completed')
                task['xp'] = task.get('xp_awarded', 0)

            formatted_quests = []
            for quest_enrollment in quests:
                quest_details = quest_enrollment.get('quests', {})
                total_xp = sum(task.get('xp_amount', 0) for task in quest_details.get('quest_tasks', []))
                formatted_quests.append({
                    'id': quest_enrollment.get('id'),
                    'type': 'quest',
                    'title': quest_details.get('title', 'Quest Completed'),
                    'completed_at': quest_enrollment.get('completed_at'),
                    'xp': total_xp
                })

            combined = tasks + formatted_quests
            
            # Sort by 'completed_at', handling potential naive and aware datetime objects
            combined.sort(key=lambda x: datetime.fromisoformat(x['completed_at'].replace('Z', '+00:00')) if isinstance(x.get('completed_at'), str) else datetime.now(timezone.utc), reverse=True)
            
            return combined[:limit]
        except Exception as e:
            print(f"Error in get_recent_completions_combined: {str(e)}")
            return []
    ```
2.  **Update Main Route:** In the `get_dashboard` function, replace the line `recent_completions = get_recent_task_completions(supabase, user_id, limit=3)` with:
    ```python
    recent_completions = get_recent_completions_combined(supabase, user_id, limit=5)
    ```

### Action 3: Update Frontend Rendering (`frontend/src/pages/DashboardPage.jsx`)

1.  **Modify `RecentCompletions` Component:** Replace the existing `RecentCompletions` component with the following code to handle both `'task'` and `'quest'` types.
    ```jsx
    const RecentCompletions = memo(({ recentItems }) => {
      if (!recentItems || recentItems.length === 0) {
        return <p className="text-gray-600">No recent completions. Go complete a task or quest!</p>
      }
      
      return (
        <div className="space-y-3">
          {recentItems.map((item, idx) => {
            const isTask = item.type === 'task';
            const pillarData = isTask ? getPillarData(item.pillar) : getPillarData('creativity'); // Default for quests
            const pillarStyle = { 
              bg: pillarData.bg, 
              text: pillarData.text, 
              border: pillarData.bg.replace('bg-', 'border-').replace('100', '200') 
            }

            return (
              <div
                key={item.id || idx}
                className={`p-4 rounded-xl border ${pillarStyle.bg} ${pillarStyle.border}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-medium text-sm text-gray-900">
                      {item.title}
                    </h3>
                    {isTask && (
                      <p className="text-xs text-gray-600 mt-1">
                        Quest: <span className="font-medium">{item.quest_title || 'Unknown Quest'}</span>
                      </p>
                    )}
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${pillarStyle.bg} ${pillarStyle.text} ml-2`}>
                    {isTask ? item.pillar.replace('_', ' ') : 'Quest'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-sm font-bold text-green-600">
                    +{item.xp || item.xp_awarded} XP
                  </span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {item.completed_at ? new Date(item.completed_at).toLocaleDateString() : 'Recently'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )
    })
    ```
2.  **Update Prop Name:** In the `DashboardPage` component's return statement, find where `<RecentCompletions ... />` is used and change the prop from `recentTasks` to `recentItems`.

---

## II. Data Chart and Statistics Debugging

**Objective:** Systematically debug and fix the data pipeline for the dashboard charts.

### Action: Follow this precise debugging flow:

1.  **Frontend Check:** Open the browser's developer tools, go to the Network tab, and inspect the response for the `/users/dashboard` API call. Look at the `xp_by_category` object in the JSON response.
2.  **Decision Point:**
    -   **If `xp_by_category` contains valid data (e.g., `{"creativity": 50, ...}`):** The problem is on the frontend. Proceed to step 3.
    -   **If `xp_by_category` is empty, null, or all zeros:** The problem is on the backend. Proceed to step 4.
3.  **Frontend Debugging (`frontend/src/pages/DashboardPage.jsx`):**
    -   Focus on the `useMemo` hook that calculates `skillXPData`. 
    -   Add `console.log` statements inside this hook to inspect the values of `dashboardData.xp_by_category`, `totalXP`, and the final `skillXPData` array being returned. 
    -   Ensure the `totalXP > 0` condition that controls chart rendering is evaluating correctly.
4.  **Backend Debugging (`backend/routes/users/helpers.py`):**
    -   The issue is likely in the `calculate_user_xp` function.
    -   Inside this function, add `print()` statements to log the results of the Supabase queries for completed tasks and quests. 
    -   Verify that the queries are returning data and that the subsequent loops are correctly aggregating the XP into the `skill_breakdown` dictionary. The function must correctly sum XP from all completed tasks for the user.

---

## III. Unified & AI-Assisted Quest Generation

**Objective:** Create a single quest creation form that uses AI to assist all users and has a role-based approval workflow.

### Action 1: Create New Backend Endpoint (`backend/routes/ai_quests.py`)

1.  **Update the AI Prompt:** In the `generate-and-save-quest` function, replace the `prompt` variable with the following to ensure the AI generates quests in the correct format.
    ```python
    prompt = f"""Please act as an expert curriculum designer. Your task is to generate a complete quest object in valid JSON format. 
    The user has provided the following starting data: {partial_quest_data}. 
    You must fill in all missing fields to create a complete, coherent, and engaging quest. 
    The final JSON object MUST conform exactly to this structure:
    {{
      "title": "(string)",
      "description": "(string)",
      "big_idea": "(string)",
      "tasks": [
        {{
          "title": "(string)",
          "description": "(string)",
          "pillar": "(string: must be one of stem_logic, arts_creativity, language_communication, life_wellness, society_culture)",
          "subcategory": "(string)",
          "xp_amount": (integer),
          "evidence_prompt": "(string)",
          "materials_needed": ["(string)"],
          "task_order": (integer, starting from 0)
        }}
      ]
    }}
    Base your generation on the user's input, but use your expertise to create high-quality educational content. Ensure the final output is ONLY the raw JSON object, with no other text or explanations."""
    ```

### Action 2: Create Unified Frontend Component (`frontend/src/pages/CreateQuestPageV2.jsx`)

1.  Create the new file `frontend/src/pages/CreateQuestPageV2.jsx`.
2.  Implement a form with fields for quest details (e.g., `title`, `big_idea`, `description`). Make them optional.
3.  On submit, the form should call the new `/v1/ai/generate-and-save-quest` endpoint (note the lack of `/api`), sending only the fields the user filled out.
4.  Use the `useAuth` hook to check the user's role and change the submit button text accordingly ("Generate and Approve" for admins, "Submit for Review" for others).

### Action 3: Update Admin Interface (`frontend/src/components/admin/QuestSubmissionsManager.jsx`)

1.  Modify this component to fetch all quests where `is_approved` is `false`.
2.  For each unapproved quest, add "Approve" and "Reject" buttons that call the appropriate admin API endpoints to update the quest's status.

---

## IV. Diploma Page Overhaul

**Objective:** Streamline the Diploma page's data fetching to ensure all completed quests and their evidence are reliably displayed.

### Action 1: Optimize Backend (`backend/routes/portfolio.py`)

1.  **Set Single Source of Truth:** The route `GET /diploma/<user_id>` must be the only endpoint responsible for fetching diploma data.
2.  **Optimize Query:** Replace the existing query in that function with the following more robust and explicit Supabase query. This ensures all necessary data for the diploma and evidence modal is fetched in one go.
    ```python
    completed_quests_response = supabase.table('user_quests').select(
        '''
        completed_at,
        quests:quests!inner(id, title, description, big_idea),
        user_quest_tasks:user_quest_tasks!inner(completed_at, evidence_type, evidence_content, xp_awarded, quest_tasks(title, pillar))
        '''
    ).eq('user_id', user_id).not_.is_('completed_at', 'null').order('completed_at', desc=True).execute()
    ```
3.  **Refactor Data Formatting:** Adapt the rest of the function to use the data from this new query structure to build the `achievements` list. The goal is to create the `task_evidence` object required by the frontend from the `user_quest_tasks` nested data.

### Action 2: Streamline Frontend (`frontend/src/pages/DiplomaPageV3.jsx`)

1.  **Simplify Data Fetching:** In the main `useEffect` hook, remove all `fetch` calls except for the one that will ultimately call the `/diploma/:userId` endpoint.
2.  **Consolidate Logic:** Ensure that whether the page is accessed by a `slug`, `userId`, or the logged-in user, the component's logic boils down to calling the single, optimized backend endpoint and rendering the `achievements` it returns.
3.  **Verify Modal Data:** In the JSX for the evidence modal, add `console.log(selectedAchievement)` to confirm it's receiving the complete data object, including the `task_evidence`, when a quest card is clicked.

---

## V. API Route Path Normalization

**Objective:** Standardize API URLs by removing redundant `/api` prefixes from backend routes and frontend calls.

**Analysis:** The `VITE_API_URL` environment variable is the single source of truth and already contains the `/api` path (e.g., `http://localhost:5001/api`). Redundant `/api` prefixes in the code create broken "/api/api/..." paths.

### Action 1: Update Backend Routes

1.  **Task:** Go through all Python files in `backend/routes/` and **remove the `/api` prefix** from all `@bp.route()` decorators.
2.  **Example:** Change `@bp.route('/api/v3/quests/...')` to `@bp.route('/v3/quests/...')`.

### Action 2: Update All Frontend API Calls

1.  **Task:** Perform a global search across the `frontend/src` directory for all occurrences of `api.get(`, `api.post(`, etc.
2.  **Action:** In every instance, **remove the `/api` prefix** from the URL string.
3.  **Example:** Change `api.get('/api/v3/quests/completed')` to `api.get('/v3/quests/completed')`.
4.  **Verification:** After this is done, a global search for `'/api/'` within any `api` method call should yield zero results. This confirms the fix is complete.
