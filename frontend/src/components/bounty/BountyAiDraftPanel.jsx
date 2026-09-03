import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import { SparklesIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useConfirm } from '../../contexts/ConfirmContext'
import { useAIAccess } from '../../contexts/AIAccessContext'

/**
 * AI bounty drafting for posters (2026-08: parents asked for help creating
 * bounties). One sentence of intent in, 2-3 complete bounty ideas out.
 *
 * Same contract as QuestAiDraftPanel: it fills the form rather than replacing
 * it. Picking an idea lands it in the same fields the poster would have typed
 * into, and Post Bounty stays their separate, deliberate click — nothing a
 * model wrote reaches a student unread. The review step IS the feature.
 */

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const REWARD_HINTS = [
  { key: 'xp', label: 'XP' },
  { key: 'custom', label: 'Real-world reward' },
]

export default function BountyAiDraftPanel({ onDrafted, hasDraft, kids = [] }) {
  const confirm = useConfirm()
  const { canUseTaskGeneration, loading: aiLoading } = useAIAccess()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [childId, setChildId] = useState('')
  const [rewardHint, setRewardHint] = useState('xp')
  const [ideas, setIdeas] = useState([])
  const [busy, setBusy] = useState(false)

  // Platform convention: AI surfaces render nothing when access is off, they
  // don't render a disabled button (see AITaskGenerator, QuestIdeaSuggestions).
  if (aiLoading || !canUseTaskGeneration) return null

  const generate = async () => {
    if (!prompt.trim()) {
      toast.error('Tell us what you want to happen first')
      return
    }
    setBusy(true)
    setIdeas([])
    try {
      const kid = kids.find(k => k.id === childId)
      const res = await api.post('/api/bounties/ai-draft', {
        prompt: prompt.trim(),
        child_id: childId || null,
        child_context: kid ? `The bounty is for ${kid.display_name || 'my kid'}.` : '',
        reward_hint: rewardHint,
      }, { timeout: 90000 }) // generation outlives the default axios timeout
      const got = res.data?.ideas || []
      if (!got.length) throw new Error()
      setIdeas(got)
      toast.success(`${got.length} idea${got.length === 1 ? '' : 's'} ready — pick one to fill the form`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not build bounty ideas from that')
    } finally {
      setBusy(false)
    }
  }

  const useIdea = async (idea) => {
    if (hasDraft && !(await confirm('Replace what is currently in the form with this idea?'))) return
    onDrafted({
      title: idea.title || '',
      description: idea.description || '',
      deliverables: (idea.deliverables || []).map(d => d.text || d),
      rewards: (idea.rewards || []).map(r => (
        r.type === 'xp'
          ? { type: 'xp', value: r.value || 50, pillar: r.pillar || 'stem', text: '' }
          : { type: 'custom', value: 0, pillar: '', text: r.text || '' }
      )),
      childId: childId || null,
    })
    toast.success('Idea loaded — review it, tweak anything, then post')
    setOpen(false)
    setIdeas([])
    setPrompt('')
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-optio-purple hover:underline">
        <SparklesIcon className="w-4 h-4" aria-hidden="true" /> Help me write this bounty
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-optio-purple/30 bg-optio-purple/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <SparklesIcon className="w-4 h-4 text-optio-purple" aria-hidden="true" />
        <h5 className="text-sm font-semibold text-gray-800">Start from what you want</h5>
        <button type="button" onClick={() => setOpen(false)}
          className="ml-auto text-xs text-gray-500 hover:underline">Close</button>
      </div>
      <p className="text-xs text-gray-500">
        Say what you want to happen, in your own words. You'll get a few complete bounty
        ideas — title, steps, and rewards — to pick from and edit. Nothing is posted until you post it.
      </p>

      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
        aria-label="What do you want to happen?"
        placeholder={'e.g. "I want Leo to practice piano without me nagging" or "Get the garage cleaned out before winter"'}
        className={`${inputCls} resize-y`} />

      <div className="flex flex-wrap items-center gap-2">
        {kids.length > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            For
            <select value={childId} onChange={(e) => setChildId(e.target.value)}
              aria-label="Which kid is this for?"
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">Anyone</option>
              {kids.map(k => <option key={k.id} value={k.id}>{k.display_name || 'Student'}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          Reward
          <select value={rewardHint} onChange={(e) => setRewardHint(e.target.value)}
            aria-label="What kind of reward?"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            {REWARD_HINTS.map(h => <option key={h.key} value={h.key}>{h.label}</option>)}
          </select>
        </label>

        <button type="button" disabled={busy || !prompt.trim()} onClick={generate}
          className="ml-auto px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
          {busy ? 'Thinking…' : ideas.length ? 'Try again' : 'Suggest bounties'}
        </button>
      </div>

      {ideas.length > 0 && (
        <div className="space-y-2 pt-1">
          {ideas.map((idea, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{idea.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{idea.description}</p>
                  <ul className="mt-1.5 space-y-0.5">
                    {(idea.deliverables || []).map((d, j) => (
                      <li key={j} className="text-xs text-gray-600 flex gap-1.5">
                        <span className="text-optio-purple" aria-hidden="true">•</span>
                        {d.text || d}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {(idea.rewards || []).map(r => r.type === 'xp' ? `+${r.value} XP` : r.text).filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button type="button" onClick={() => useIdea(idea)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-optio-purple text-optio-purple text-xs font-semibold hover:bg-optio-purple/10">
                  Use this
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
