# Achievement Levels Implementation Plan

## Overview
Implement a 5-tier achievement system per pillar that represents permanent learning progress. These levels never decrease and form the core identity system for learners on Optio.

## The 5 Achievement Levels
1. **Explorer** 🌱 (0 XP) - Discovering new territories
2. **Builder** 🔨 (250 XP) - Constructing skills through practice  
3. **Creator** ✨ (750 XP) - Making original things
4. **Scholar** 📚 (1,500 XP) - Diving deep and connecting ideas
5. **Sage** 🔮 (3,000 XP) - Sharing wisdom and lifting others

## Phase 1: Database Implementation

### Step 1.1: Create Migration File
**File:** `backend/migrations/add_achievement_levels.py`

```python
"""
Run this migration with: python backend/migrations/add_achievement_levels.py
This creates all necessary tables for the achievement levels system.
"""

import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

def run_migration():
    # Initialize Supabase client
    supabase: Client = create_client(
        os.getenv('SUPABASE_URL'),
        os.getenv('SUPABASE_SERVICE_KEY')
    )
    
    # SQL statements for migration
    sql_statements = [
        """
        -- Table to define the 5 achievement levels
        CREATE TABLE IF NOT EXISTS achievement_levels (
            id SERIAL PRIMARY KEY,
            level_number INTEGER NOT NULL CHECK (level_number BETWEEN 1 AND 5),
            level_name VARCHAR(50) NOT NULL,
            min_xp INTEGER NOT NULL,
            badge_emoji VARCHAR(10) NOT NULL,
            color_scheme JSONB NOT NULL,
            description TEXT NOT NULL,
            encouragement_message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(level_number)
        );
        """,
        
        """
        -- Insert the 5 levels
        INSERT INTO achievement_levels (level_number, level_name, min_xp, badge_emoji, color_scheme, description, encouragement_message) 
        VALUES
        (1, 'Explorer', 0, '🌱', 
         '{"primary": "from-green-400 to-green-600", "border": "border-green-500", "bg": "bg-green-50", "text": "text-green-700"}',
         'You''re discovering new territories of knowledge',
         'Every expert was once an explorer. Enjoy the discovery!'),
        (2, 'Builder', 250, '🔨',
         '{"primary": "from-blue-400 to-blue-600", "border": "border-blue-500", "bg": "bg-blue-50", "text": "text-blue-700"}',
         'You''re constructing skills through practice',
         'You''re building something unique. Keep constructing!'),
        (3, 'Creator', 750, '✨',
         '{"primary": "from-purple-400 to-purple-600", "border": "border-purple-500", "bg": "bg-purple-50", "text": "text-purple-700"}',
         'You''re making original things that didn''t exist before',
         'Your creations are adding to the world. Keep making!'),
        (4, 'Scholar', 1500, '📚',
         '{"primary": "from-amber-400 to-amber-600", "border": "border-amber-500", "bg": "bg-amber-50", "text": "text-amber-700"}',
         'You''re diving deep and connecting ideas',
         'Your depth is uncovering amazing connections!'),
        (5, 'Sage', 3000, '🔮',
         '{"primary": "from-indigo-400 via-purple-500 to-pink-500", "border": "border-purple-500", "bg": "bg-gradient-to-br from-purple-50 to-pink-50", "text": "text-purple-700"}',
         'You''re sharing wisdom and lifting others',
         'Your journey is lighting the path for others!')
        ON CONFLICT (level_number) DO NOTHING;
        """,
        
        """
        -- Track user achievements per pillar
        CREATE TABLE IF NOT EXISTS user_achievements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
            pillar VARCHAR(50) NOT NULL CHECK (pillar IN ('creativity', 'critical_thinking', 'practical_skills', 'communication', 'cultural_literacy')),
            current_level INTEGER NOT NULL DEFAULT 1,
            current_xp INTEGER NOT NULL DEFAULT 0,
            level_achieved_at TIMESTAMP DEFAULT NOW(),
            next_level_threshold INTEGER DEFAULT 250,
            progress_percentage DECIMAL(5,2) DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, pillar)
        );
        """,
        
        """
        -- Create indexes for performance
        CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_achievements_level ON user_achievements(current_level);
        """,
        
        """
        -- Track achievement milestones for celebrations
        CREATE TABLE IF NOT EXISTS achievement_milestones (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
            pillar VARCHAR(50) NOT NULL,
            level_achieved INTEGER NOT NULL,
            level_name VARCHAR(50) NOT NULL,
            xp_at_achievement INTEGER NOT NULL,
            achieved_at TIMESTAMP DEFAULT NOW(),
            celebrated BOOLEAN DEFAULT false,
            celebration_shown_at TIMESTAMP,
            UNIQUE(user_id, pillar, level_achieved)
        );
        """,
        
        """
        -- Create function to calculate achievement level
        CREATE OR REPLACE FUNCTION calculate_achievement_level(xp_amount INTEGER)
        RETURNS TABLE(level_number INTEGER, level_name VARCHAR, next_threshold INTEGER, progress_percentage DECIMAL)
        LANGUAGE plpgsql
        AS $$
        BEGIN
            RETURN QUERY
            SELECT 
                al.level_number,
                al.level_name,
                COALESCE(next_level.min_xp, al.min_xp) as next_threshold,
                CASE 
                    WHEN next_level.min_xp IS NULL THEN 100.0
                    ELSE ((xp_amount - al.min_xp)::DECIMAL / (next_level.min_xp - al.min_xp) * 100)
                END as progress_percentage
            FROM achievement_levels al
            LEFT JOIN achievement_levels next_level ON next_level.level_number = al.level_number + 1
            WHERE al.min_xp <= xp_amount
            ORDER BY al.level_number DESC
            LIMIT 1;
        END;
        $$;
        """
    ]
    
    # Execute each SQL statement
    for sql in sql_statements:
        try:
            supabase.rpc('exec_sql', {'query': sql}).execute()
            print(f"✓ Executed migration step successfully")
        except Exception as e:
            print(f"✗ Migration step failed: {e}")
            
    print("Migration completed!")

if __name__ == "__main__":
    run_migration()
```

