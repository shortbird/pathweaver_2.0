-- Migration 07: Restore quest_collaborations table
-- The table was incorrectly archived during schema cleanup, but the collaboration feature is still actively used.

-- Check if the archived table exists and restore it, or create new if it doesn't exist
DO $$
BEGIN
    -- Try to rename from archived version
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quest_collaborations_archived') THEN
        ALTER TABLE IF EXISTS quest_collaborations_archived RENAME TO quest_collaborations;
        RAISE NOTICE 'Restored quest_collaborations from archived version';
    -- Create new if neither exists
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quest_collaborations') THEN
        CREATE TABLE public.quest_collaborations (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            quest_id uuid NOT NULL,
            requester_id uuid NOT NULL,
            partner_id uuid NOT NULL,
            status collaboration_status DEFAULT 'pending'::collaboration_status,
            message text,
            created_at timestamp with time zone DEFAULT now(),
            responded_at timestamp with time zone,
            accepted_at timestamp with time zone,
            CONSTRAINT quest_collaborations_pkey PRIMARY KEY (id),
            CONSTRAINT quest_collaborations_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id),
            CONSTRAINT quest_collaborations_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.users(id),
            CONSTRAINT quest_collaborations_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.users(id)
        );

        -- Add indexes for common queries
        CREATE INDEX idx_quest_collaborations_requester ON public.quest_collaborations(requester_id);
        CREATE INDEX idx_quest_collaborations_partner ON public.quest_collaborations(partner_id);
        CREATE INDEX idx_quest_collaborations_quest ON public.quest_collaborations(quest_id);
        CREATE INDEX idx_quest_collaborations_status ON public.quest_collaborations(status);

        COMMENT ON TABLE public.quest_collaborations IS 'Team-up invitations for collaborative quests. Active feature used by paid tier users.';

        RAISE NOTICE 'Created new quest_collaborations table';
    ELSE
        RAISE NOTICE 'quest_collaborations table already exists';
    END IF;
END $$;
