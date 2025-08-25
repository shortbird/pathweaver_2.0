# Deployment Instructions - Username Removal

## Important: Backward Compatibility
The code has been updated to work both WITH and WITHOUT the username column, allowing for a smooth transition.

## Step 1: Deploy Backend Code First
Deploy the updated backend code which includes backward compatibility for both scenarios (with/without username).

## Step 2: Deploy Frontend Code
Deploy the updated frontend code which no longer shows username fields.

## Step 3: Run Database Migration
After both backend and frontend are deployed and working:

```bash
# Use the safe migration script
supabase db push --file supabase/migrations/20250826_remove_username_safe.sql
```

Or manually run the SQL in your Supabase SQL editor.

## Step 4: Test Key Functionality
1. **New User Registration**: Should work without username field
2. **Existing User Login**: Should work normally
3. **Profile Page**: Should display first and last name only
4. **Friend Requests**: Should use email instead of username
5. **Portfolio Access**: Should work with name-based slugs

## Step 5: Remove Backward Compatibility (Optional)
Once confirmed everything works, you can remove the backward compatibility code:
- Remove username handling from `auth.py`
- Remove username from allowed fields in `users.py`
- Remove username fallbacks from `community.py`

## Rollback Plan
If issues occur:
1. The code will continue to work even if the migration fails
2. To restore username column if needed:
```sql
ALTER TABLE users ADD COLUMN username TEXT UNIQUE;
UPDATE users SET username = lower(first_name || last_name);
```

## Notes
- The migration is safe and checks if the username column exists before trying to drop it
- Portfolio slugs are automatically regenerated from first and last names
- The system maintains uniqueness of portfolio slugs by adding numbers if needed