### Step 1.2: Initialize User Achievements
**File:** `backend/migrations/initialize_user_achievements.py`

```python
"""
Initialize achievement tracking for existing users based on their current XP.
Run after the main migration.
"""

def initialize_existing_users():
    # Get all users with their current XP per pillar
    users_xp = supabase.table('user_skill_xp').select('*').execute()
    
    for record in users_xp.data:
        # Calculate achievement level for this XP amount
        level_info = supabase.rpc('calculate_achievement_level', {
            'xp_amount': record['xp_amount']
        }).execute()
        
        # Insert or update user achievement record
        supabase.table('user_achievements').upsert({
            'user_id': record['user_id'],
            'pillar': record['skill_category'],
            'current_xp': record['xp_amount'],
            'current_level': level_info.data[0]['level_number'],
            'next_level_threshold': level_info.data[0]['next_threshold'],
            'progress_percentage': level_info.data[0]['progress_percentage']
        }).execute()
```

## Phase 2: Backend API Implementation

### Step 2.1: Create Achievement Service
**File:** `backend/services/achievement_service.py`

```python
from typing import Dict, List, Optional
from datetime import datetime
from database import get_supabase_client

class AchievementService:
    """Service for managing user achievement levels"""
    
    def __init__(self):
        self.supabase = get_supabase_client()
        self.pillars = ['creativity', 'critical_thinking', 'practical_skills', 
                       'communication', 'cultural_literacy']
    
    def update_user_achievement(self, user_id: str, pillar: str, xp_earned: int) -> Dict:
        """
        Update user's achievement when they earn XP.
        Returns info about level changes for celebration.
        """
        # Get current achievement status
        current = self.supabase.table('user_achievements')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('pillar', pillar)\
            .single()\
            .execute()
        
        if not current.data:
            # First time in this pillar
            current_xp = xp_earned
            old_level = 0
        else:
            current_xp = current.data['current_xp'] + xp_earned
            old_level = current.data['current_level']
        
        # Calculate new level
        level_info = self.supabase.rpc('calculate_achievement_level', {
            'xp_amount': current_xp
        }).execute()
        
        new_level = level_info.data[0]['level_number']
        
        # Update achievement record
        self.supabase.table('user_achievements').upsert({
            'user_id': user_id,
            'pillar': pillar,
            'current_xp': current_xp,
            'current_level': new_level,
            'next_level_threshold': level_info.data[0]['next_threshold'],
            'progress_percentage': level_info.data[0]['progress_percentage'],
            'updated_at': datetime.now().isoformat()
        }).execute()
        
        # Check for level up
        level_up_info = None
        if new_level > old_level:
            level_up_info = self._record_milestone(user_id, pillar, new_level, current_xp)
        
        return {
            'current_level': new_level,
            'current_xp': current_xp,
            'progress': level_info.data[0]['progress_percentage'],
            'next_threshold': level_info.data[0]['next_threshold'],
            'level_up': level_up_info
        }
    
    def _record_milestone(self, user_id: str, pillar: str, level: int, xp: int) -> Dict:
        """Record achievement milestone when user levels up"""
        # Get level details
        level_details = self.supabase.table('achievement_levels')\
            .select('*')\
            .eq('level_number', level)\
            .single()\
            .execute()
        
        # Record milestone
        self.supabase.table('achievement_milestones').insert({
            'user_id': user_id,
            'pillar': pillar,
            'level_achieved': level,
            'level_name': level_details.data['level_name'],
            'xp_at_achievement': xp
        }).execute()
        
        return {
            'new_level': level,
            'level_name': level_details.data['level_name'],
            'badge': level_details.data['badge_emoji'],
            'message': level_details.data['encouragement_message'],
            'pillar': pillar
        }
    
    def get_user_achievements(self, user_id: str) -> Dict:
        """Get all achievement levels for a user"""
        achievements = self.supabase.table('user_achievements')\
            .select('*, achievement_levels(*)')\
            .eq('user_id', user_id)\
            .execute()
        
        # Get overall achievement (minimum across all pillars)
        levels = [a['current_level'] for a in achievements.data] if achievements.data else [1]
        overall_level = min(levels) if levels else 1
        
        return {
            'overall_level': overall_level,
            'pillars': {a['pillar']: {
                'level': a['current_level'],
                'level_name': a['achievement_levels']['level_name'],
                'xp': a['current_xp'],
                'progress': a['progress_percentage'],
                'next_threshold': a['next_level_threshold'],
                'badge': a['achievement_levels']['badge_emoji']
            } for a in achievements.data} if achievements.data else {},
            'uncelebrated_milestones': self._get_uncelebrated_milestones(user_id)
        }
    
    def _get_uncelebrated_milestones(self, user_id: str) -> List[Dict]:
        """Get milestones that haven't been celebrated yet"""
        milestones = self.supabase.table('achievement_milestones')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('celebrated', False)\
            .execute()
        
        return milestones.data if milestones.data else []
```

