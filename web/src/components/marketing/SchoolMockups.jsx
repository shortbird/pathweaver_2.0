import React from 'react'

/**
 * Illustrative product mockups for the For Schools page.
 *
 * These are drawn in markup rather than screenshotted so they stay legible at
 * any width and never go stale against a UI refresh. They are decorative: the
 * numbers are examples, not live data, so the whole set is aria-hidden.
 */

const Card = ({ children, className = '' }) => (
  <div
    aria-hidden="true"
    className={`bg-white rounded-xl border border-gray-200 shadow-lg p-4 sm:p-5 ${className}`}
  >
    {children}
  </div>
)

const Toggle = ({ on }) => (
  <span
    className={`relative inline-block w-9 h-5 rounded-full flex-shrink-0 transition-colors ${
      on ? 'bg-gradient-primary' : 'bg-gray-200'
    }`}
  >
    <span
      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm ${on ? 'right-0.5' : 'left-0.5'}`}
    />
  </span>
)

const MODULES = [
  { name: 'Attendance', on: true },
  { name: 'Tuition & Invoicing', on: true },
  { name: 'Registration', on: true },
  { name: 'Community Hub', on: true },
  { name: 'Timesheets', on: false },
  { name: 'Secure Documents', on: false },
]

export const ModuleToggleMockup = ({ className = '' }) => (
  <Card className={className}>
    <div className="flex items-baseline justify-between mb-4 pb-3 border-b border-gray-100">
      <p className="text-sm font-bold text-gray-900">Modules</p>
      <p className="text-xs text-gray-400 font-medium">Hillside Microschool</p>
    </div>
    <div className="space-y-3">
      {MODULES.map((module) => (
        <div key={module.name} className="flex items-center justify-between gap-4">
          <span className={`text-sm font-medium ${module.on ? 'text-gray-700' : 'text-gray-300 line-through'}`}>
            {module.name}
          </span>
          <Toggle on={module.on} />
        </div>
      ))}
    </div>
    <p className="text-xs text-gray-400 font-medium mt-4 pt-3 border-t border-gray-100 leading-relaxed">
      Modules you switch off vanish from every staff menu.
    </p>
  </Card>
)

export const StudentQuestMockup = ({ className = '' }) => (
  <Card className={className}>
    <p className="text-[10px] font-bold text-optio-purple uppercase tracking-wider mb-1">Quest in progress</p>
    <p className="text-base font-bold text-gray-900 mb-3">Build a Playable Synth</p>

    <div className="flex items-center gap-2 mb-4">
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full w-3/5 rounded-full bg-gradient-primary" />
      </div>
      <span className="text-xs font-semibold text-gray-500">3 of 5</span>
    </div>

    <div className="flex flex-wrap gap-1.5 mb-4">
      <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-optio-purple/10 text-optio-purple">STEM +120 XP</span>
      <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-optio-pink/10 text-optio-pink">Art +80 XP</span>
    </div>

    <div className="space-y-2">
      {[
        { label: 'Research waveforms', done: true },
        { label: 'Wire the keyboard', done: true },
        { label: 'Record a demo track', done: false },
      ].map((task) => (
        <div key={task.label} className="flex items-center gap-2.5">
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
              task.done ? 'bg-optio-purple' : 'border-2 border-gray-200'
            }`}
          >
            {task.done && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </span>
          <span className={`text-xs font-medium ${task.done ? 'text-gray-400' : 'text-gray-700'}`}>
            {task.label}
          </span>
        </div>
      ))}
    </div>
  </Card>
)

export const StaffDashboardMockup = ({ className = '' }) => (
  <Card className={className}>
    <p className="text-sm font-bold text-gray-900 mb-3">Needs attention</p>

    <div className="grid grid-cols-3 gap-2 mb-4">
      {[
        { count: '4', label: 'Not accounted for' },
        { count: '2', label: 'Signatures due' },
        { count: '1', label: 'Waitlist offer' },
      ].map((tile) => (
        <div key={tile.label} className="rounded-lg bg-gradient-to-br from-optio-purple/5 to-optio-pink/5 border border-optio-purple/10 p-2.5">
          <p className="text-lg font-bold text-optio-purple leading-none mb-1">{tile.count}</p>
          <p className="text-[10px] text-gray-500 font-semibold leading-tight">{tile.label}</p>
        </div>
      ))}
    </div>

    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Today</p>
    <div className="space-y-2">
      {[
        { time: '8:30', name: 'Studio Art', room: 'Room 2', taken: false },
        { time: '10:00', name: 'Algebra Lab', room: 'Room 1', taken: true },
      ].map((row) => (
        <div key={row.name} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2">
          <span className="text-xs font-bold text-gray-900 w-10 flex-shrink-0">{row.time}</span>
          <span className="text-xs font-medium text-gray-700 flex-1 truncate">
            {row.name}
            <span className="text-gray-400"> · {row.room}</span>
          </span>
          {row.taken ? (
            <span className="text-[10px] font-semibold text-gray-400 flex-shrink-0">Roll taken</span>
          ) : (
            <span className="text-[10px] font-bold text-white bg-gradient-primary rounded-full px-2.5 py-1 flex-shrink-0">
              Take roll
            </span>
          )}
        </div>
      ))}
    </div>
  </Card>
)

export const FamilyMockup = ({ className = '' }) => (
  <Card className={className}>
    <div className="flex items-center gap-3 mb-4">
      <span className="w-10 h-10 rounded-full bg-gradient-primary text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
        MJ
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-900 leading-tight">Maya</p>
        <p className="text-xs text-gray-400 font-medium">240 XP this week</p>
      </div>
    </div>

    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 mb-4">
      <p className="text-xs font-medium text-gray-700 leading-relaxed">
        Maya added evidence to <span className="font-bold text-gray-900">Bridge Design</span>
      </p>
      <p className="text-[10px] text-gray-400 font-medium mt-1">2 hours ago</p>
    </div>

    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">From your school</p>
    <div className="flex flex-wrap gap-1.5">
      {['Calendar', 'Billing', 'Forms', 'Absences'].map((link) => (
        <span key={link} className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-gray-200 text-gray-600">
          {link}
        </span>
      ))}
    </div>
  </Card>
)

const SUBJECTS = [
  { name: 'Language Arts', earned: 3.5, required: 4 },
  { name: 'Mathematics', earned: 2.5, required: 3 },
  { name: 'Science', earned: 3, required: 3 },
  { name: 'Social Studies', earned: 2, required: 4 },
]

export const TranscriptMockup = ({ className = '' }) => (
  <Card className={className}>
    <div className="flex items-baseline justify-between mb-4 pb-3 border-b border-gray-100">
      <p className="text-sm font-bold text-gray-900">Transcript</p>
      <p className="text-xs text-gray-400 font-medium">Grade 11</p>
    </div>

    <div className="space-y-3">
      {SUBJECTS.map((subject) => (
        <div key={subject.name}>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs font-medium text-gray-700">{subject.name}</span>
            <span className="text-[11px] font-semibold text-gray-400">
              {subject.earned} / {subject.required}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-primary"
              style={{ width: `${(subject.earned / subject.required) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>

    <p className="text-xs text-gray-400 font-medium mt-4 pt-3 border-t border-gray-100">
      24 credits to graduate
    </p>
  </Card>
)
