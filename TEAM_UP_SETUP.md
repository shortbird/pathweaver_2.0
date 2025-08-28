# Team Up Feature - Setup Instructions

## The Problem
The Team Up feature requires a `quest_collaborations` table in your database, but this table doesn't exist yet.

## Quick Setup

### Step 1: Run the Migration
Go to your Supabase Dashboard → SQL Editor → New Query and run this SQL:

```sql
-- Create quest_collaborations table for Team Up functionality
CREATE TABLE IF NOT EXISTS quest_collaborations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Ensure no duplicate collaborations
    CONSTRAINT unique_active_collaboration UNIQUE (quest_id, requester_id, partner_id),
    -- Ensure users can't invite themselves
    CONSTRAINT no_self_invitation CHECK (requester_id != partner_id)
);

-- Create indexes for performance
CREATE INDEX idx_quest_collaborations_quest_id ON quest_collaborations(quest_id);
CREATE INDEX idx_quest_collaborations_requester_id ON quest_collaborations(requester_id);
CREATE INDEX idx_quest_collaborations_partner_id ON quest_collaborations(partner_id);
CREATE INDEX idx_quest_collaborations_status ON quest_collaborations(status);

-- Add RLS policies
ALTER TABLE quest_collaborations ENABLE ROW LEVEL SECURITY;

-- Users can view their own collaborations
CREATE POLICY "Users can view own collaborations" ON quest_collaborations
    FOR SELECT
    USING (auth.uid() = requester_id OR auth.uid() = partner_id);

-- Service role can do everything (for backend API)
CREATE POLICY "Service role full access" ON quest_collaborations
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');
```

### Step 2: Test the Feature

After running the SQL:

1. **Send an invitation:**
   - Go to any quest
   - Click "Team Up"
   - Click "Invite to Quest" next to a friend

2. **Accept an invitation:**
   - The invited user should go to the Friends page
   - Look for "Team-Up Invitations" section
   - Click "Accept" on the invitation

3. **View active collaborations:**
   - Both users will see the quest as active
   - Tasks will show 2x XP bonus

## How It Works

### For the Inviter:
1. Click "Team Up" on a quest
2. See list of friends with "Invite to Quest" buttons
3. Click button to send invitation
4. Friend gets notified

### For the Invitee:
1. Go to Friends page
2. See pending team invitations in purple box
3. Click "Accept" to join the quest
4. Automatically enrolled and earning 2x XP

### Benefits:
- **2x XP** for all tasks completed while teamed up
- **Auto-enrollment** when accepting invitations
- **Shared progress** tracking
- **Motivation** from working together

## Troubleshooting

### "Team-up feature not yet configured"
- Run the SQL migration above

### Friends not showing in Team Up modal
- Make sure you have accepted friend requests
- Check the Friends page to see your friends list

### Invitations not appearing
- Refresh the Friends page
- Check that both users have accounts
- Ensure the database migration was successful

### Can't send invitation
- Make sure you're logged in
- Check that you have friends added
- Verify the quest is active

## Database Schema

The `quest_collaborations` table tracks:
- Who invited whom (`requester_id`, `partner_id`)
- Which quest (`quest_id`)
- Current status (`pending`, `accepted`, `declined`, etc.)
- Timestamps for tracking

This integrates with:
- `users` table for friend information
- `quests` table for quest details
- `user_quests` table for enrollment
- XP calculation system for 2x bonus