### Step 2.2: Create Achievement API Routes
**File:** `backend/routes/achievements.py`

```python
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from services.achievement_service import AchievementService

achievements_bp = Blueprint('achievements', __name__)
achievement_service = AchievementService()

@achievements_bp.route('/api/v3/achievements', methods=['GET'])
@jwt_required()
def get_user_achievements():
    """Get all achievement levels for current user"""
    user_id = get_jwt_identity()
    
    try:
        achievements = achievement_service.get_user_achievements(user_id)
        return jsonify({
            'success': True,
            'achievements': achievements
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@achievements_bp.route('/api/v3/achievements/<pillar>', methods=['GET'])
@jwt_required()
def get_pillar_achievement(pillar):
    """Get achievement level for specific pillar"""
    user_id = get_jwt_identity()
    
    if pillar not in ['creativity', 'critical_thinking', 'practical_skills', 
                      'communication', 'cultural_literacy']:
        return jsonify({'error': 'Invalid pillar'}), 400
    
    try:
        achievement = achievement_service.get_pillar_achievement(user_id, pillar)
        return jsonify({
            'success': True,
            'achievement': achievement
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@achievements_bp.route('/api/v3/achievements/celebrate/<milestone_id>', methods=['POST'])
@jwt_required()
def celebrate_milestone(milestone_id):
    """Mark a milestone as celebrated"""
    user_id = get_jwt_identity()
    
    try:
        achievement_service.celebrate_milestone(milestone_id, user_id)
        return jsonify({
            'success': True,
            'message': 'Milestone celebrated!'
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Register blueprint in app.py
# app.register_blueprint(achievements_bp)
```

