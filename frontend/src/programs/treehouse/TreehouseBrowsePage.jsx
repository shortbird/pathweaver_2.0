/**
 * The Treehouse visual quest/badge browse (/treehouse/browse).
 *
 * Surfaces the org's quests as big, color-coded category cards (one section per
 * pillar). A quest's category is the dominant pillar of its tasks, computed
 * server-side. Tapping a quest opens the normal quest detail to start it.
 */
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { treehouseAPI } from '../../services/api'

const PILLAR_STYLE = {
  art: { emoji: '🎨', ring: 'border-rose-300', chip: 'bg-rose-100 text-rose-700' },
  stem: { emoji: '🔬', ring: 'border-sky-300', chip: 'bg-sky-100 text-sky-700' },
  wellness: { emoji: '🌱', ring: 'border-emerald-300', chip: 'bg-emerald-100 text-emerald-700' },
  communication: { emoji: '💬', ring: 'border-violet-300', chip: 'bg-violet-100 text-violet-700' },
  civics: { emoji: '🤝', ring: 'border-amber-300', chip: 'bg-amber-100 text-amber-700' },
}

function QuestCard({ quest }) {
  return (
    <Link
      to={`/quests/${quest.id}`}
      className="block rounded-2xl bg-white border-2 border-neutral-100 p-4 shadow-sm hover:shadow-md active:scale-[0.99] transition"
    >
      {quest.image_url
        ? <img src={quest.image_url} alt="" className="w-full h-28 object-cover rounded-xl mb-3" />
        : <div className="w-full h-28 rounded-xl mb-3 bg-gradient-to-br from-optio-purple/20 to-optio-pink/20" />}
      <p className="font-bold text-neutral-900 leading-tight">{quest.title}</p>
      {quest.recommended_age && (
        <span className="inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
          Ages {quest.recommended_age}
        </span>
      )}
    </Link>
  )
}

export default function TreehouseBrowsePage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    treehouseAPI.quests()
      .then(({ data }) => setData(data))
      .catch(() => setData({ categories: [], uncategorized: [] }))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-neutral-400 font-poppins">Loading quests…</div>

  const sections = (data?.categories || []).filter(c => c.quests.length > 0)
  const uncategorized = data?.uncategorized || []

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 font-poppins">
      <h1 className="text-3xl font-bold text-neutral-900">Find a Quest 🔭</h1>
      <p className="text-neutral-500 mt-1">Pick something that sounds fun!</p>

      {sections.length === 0 && uncategorized.length === 0 && (
        <p className="text-neutral-400 mt-8">No quests yet — ask your facilitator!</p>
      )}

      {sections.map((cat) => {
        const style = PILLAR_STYLE[cat.pillar] || {}
        return (
          <section key={cat.pillar} className="mt-8">
            <h2 className="text-xl font-bold text-neutral-800 flex items-center gap-2">
              <span aria-hidden>{style.emoji}</span> {cat.label}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-3">
              {cat.quests.map((q) => <QuestCard key={q.id} quest={q} />)}
            </div>
          </section>
        )
      })}

      {uncategorized.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold text-neutral-800">More Quests</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-3">
            {uncategorized.map((q) => <QuestCard key={q.id} quest={q} />)}
          </div>
        </section>
      )}
    </div>
  )
}
