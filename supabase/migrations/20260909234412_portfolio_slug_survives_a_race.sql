-- generate_portfolio_slug() could not survive two accounts being created at the
-- same instant with the same name.
--
-- Sentry OPTIO-BACKEND-8C, 2026-09-09 00:43:14. Two concurrent first-loads of
-- /api/messages/contacts both minted the school-inbox account for one org. Both
-- triggers ran the collision loop, both found `disruption-` free (neither had
-- committed yet), and both tried to insert it. The winner's row is timestamped
-- 38ms before the loser's error.
--
-- Two defects, both fixed here:
--
-- 1. `ON CONFLICT (user_id)` cannot absorb the conflict that actually fires.
--    The constraint hit is diplomas_portfolio_slug_key, on portfolio_slug. A
--    conflict target names ONE unique index, so the slug collision went
--    unhandled and surfaced as a raw 23505 out of an unrelated users insert.
--    The read-then-write loop is not atomic and never can be, so the retry
--    belongs in an exception handler, not in a wider pre-check.
--
-- 2. `user_id != NEW.id` is NULL, not TRUE, when a diploma row has a NULL
--    user_id -- diplomas.user_id is nullable. EXISTS() then matches nothing and
--    the loop exits on the first candidate, handing the insert a slug it has
--    already been told is taken. `IS DISTINCT FROM` is what was meant.
--
-- Behaviour is otherwise unchanged: same base slug, same `-1`, `-2` suffixes,
-- same silent no-op when the user already holds a diploma.
--
-- Applied to staging first, then production, as a RECORDED migration --
-- schema_migrations holds 20260909234412, matching this filename. Verified on
-- staging against a probe table: the ordinary path, the NULL user_id case, and
-- a same-name second account. The pre-fix body was restored inside a
-- transaction and confirmed to raise unique_violation on the NULL case, so the
-- test proves the fix rather than the new code's self-consistency.

CREATE OR REPLACE FUNCTION public.generate_portfolio_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    IF NEW.first_name IS NOT NULL AND NEW.last_name IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(NEW.first_name || '-' || NEW.last_name, '[^a-zA-Z0-9-]', '-', 'g'));
    ELSIF NEW.display_name IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(NEW.display_name, '[^a-zA-Z0-9]', '-', 'g'));
    ELSIF NEW.email IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-zA-Z0-9]', '-', 'g'));
    ELSE
        base_slug := 'user-' || SUBSTRING(NEW.id::TEXT, 1, 8);
    END IF;

    final_slug := base_slug;

    -- Best-effort pre-check: skips the wasted round trip in the common case.
    -- IS DISTINCT FROM, not !=, so a NULL user_id still counts as taken.
    WHILE EXISTS(SELECT 1 FROM public.diplomas
                 WHERE portfolio_slug = final_slug
                   AND user_id IS DISTINCT FROM NEW.id) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;

    -- The authority. Whatever the pre-check concluded, another transaction may
    -- have taken the slug since, so keep trying until Postgres accepts one.
    -- 50 is far past any real name collision and stops a runaway loop.
    LOOP
        BEGIN
            -- is_public intentionally omitted: the column default (FALSE) decides.
            INSERT INTO public.diplomas (user_id, portfolio_slug)
            VALUES (NEW.id, final_slug)
            ON CONFLICT (user_id)
            DO UPDATE SET portfolio_slug = EXCLUDED.portfolio_slug
            WHERE public.diplomas.portfolio_slug IS NULL;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            counter := counter + 1;
            IF counter > 50 THEN
                -- A diploma is recoverable; losing the account is not. Fall back
                -- to something that cannot collide and let the insert proceed.
                final_slug := 'user-' || REPLACE(NEW.id::TEXT, '-', '');
            END IF;
            IF counter > 51 THEN
                RAISE WARNING 'generate_portfolio_slug: giving up on a slug for %', NEW.id;
                EXIT;
            END IF;
            IF counter <= 50 THEN
                final_slug := base_slug || '-' || counter;
            END IF;
        END;
    END LOOP;

    RETURN NEW;
END;
$function$;
