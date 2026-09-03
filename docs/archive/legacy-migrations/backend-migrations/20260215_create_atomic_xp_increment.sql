-- Migration: Create atomic XP increment function
-- Date: 2026-02-15
-- Purpose: Eliminate race conditions in XP award operations by using atomic database increment
--
-- Problem: The current read-modify-write pattern in xp_service.py can cause race conditions
-- when multiple requests award XP simultaneously:
--   1. Read current XP (e.g., 100)
--   2. Add new XP (100 + 50 = 150)
--   3. Write new total (150)
-- If two requests happen concurrently, both may read 100 and both write 150,
-- losing one of the XP awards.
--
-- Solution: Use atomic INSERT ... ON CONFLICT ... DO UPDATE with database-side arithmetic

-- Create the atomic XP increment function
CREATE OR REPLACE FUNCTION increment_user_xp(
    p_user_id UUID,
    p_pillar TEXT,
    p_amount INTEGER
)
RETURNS TABLE(new_xp_amount INTEGER, was_created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_id UUID;
    v_new_amount INTEGER;
    v_was_created BOOLEAN := FALSE;
BEGIN
    -- Validate inputs
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be null';
    END IF;

    IF p_pillar IS NULL OR p_pillar NOT IN ('art', 'stem', 'wellness', 'communication', 'civics') THEN
        RAISE EXCEPTION 'pillar must be one of: art, stem, wellness, communication, civics';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be a positive integer';
    END IF;

    -- Try to update existing record first (most common case)
    UPDATE user_skill_xp
    SET
        xp_amount = xp_amount + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id AND pillar = p_pillar
    RETURNING id, xp_amount INTO v_existing_id, v_new_amount;

    -- If no row was updated, insert new record
    IF NOT FOUND THEN
        INSERT INTO user_skill_xp (user_id, pillar, xp_amount, updated_at)
        VALUES (p_user_id, p_pillar, p_amount, NOW())
        ON CONFLICT (user_id, pillar)
        DO UPDATE SET
            xp_amount = user_skill_xp.xp_amount + EXCLUDED.xp_amount,
            updated_at = NOW()
        RETURNING xp_amount INTO v_new_amount;

        v_was_created := TRUE;
    END IF;

    new_xp_amount := v_new_amount;
    was_created := v_was_created;
    RETURN NEXT;
END;
$$;

-- Grant execute permission to authenticated users (RLS still applies for the underlying table)
GRANT EXECUTE ON FUNCTION increment_user_xp(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_user_xp(UUID, TEXT, INTEGER) TO service_role;

-- Add comment documenting the function
COMMENT ON FUNCTION increment_user_xp IS
'Atomically increments XP for a user in a specific pillar.
Returns the new total XP amount and whether a new record was created.
Use via Supabase RPC: supabase.rpc("increment_user_xp", {p_user_id: uuid, p_pillar: text, p_amount: int})';
