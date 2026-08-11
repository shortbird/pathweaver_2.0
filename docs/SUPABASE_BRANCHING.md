# Supabase Branching (Safe Testing)

Use Supabase Branching to safely test database changes without affecting production data.

## How Branching Works
- Creates an isolated database copy with the same schema as production
- Production data does NOT carry over (starts fresh)
- All migrations from production are automatically applied
- Branch gets its own URL, API keys, and project reference
- Can merge schema changes back to production when ready

## Branch Management

**Create a branch (via Dashboard):**
1. Go to https://supabase.com/dashboard/project/vvfgxcykxjybtvpfzwyx/branches
2. Click "Create branch" and name it (e.g., `develop`)
3. Note the branch credentials (URL, anon key, service key)

**Using MCP tools:**
```
list_branches     - List all development branches
create_branch     - Create a new branch (requires cost confirmation)
delete_branch     - Delete a branch
merge_branch      - Merge migrations from branch to production
reset_branch      - Reset branch to clean state
rebase_branch     - Apply production migrations to branch
```

## Development Workflow

1. **Create branch** via Supabase Dashboard
2. **Copy credentials** to `backend/.env.branch`
3. **Swap environment**: Rename `.env` to `.env.prod` and `.env.branch` to `.env`
4. **Start local servers** and test at http://localhost:3000
5. **Run dangerous operations** safely (deletes, schema changes)
6. **Seed test data**: `psql $DATABASE_URL -f supabase/seed.sql`
7. **When done**: Swap back to production `.env`

## Configuration Files
| File | Purpose |
|------|---------|
| `backend/.env.branch` | Branch credentials template |
| `supabase/seed.sql` | Test data for fresh branches |

## Cost
- ~$0.32/hour when active
- Auto-pauses after inactivity
- Estimated: $5-15/month for typical development usage
