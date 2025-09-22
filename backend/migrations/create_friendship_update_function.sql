-- Create a function to update friendship status without triggering timestamp triggers
-- This bypasses any automatic updated_at field issues

CREATE OR REPLACE FUNCTION update_friendship_status(friendship_id integer, new_status text)
RETURNS TABLE(id integer, requester_id uuid, addressee_id uuid, status text, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update the friendship status directly
    UPDATE friendships
    SET status = new_status::friendship_status
    WHERE friendships.id = friendship_id;

    -- Return the updated record
    RETURN QUERY
    SELECT f.id, f.requester_id, f.addressee_id, f.status::text, f.created_at
    FROM friendships f
    WHERE f.id = friendship_id;
END;
$$;

-- Grant execute permission to the service role
GRANT EXECUTE ON FUNCTION update_friendship_status(integer, text) TO service_role;