### Step 2.3: Integrate with XP Service
**File:** `backend/services/xp_service.py` (UPDATE EXISTING)

```python
# Add to existing XP award function
from services.achievement_service import AchievementService

def award_xp(user_id: str, pillar: str, xp_amount: int, source: str):
    """Award XP and check for achievement level changes"""
    
    # Existing XP award logic...
    
    # NEW: Update achievement progress
    achievement_service = AchievementService()
    achievement_result = achievement_service.update_user_achievement(
        user_id, pillar, xp_amount
    )
    
    # Return includes level up info if applicable
    return {
        'xp_awarded': xp_amount,
        'new_total': new_total,
        'achievement': achievement_result,
        'level_up': achievement_result.get('level_up')
    }
```

## Phase 3: Frontend Implementation

### Step 3.1: Create Achievement Context
**File:** `frontend/src/contexts/AchievementContext.jsx`

```jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/api';

const AchievementContext = createContext();

export const useAchievements = () => {
  const context = useContext(AchievementContext);
  if (!context) {
    throw new Error('useAchievements must be used within AchievementProvider');
  }
  return context;
};

export const AchievementProvider = ({ children }) => {
  const { user } = useAuth();
  const [achievements, setAchievements] = useState(null);
  const [uncelebratedMilestones, setUncelebratedMilestones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchAchievements();
    }
  }, [user]);

  const fetchAchievements = async () => {
    try {
      const response = await api.get('/api/v3/achievements');
      setAchievements(response.data.achievements);
      setUncelebratedMilestones(response.data.achievements.uncelebrated_milestones || []);
    } catch (error) {
      console.error('Failed to fetch achievements:', error);
    } finally {
      setLoading(false);
    }
  };

  const celebrateMilestone = async (milestoneId) => {
    try {
      await api.post(`/api/v3/achievements/celebrate/${milestoneId}`);
      setUncelebratedMilestones(prev => 
        prev.filter(m => m.id !== milestoneId)
      );
    } catch (error) {
      console.error('Failed to celebrate milestone:', error);
    }
  };

  const value = {
    achievements,
    uncelebratedMilestones,
    loading,
    fetchAchievements,
    celebrateMilestone
  };

  return (
    <AchievementContext.Provider value={value}>
      {children}
    </AchievementContext.Provider>
  );
};
```

### Step 3.2: Create Achievement Display Components
**File:** `frontend/src/components/achievements/AchievementBadge.jsx`

