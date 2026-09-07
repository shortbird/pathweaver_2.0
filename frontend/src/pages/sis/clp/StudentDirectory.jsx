// The left-hand list of families and students. Never rendered in presentation
// mode -- that is the point of presentation mode.
import React from 'react'
import { CheckIcon } from './clpHelpers'

const StudentDirectory = ({
  dirLoading, directory, filteredFamilies, lens, search,
  selectStudent, selectedId, setLens, setSearch,
}) => (
  <div className="w-72 flex-shrink-0">
    <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Search students or families…"
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple mb-2"
    />
    <div className="flex flex-wrap gap-1 mb-3">
      {[
        ['all', 'Everyone', directory.counts?.total],
        ['clp_todo', 'CLP to do', directory.counts?.clp_todo],
        ['clp_done', 'CLP done', directory.counts?.clp_finished],
      ].map(([key, label, count]) => (
        <button key={key} type="button" onClick={() => setLens(key)}
          className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
            lens === key
              ? 'bg-optio-purple/10 border-optio-purple/40 text-optio-purple font-semibold'
              : 'border-gray-200 text-neutral-500 hover:bg-neutral-50'}`}>
          {label}{count != null ? ` · ${count}` : ''}
        </button>
      ))}
    </div>
    <div className="bg-white rounded-xl border border-gray-200 max-h-[calc(100vh-220px)] overflow-y-auto">
      {dirLoading && <p className="text-sm text-neutral-400 p-3">Loading…</p>}
      {!dirLoading && !filteredFamilies.length && <p className="text-sm text-neutral-400 p-3">No students found.</p>}
      {filteredFamilies.map((f) => (
        <div key={f.household_id || f.students[0]?.student_id} className="border-b border-gray-100 last:border-b-0">
          <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            {f.name}{f.student_count > 1 ? ` · ${f.student_count}` : ''}
          </div>
          {f.students.map((stu) => (
            <button
              key={stu.student_id}
              type="button"
              onClick={() => selectStudent(stu.student_id)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                selectedId === stu.student_id ? 'bg-optio-purple/10 text-optio-purple font-semibold' : 'text-neutral-700 hover:bg-[#F3EFF4]'
              }`}
            >
              {stu.name}
              {stu.age != null && <span className="text-xs text-neutral-400 ml-1.5">· {stu.age}</span>}
              {stu.grade_level && <span className="text-xs text-neutral-400 ml-1.5">Grade {stu.grade_level}</span>}
              {stu.clp_finished && <CheckIcon className="w-3.5 h-3.5 text-green-500 inline ml-1.5 align-text-bottom" label="CLP done" />}
            </button>
          ))}
        </div>
      ))}
    </div>
  </div>
)

export default StudentDirectory
