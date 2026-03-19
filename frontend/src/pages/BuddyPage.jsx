import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useBuddy, useCreateBuddy, useFeedBuddy, useTapBuddy, useUpdateBuddy } from '../hooks/api/useBuddy'
import OptioBuddy from '../components/buddy/OptioBuddy'
import {
  STAGE_PALETTES,
  VITALITY_DECAY_RATE,
  BOND_DECAY_RATE,
  BOND_INCREMENT_FEED,
  BOND_INCREMENT_TAP,
  BOND_INCREMENT_OPEN,
  VITALITY_PER_FEED,
  DAILY_FEED_LIMIT,
  getStageForFeeds,
} from '../components/buddy/buddyConstants'

// Create buddy form
const CreateBuddyForm = ({ onCreate, isPending }) => {
  const [name, setName] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (name.trim()) {
      onCreate(name.trim())
    }
  }

  return (
    <div className="max-w-md mx-auto text-center">
      <div className="mb-8 flex justify-center">
        <OptioBuddy vitality={0.8} bond={0} stage={0} width={250} height={213} />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
        Adopt Your Buddy
      </h2>
      <p className="text-gray-600 mb-6">
        Give your buddy a name and watch it grow as you feed it each day!
      </p>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name your buddy..."
          maxLength={30}
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple text-lg"
          autoFocus
        />
        <button
          type="submit"
          disabled={!name.trim() || isPending}
          className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-bold hover:shadow-lg transition-all min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Hatching...' : 'Adopt'}
        </button>
      </form>
    </div>
  )
}