```jsx
import React from 'react';

const AchievementBadge = ({ level, size = 'md', showProgress = false, progress = 0 }) => {
  const sizeClasses = {
    sm: 'w-12 h-12 text-xl',
    md: 'w-16 h-16 text-2xl',
    lg: 'w-20 h-20 text-3xl',
    xl: 'w-24 h-24 text-4xl'
  };

  return (
    <div className="relative">
      <div className={`
        ${sizeClasses[size]} 
        rounded-full flex items-center justify-center
        bg-gradient-to-br ${level.color_scheme.primary}
        shadow-lg ring-2 ring-white
        ${level.level_number === 5 ? 'animate-pulse' : ''}
      `}>
        <span>{level.badge_emoji}</span>
      </div>
      
      {showProgress && progress < 100 && (
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          <circle
            cx="50%"
            cy="50%"
            r="45%"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
            className="text-gray-200"
          />
          <circle
            cx="50%"
            cy="50%"
            r="45%"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
            strokeDasharray={`${progress * 2.83} 283`}
            className="text-white"
          />
        </svg>
      )}
    </div>
  );
};

export default AchievementBadge;
```

**File:** `frontend/src/components/achievements/AchievementCard.jsx`

```jsx
import React from 'react';
import AchievementBadge from './AchievementBadge';

const AchievementCard = ({ pillar, achievement }) => {
  const pillarNames = {
    creativity: 'Creativity',
    critical_thinking: 'Critical Thinking',
    practical_skills: 'Practical Skills',
    communication: 'Communication',
    cultural_literacy: 'Cultural Literacy'
  };

  return (
    <div className={`
      p-6 rounded-xl border-2 ${achievement.color_scheme.border}
      ${achievement.color_scheme.bg} transition-all hover:shadow-lg
    `}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold capitalize">
            {pillarNames[pillar]}
          </h3>
          <p className="text-2xl font-bold mt-1">
            {achievement.level_name}
          </p>
        </div>
        <AchievementBadge level={achievement} size="md" />
      </div>

      <div className="space-y-3">
        <p className={`text-sm ${achievement.color_scheme.text}`}>
          {achievement.description}
        </p>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Progress to next level</span>
            <span className="font-semibold">
              {achievement.xp} / {achievement.next_threshold} XP
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-full rounded-full bg-gradient-to-r ${achievement.color_scheme.primary}`}
              style={{ width: `${achievement.progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AchievementCard;
```

### Step 3.3: Create Level Up Celebration Modal
**File:** `frontend/src/components/achievements/LevelUpCelebration.jsx`

```jsx
import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';

const LevelUpCelebration = ({ milestone, onClose }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Trigger confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    // Animate in
    setTimeout(() => setShow(true), 100);
  }, []);

  const pillarNames = {
    creativity: 'Creativity',
    critical_thinking: 'Critical Thinking',
    practical_skills: 'Practical Skills',
    communication: 'Communication',
    cultural_literacy: 'Cultural Literacy'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`
        bg-white rounded-2xl p-8 max-w-md transform transition-all duration-500
        ${show ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}
      `}>
        <div className="text-center">
          <div className="text-6xl mb-4">{milestone.badge}</div>
          
          <h2 className="text-3xl font-bold mb-2">
            Level Up! 🎉
          </h2>
          
          <p className="text-xl mb-4">
            You've become a <span className="font-bold">{milestone.level_name}</span>
            <br />in {pillarNames[milestone.pillar]}!
          </p>
          
          <p className="text-gray-600 mb-6">
            {milestone.message}
          </p>
          
          <button
            onClick={onClose}
            className="bg-gradient-primary text-white px-8 py-3 rounded-full font-semibold"
          >
            Celebrate! 🎊
          </button>
        </div>
      </div>
    </div>
  );
};

export default LevelUpCelebration;
```

### Step 3.4: Update Dashboard Integration
**File:** `frontend/src/pages/DashboardPage.jsx` (ADD TO EXISTING)

```jsx
import { useAchievements } from '../contexts/AchievementContext';
import AchievementCard from '../components/achievements/AchievementCard';
import LevelUpCelebration from '../components/achievements/LevelUpCelebration';

// Inside DashboardPage component:
const { achievements, uncelebratedMilestones, celebrateMilestone } = useAchievements();
const [currentCelebration, setCurrentCelebration] = useState(null);

// Check for uncelebrated milestones on mount
useEffect(() => {
  if (uncelebratedMilestones.length > 0) {
    setCurrentCelebration(uncelebratedMilestones[0]);
  }
}, [uncelebratedMilestones]);

// Add to render:
{currentCelebration && (
  <LevelUpCelebration
    milestone={currentCelebration}
    onClose={() => {
      celebrateMilestone(currentCelebration.id);
      setCurrentCelebration(null);
      // Check for more celebrations
      if (uncelebratedMilestones.length > 1) {
        setTimeout(() => {
          setCurrentCelebration(uncelebratedMilestones[1]);
        }, 500);
      }
    }}
  />
)}

// Achievement Cards Section
<div className="mb-8">
  <h2 className="text-2xl font-bold mb-4">Your Achievement Levels</h2>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {achievements && Object.entries(achievements.pillars).map(([pillar, data]) => (
      <AchievementCard key={pillar} pillar={pillar} achievement={data} />
    ))}
  </div>
</div>
```

### Step 3.5: Update Diploma Page
**File:** `frontend/src/pages/DiplomaPageV3.jsx` (UPDATE EXISTING)

```jsx
// Add achievement display to diploma
const AchievementShowcase = ({ achievements }) => {
  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 mb-8">
      <h2 className="text-2xl font-bold mb-4">Achievement Levels</h2>
      
      {/* Overall Achievement */}
      <div className="text-center mb-6">
        <div className="text-lg font-semibold mb-2">Overall Level</div>
        <div className="text-3xl font-bold">
          {achievements.overall_level_name} {achievements.overall_badge}
        </div>
      </div>
      
      {/* Individual Pillars */}
      <div className="grid grid-cols-5 gap-3">
        {Object.entries(achievements.pillars).map(([pillar, data]) => (
          <div key={pillar} className="text-center">
            <div className="text-4xl mb-1">{data.badge}</div>
            <div className="text-xs font-semibold capitalize">
              {pillar.replace('_', ' ')}
            </div>
            <div className="text-sm font-bold">{data.level_name}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

## Phase 4: Testing & Verification

### Step 4.1: Test Data Setup
```sql
-- Insert test data for development
INSERT INTO user_skill_xp (user_id, skill_category, xp_amount) VALUES
('test-user-id', 'creativity', 800),  -- Should be Creator
('test-user-id', 'critical_thinking', 300),  -- Should be Builder
('test-user-id', 'practical_skills', 1600),  -- Should be Scholar
('test-user-id', 'communication', 0),  -- Should be Explorer
('test-user-id', 'cultural_literacy', 3500);  -- Should be Sage
```

### Step 4.2: Test Scenarios
1. **New User**: Verify starts as Explorer in all pillars
2. **XP Award**: Verify level updates when crossing thresholds
3. **Level Up**: Verify celebration modal appears
4. **Progress Bar**: Verify accurate progress calculation
5. **Overall Level**: Verify shows minimum pillar level
6. **Diploma Display**: Verify achievements show correctly

## Phase 5: Deploy & Monitor

### Deployment Checklist
- [ ] Run database migration on production
- [ ] Deploy backend with new routes
- [ ] Deploy frontend with achievement components
- [ ] Initialize achievements for existing users
- [ ] Test level up celebration flow
- [ ] Verify diploma page updates
- [ ] Check performance of achievement queries
- [ ] Monitor error logs for issues

### Success Metrics
- Track level up celebrations shown
- Monitor achievement page views
- Measure impact on daily active users
- Track XP earning patterns post-launch

## Rollback Plan
If issues arise:
1. Disable achievement display on frontend
2. Keep data collection running
3. Fix issues
4. Re-enable display

The achievement data is non-destructive and can be recalculated if needed.