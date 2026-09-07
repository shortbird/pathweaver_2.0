// The no-print editor for splitting one transfer credit across several named
// courses, so a transcript line reads as the courses a school will recognise.
import React from 'react';

const CourseBreakdownEditor = ({
  addSplitRow, clearSplit, removeSplitRow, saveSplit, setSplitTarget,
  splitCourses, splitSaving, splitTarget, updateSplitRow,
}) => (
  splitTarget && (
    <div className="no-print max-w-5xl mx-auto px-6 pt-4">
      <div className="bg-white rounded-lg border border-emerald-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">
            Break Down: <span className="text-emerald-600">{splitTarget.subjectName}</span>
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({splitTarget.totalCredits} credits total)
            </span>
          </h3>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${
              Math.abs(splitCourses.reduce((s, c) => s + (parseFloat(c.credits) || 0), 0) - splitTarget.totalCredits) <= 0.01
                ? 'text-emerald-600' : 'text-red-500'
            }`}>
              Assigned: {splitCourses.reduce((s, c) => s + (parseFloat(c.credits) || 0), 0).toFixed(2)} / {splitTarget.totalCredits}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {splitCourses.map((course, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={course.name}
                onChange={e => updateSplitRow(idx, 'name', e.target.value)}
                placeholder="Course name (e.g. Woodworking)"
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <input
                type="number"
                step="0.25"
                min="0.25"
                value={course.credits}
                onChange={e => updateSplitRow(idx, 'credits', e.target.value)}
                placeholder="Credits"
                className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
              {splitCourses.length > 1 && (
                <button
                  onClick={() => removeSplitRow(idx)}
                  className="text-gray-400 hover:text-red-500 p-1"
                  title="Remove"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={addSplitRow}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Course
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={clearSplit}
              disabled={splitSaving}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              title="Remove breakdown and show as single row"
            >
              Reset
            </button>
            <button
              onClick={() => setSplitTarget(null)}
              className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={saveSplit}
              disabled={splitSaving}
              className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
            >
              {splitSaving ? 'Saving...' : 'Save Breakdown'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
);

export default CourseBreakdownEditor;
