# Fix your .env file

Your `.env` file currently has incorrect Supabase URLs. You need to update these values:

## Current (INCORRECT):
```
VITE_SUPABASE_URL=postgresql://postgres:...
```

## Should be (CORRECT):
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Where to find these values:

1. Go to your Supabase dashboard
2. Click on your project
3. Go to Settings → API
4. Copy:
   - **Project URL** → paste as `VITE_SUPABASE_URL`
   - **anon public** key → paste as `VITE_SUPABASE_ANON_KEY`

The PostgreSQL connection string (`postgresql://...`) should be kept as a separate variable if needed for direct database access, but the API calls need the HTTPS URL.