const BuddyPage = () => {
  const { user } = useAuth()
  const { data: buddy, isLoading } = useBuddy(user?.id)
  const createBuddyMutation = useCreateBuddy()
  const feedMutation = useFeedBuddy()
  const tapMutation = useTapBuddy()
  const updateMutation = useUpdateBuddy()

  // Local animation state
  const [vitality, setVitality] = useState(0.8)
  const [bond, setBond] = useState(0)
  const [stage, setStage] = useState(0)
  const [feedReaction, setFeedReaction] = useState(null)
  const [tapBurst, setTapBurst] = useState(0)
  const [feedsToday, setFeedsToday] = useState(0)
  const feedTimeout = useRef(null)

  // Sync from server data
  useEffect(() => {
    if (!buddy) return

    // Calculate decay since last interaction
    const lastInteraction = new Date(buddy.last_interaction).getTime()
    const elapsed = (Date.now() - lastInteraction) / (1000 * 60 * 60) // hours

    const decayedVitality = Math.max(0, buddy.vitality * Math.pow(VITALITY_DECAY_RATE, elapsed / 24))
    const decayedBond = Math.max(0, buddy.bond * Math.pow(BOND_DECAY_RATE, elapsed / 24))

    setVitality(decayedVitality)
    setBond(Math.min(1, decayedBond + BOND_INCREMENT_OPEN)) // Bond boost on screen open
    setStage(getStageForFeeds(buddy.total_xp_fed || 0))

    // Calculate feeds today (reset if different day)
    const today = new Date().toISOString().split('T')[0]
    if (buddy.last_fed_date === today) {
      setFeedsToday(buddy.xp_fed_today || 0)
    } else {
      setFeedsToday(0)
    }
  }, [buddy])

  const isSuperadmin = user?.role === 'superadmin'

  const handleFeed = useCallback(() => {
    if (feedReaction || (!isSuperadmin && feedsToday >= DAILY_FEED_LIMIT)) return

    const newVitality = Math.min(1, vitality + VITALITY_PER_FEED)
    const newBond = Math.min(1, bond + BOND_INCREMENT_FEED)

    // Pick a random reaction type for variety
    const reactions = ['crunch', 'sweet', 'spicy', 'soupy', 'chewy']
    const reaction = reactions[Math.floor(Math.random() * reactions.length)]

    setFeedReaction(reaction)
    setVitality(newVitality)
    setBond(newBond)
    setFeedsToday(prev => prev + 1)

    clearTimeout(feedTimeout.current)
    feedTimeout.current = setTimeout(() => setFeedReaction(null), 2000)

    // Persist to server
    feedMutation.mutate(
      { foodId: 'feed', newVitality, newBond },
      {
        onSuccess: (updatedBuddy) => {
          // Check for stage evolution
          const newStage = getStageForFeeds(updatedBuddy.total_xp_fed || 0)
          if (newStage > stage) {
            setStage(newStage)
            updateMutation.mutate({
              stage: newStage,
              highest_stage: Math.max(updatedBuddy.highest_stage || 0, newStage),
            })
          }
        }
      }
    )
  }, [feedReaction, feedsToday, vitality, bond, stage, feedMutation, updateMutation])

  const handleTap = useCallback(() => {
    if (feedReaction) return
    const newBond = Math.min(1, bond + BOND_INCREMENT_TAP)
    setTapBurst(t => t + 1)
    setBond(newBond)
    tapMutation.mutate({ newBond })
  }, [feedReaction, bond, tapMutation])

  const handleCreate = (name) => {
    createBuddyMutation.mutate(name)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  // No buddy yet - show create form
  if (!buddy) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CreateBuddyForm onCreate={handleCreate} isPending={createBuddyMutation.isPending} />
      </div>
    )
  }

  const canFeed = (isSuperadmin || feedsToday < DAILY_FEED_LIMIT) && !feedReaction

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header - just the name, no stats */}
      <div className="text-center mb-2">
        <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {buddy.name}
        </h1>
      </div>

      {/* Buddy Character */}
      <div className="flex justify-center -mt-2 mb-2">
        <OptioBuddy
          vitality={vitality}
          bond={bond}
          stage={stage}
          onTap={handleTap}
          feedReaction={feedReaction}
          tapBurst={tapBurst}
          width={360}
          height={306}
        />
      </div>

      {/* Feed counter - subtle dots only */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <div className="flex gap-1.5">
          {Array.from({ length: DAILY_FEED_LIMIT }).map((_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                i < feedsToday ? 'bg-optio-purple scale-110' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Feed button */}
      <div className="flex justify-center">
        <button
          onClick={handleFeed}
          disabled={!canFeed}
          className={`px-8 py-3 rounded-xl font-bold text-lg transition-all min-h-[44px] ${
            canFeed
              ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:shadow-lg hover:-translate-y-0.5'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {!isSuperadmin && feedsToday >= DAILY_FEED_LIMIT ? 'Full for today!' : feedReaction ? 'Eating...' : 'Feed'}
        </button>
      </div>

      {/* Tap hint */}
      <p className="text-center text-xs text-gray-400 mt-4">
        Click your buddy to interact!
      </p>

      {/* Superadmin debug controls */}
      {user?.role === 'superadmin' && (
        <div className="mt-8 bg-gray-900 rounded-xl p-4 text-white text-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-xs text-gray-400">SUPERADMIN CONTROLS</span>
            <button
              onClick={() => {
                setStage(0)
                setVitality(0.8)
                setBond(0)
                setFeedsToday(0)
                updateMutation.mutate({
                  stage: 0, highest_stage: 0, vitality: 0.8, bond: 0,
                  total_xp_fed: 0, xp_fed_today: 0,
                })
              }}
              className="px-3 py-1 bg-red-600 rounded text-xs font-medium hover:bg-red-700 min-h-[32px]"
            >
              Reset to Egg
            </button>
          </div>

          {/* Stage */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-400">Stage</span>
              <span className="font-mono">{stage} ({STAGE_PALETTES[stage]?.name})</span>
            </div>
            <input
              type="range" min={0} max={6} step={1} value={stage}
              onChange={(e) => {
                const s = parseInt(e.target.value)
                setStage(s)
                updateMutation.mutate({ stage: s, highest_stage: Math.max(buddy.highest_stage || 0, s) })
              }}
              className="w-full accent-optio-purple"
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              {STAGE_PALETTES.map((p, i) => <span key={i}>{p.name}</span>)}
            </div>
          </div>

          {/* Vitality */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-400">Vitality</span>
              <span className="font-mono">{vitality.toFixed(2)}</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01} value={vitality}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setVitality(v)
                updateMutation.mutate({ vitality: v })
              }}
              className="w-full accent-green-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              <span>Sleeping</span><span>Tired</span><span>Happy</span>
            </div>
          </div>

          {/* Bond */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-400">Bond</span>
              <span className="font-mono">{bond.toFixed(2)}</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01} value={bond}
              onChange={(e) => {
                const b = parseFloat(e.target.value)
                setBond(b)
                updateMutation.mutate({ bond: b })
              }}
              className="w-full accent-pink-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              <span>Shy</span><span>Friendly</span><span>Bonded</span>
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-700">
            <span className="text-gray-400 text-xs mr-1 self-center">Presets:</span>
            {[
              { label: 'Sleeping', v: 0.05, b: 0.1, s: 1 },
              { label: 'Tired', v: 0.3, b: 0.2, s: 2 },
              { label: 'Content', v: 0.55, b: 0.4, s: 3 },
              { label: 'Happy', v: 0.8, b: 0.6, s: 4 },
              { label: 'Thriving', v: 0.95, b: 0.85, s: 5 },
              { label: 'Legend', v: 1.0, b: 1.0, s: 6 },
            ].map(p => (
              <button
                key={p.label}
                onClick={() => {
                  setVitality(p.v)
                  setBond(p.b)
                  setStage(p.s)
                  updateMutation.mutate({ vitality: p.v, bond: p.b, stage: p.s, highest_stage: Math.max(buddy.highest_stage || 0, p.s) })
                }}
                className="px-2 py-1 bg-gray-700 rounded text-xs hover:bg-gray-600 min-h-[28px]"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default BuddyPage
