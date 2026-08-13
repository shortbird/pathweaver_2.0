-- Migration: Carve out "Spendable XP" (coin) economy from the Yeti pet system
-- into a standalone student_wallets ledger.
--
-- Context: the Yeti virtual-pet feature is being removed. Its spendable_xp
-- ledger, however, is reused as Treehouse's coin/"School Jobs" economy and as
-- bounty rewards, and is credited by the core XP service on every award. This
-- migration extracts that ledger into a program-agnostic table so the pet game
-- can be deleted without losing the coin balances.
--
-- Additive + non-destructive: creates student_wallets and backfills existing
-- balances from yeti_pets. The yeti_* tables are dropped in a separate,
-- later migration once this is verified.

CREATE TABLE IF NOT EXISTS student_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    spendable_xp INTEGER NOT NULL DEFAULT 0 CHECK (spendable_xp >= 0),
    total_xp_spent INTEGER NOT NULL DEFAULT 0 CHECK (total_xp_spent >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_wallet UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_student_wallets_user_id ON student_wallets(user_id);

COMMENT ON TABLE student_wallets IS 'Spendable-XP ("coin") ledger, one per student. A wallet exists only for students in programs that use the coin economy (e.g. Treehouse). Total XP (mastery) is never reduced by spending here.';
COMMENT ON COLUMN student_wallets.spendable_xp IS 'Current coin balance. Credited alongside Total XP, reduced by spending.';
COMMENT ON COLUMN student_wallets.total_xp_spent IS 'Lifetime spendable XP spent. Analytics only.';

-- Backend-only access (service_role). Frontends reach this via the Flask API,
-- not PostgREST, so no anon/authenticated policies are needed.
ALTER TABLE student_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on student_wallets"
    ON student_wallets FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Backfill existing balances from the Yeti pets that carried them.
INSERT INTO student_wallets (user_id, spendable_xp, total_xp_spent)
SELECT user_id, spendable_xp, total_xp_spent
FROM yeti_pets
ON CONFLICT (user_id) DO NOTHING;
