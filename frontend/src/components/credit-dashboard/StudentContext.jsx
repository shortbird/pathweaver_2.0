import React from 'react'

const SUBJECTS = [
  'language_arts', 'math', 'science', 'social_studies', 'financial_literacy',
  'health', 'pe', 'fine_arts', 'cte', 'digital_literacy', 'electives'
]

const SUBJECT_LABELS = {
  language_arts: 'Language Arts',
  math: 'Math',
  science: 'Science',
  social_studies: 'Social Studies',
  financial_literacy: 'Financial Lit',
  health: 'Health',
  pe: 'PE',
  fine_arts: 'Fine Arts',
  cte: 'CTE',
  digital_literacy: 'Digital Lit',
  electives: 'Electives'
}

const XP_PER_CREDIT = 2000
const CREDIT_REQUIREMENTS = {
  language_arts: 4.0, math: 3.0, science: 3.0, social_studies: 3.5,
  financial_literacy: 0.5, health: 0.5, pe: 2.0, fine_arts: 1.5,
  cte: 1.0, digital_literacy: 0.5, electives: 4.0
}

const StudentContext = ({ context, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple" />
      </div>
    )
  }

  if (!context) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
        No student selected
      </div>
    )
  }

  const student = context.student || {}
  const subjectXp = context.subject_xp || []
  const pendingItems = context.pending_items || []
  const recentMerges = context.recent_merges || []
  const recentFlags = context.recent_flags || []

  // Build subject XP map
  const xpMap = {}
  subjectXp.forEach(s => {
    xpMap[s.school_subject] = {
      finalized: s.xp_amount || 0,
      pending: s.pending_xp || 0
    }
  })

  // Calculate total credits
  let totalCredits = 0
  SUBJECTS.forEach(s => {
    const xp = (xpMap[s]?.finalized || 0)
    totalCredits += Math.min(xp / XP_PER_CREDIT, CREDIT_REQUIREMENTS[s] || 0)
  })
  const progressPercent = Math.min(100, (totalCredits / 24) * 100)

  return (
    <div className="p-4 space-y-4">
      {/* Student Info */}
      <div className="flex items-center gap-3">
        {student.avatar_url ? (
          <img src={student.avatar_url} alt="" className="w-10 h-10 rounded-full" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center text-white font-medium text-sm">
            {(student.display_name || '?')[0].toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-medium text-sm text-gray-900">{student.display_name}</p>
          <p className="text-xs text-gray-500">{totalCredits.toFixed(1)} / 24 credits ({progressPercent.toFixed(0)}%)</p>
        </div>
      </div>

      {/* Diploma Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Subject Grid */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Subject Progress</h4>
        <div className="space-y-1.5">
          {SUBJECTS.map(subject => {
            const xp = xpMap[subject]?.finalized || 0
            const pending = xpMap[subject]?.pending || 0
            const required = (CREDIT_REQUIREMENTS[subject] || 0) * XP_PER_CREDIT
            const percent = required > 0 ? Math.min(100, (xp / required) * 100) : 0
            const pendingPercent = required > 0 ? Math.min(100 - percent, (pending / required) * 100) : 0

            return (
              <div key={subject} className="text-xs">
                <div className="flex justify-between mb-0.5">
                  <span className="text-gray-600">{SUBJECT_LABELS[subject]}</span>
                  <span className="text-gray-400">
                    {(xp / XP_PER_CREDIT).toFixed(1)}/{CREDIT_REQUIREMENTS[subject]}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 flex overflow-hidden">
                  <div className="bg-green-500 h-1.5" style={{ width: `${percent}%` }} />
                  {pendingPercent > 0 && (
                    <div className="bg-yellow-400 h-1.5" style={{ width: `${pendingPercent}%` }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pending Items */}
      {pendingItems.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Other Pending Tasks ({pendingItems.length})
          </h4>
          <div className="space-y-1">
            {pendingItems.slice(0, 10).map(item => (
              <div key={item.completion_id} className="flex items-center justify-between text-xs p-1.5 bg-white rounded">
                <span className="text-gray-700 truncate flex-1">{item.task_title}</span>
                <span className="text-gray-400 ml-2">{item.xp_value} XP</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Merges */}
      {recentMerges.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Recent Merges</h4>
          <div className="space-y-1">
            {recentMerges.map(merge => (
              <div key={merge.id} className="text-xs p-1.5 bg-gray-100 rounded">
                <span className="text-gray-600">{merge.final_xp} XP - {merge.merge_reason || 'No reason'}</span>
                <span className="block text-gray-400">{new Date(merge.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Flags */}
      {recentFlags.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Recent Flags</h4>
          <div className="space-y-1">
            {recentFlags.map(flag => (
              <div key={flag.id} className="text-xs p-1.5 bg-orange-50 rounded">
                <span className="text-orange-700">{flag.flag_reason}</span>
                <span className="block text-gray-400">{new Date(flag.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default StudentContext
