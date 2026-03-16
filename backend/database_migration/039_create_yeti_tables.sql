-- Migration: Create Yeti virtual companion tables
-- Purpose: Yeti pet system with shop, inventory, and interaction tracking + Spendable XP economy
-- Date: March 2026

-- ============================================
-- Part 1: yeti_pets - One pet per student
-- ============================================

CREATE TABLE IF NOT EXISTS yeti_pets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    hunger INTEGER NOT NULL DEFAULT 80 CHECK (hunger >= 0 AND hunger <= 100),
    happiness INTEGER NOT NULL DEFAULT 80 CHECK (happiness >= 0 AND happiness <= 100),
    energy INTEGER NOT NULL DEFAULT 80 CHECK (energy >= 0 AND energy <= 100),
    accessories JSONB NOT NULL DEFAULT '[]'::jsonb,
    spendable_xp INTEGER NOT NULL DEFAULT 0 CHECK (spendable_xp >= 0),
    total_xp_spent INTEGER NOT NULL DEFAULT 0 CHECK (total_xp_spent >= 0),
    last_fed_at TIMESTAMPTZ,
    last_interaction_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_pet UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_yeti_pets_user_id ON yeti_pets(user_id);

COMMENT ON TABLE yeti_pets IS 'Virtual Yeti companion - one per student. Stores pet state, stats, and Spendable XP balance.';
COMMENT ON COLUMN yeti_pets.spendable_xp IS 'Currency for Yeti shop purchases. Earned alongside Total XP, reduced by spending. Total XP (in user_mastery) is never reduced.';
COMMENT ON COLUMN yeti_pets.total_xp_spent IS 'Lifetime Spendable XP spent in the shop. For analytics only.';
COMMENT ON COLUMN yeti_pets.accessories IS 'Array of equipped accessory item IDs (from yeti_items). Example: ["uuid1", "uuid2"]';

-- ============================================
-- Part 2: yeti_items - Shop catalog
-- ============================================

CREATE TABLE IF NOT EXISTS yeti_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('food', 'toy', 'accessory')),
    xp_cost INTEGER NOT NULL CHECK (xp_cost > 0),
    effect JSONB NOT NULL DEFAULT '{}'::jsonb,
    image_url TEXT,
    rive_asset_id TEXT,
    rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'legendary')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yeti_items_category ON yeti_items(category);
CREATE INDEX IF NOT EXISTS idx_yeti_items_is_active ON yeti_items(is_active) WHERE is_active = true;

COMMENT ON TABLE yeti_items IS 'Catalog of items available in the Yeti shop. Prices are in Spendable XP.';
COMMENT ON COLUMN yeti_items.effect IS 'Stat changes when item is used. Example: {"hunger": 15, "happiness": 10}';
COMMENT ON COLUMN yeti_items.rive_asset_id IS 'Rive animation asset ID for rendering this item on the Yeti.';

-- ============================================
-- Part 3: yeti_inventory - Student-owned items
-- ============================================

CREATE TABLE IF NOT EXISTS yeti_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES yeti_items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_item UNIQUE (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_yeti_inventory_user_id ON yeti_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_yeti_inventory_item_id ON yeti_inventory(item_id);

COMMENT ON TABLE yeti_inventory IS 'Items owned by each student. Quantity decremented when consumables (food, toys) are used. Accessories persist.';

-- ============================================
-- Part 4: yeti_interactions - Action log
-- ============================================

CREATE TABLE IF NOT EXISTS yeti_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES yeti_pets(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN ('feed', 'play', 'equip_accessory', 'unequip_accessory', 'purchase')),
    item_id UUID REFERENCES yeti_items(id) ON DELETE SET NULL,
    stat_changes JSONB NOT NULL DEFAULT '{}'::jsonb,
    xp_spent INTEGER NOT NULL DEFAULT 0 CHECK (xp_spent >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yeti_interactions_user_id ON yeti_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_yeti_interactions_pet_id ON yeti_interactions(pet_id);
CREATE INDEX IF NOT EXISTS idx_yeti_interactions_created_at ON yeti_interactions(created_at DESC);

COMMENT ON TABLE yeti_interactions IS 'Audit log of all Yeti care actions. Used for analytics and debugging XP economy.';

-- ============================================
-- Part 5: RLS Policies
-- ============================================

ALTER TABLE yeti_pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE yeti_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE yeti_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE yeti_interactions ENABLE ROW LEVEL SECURITY;

-- Service role: full access on all tables
CREATE POLICY "Service role full access on yeti_pets"
    ON yeti_pets FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on yeti_items"
    ON yeti_items FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on yeti_inventory"
    ON yeti_inventory FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on yeti_interactions"
    ON yeti_interactions FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Users: can read/update their own pet
CREATE POLICY "Users can view own pet"
    ON yeti_pets FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can create own pet"
    ON yeti_pets FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own pet"
    ON yeti_pets FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users: can read all active shop items
CREATE POLICY "Anyone can view active shop items"
    ON yeti_items FOR SELECT
    USING (is_active = true);

-- Users: can read/modify their own inventory
CREATE POLICY "Users can view own inventory"
    ON yeti_inventory FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can modify own inventory"
    ON yeti_inventory FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own inventory"
    ON yeti_inventory FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users: can insert their own interactions and view them
CREATE POLICY "Users can view own interactions"
    ON yeti_interactions FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert own interactions"
    ON yeti_interactions FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- ============================================
-- Part 6: Seed initial shop items
-- ============================================

INSERT INTO yeti_items (name, category, xp_cost, effect, rarity) VALUES
    ('Snack', 'food', 10, '{"hunger": 15}', 'common'),
    ('Meal', 'food', 25, '{"hunger": 40, "happiness": 10}', 'common'),
    ('Treat', 'food', 30, '{"hunger": 30, "energy": 5}', 'common'),
    ('Toy Ball', 'toy', 20, '{"happiness": 25}', 'common'),
    ('Cozy Hat', 'accessory', 50, '{}', 'common'),
    ('Cool Scarf', 'accessory', 50, '{}', 'common'),
    ('Sunglasses', 'accessory', 75, '{}', 'rare'),
    ('Bow Tie', 'accessory', 60, '{}', 'common'),
    ('Golden Crown', 'accessory', 200, '{}', 'legendary')
ON CONFLICT DO NOTHING;
