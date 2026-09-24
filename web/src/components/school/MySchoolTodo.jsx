import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import TaskCard from '../sis/tasks/TaskCard'
import { taskApi } from '../../hooks/api/useTasks'

/**
 * A student's To do, on their /school page: the tasks the school assigned
 * them, done in place.
 *
 * The office assigns tasks to students since 2026-09-24 (iCreate meeting
 * 2026-09-23) -- one-off ("bring your field trip form back signed") or
 * repeating ("M/W/F: clean the art table"). A student has no SIS console and
 * no family To do, so this list is where theirs lands; the notification a
 * student gets links to /school?task=<id>, which opens onto the task.
 *
 * Reads the self-scoped /api/sis/tasks/mine?audience=student. Anybody who is
 * not a student holds no student tasks, so the list is empty and the card
 * renders nothing -- the same rule as MySchoolTraining beside it. A school
 * with both the tasks and the onboarding blocks off answers 404
 * (routes/sis/tasks.py), which also renders nothing.
 */
const MySchoolTodo = () => {
  const [searchParams] = useSearchParams()
  const openTaskId = searchParams.get('task')
  const [tasks, setTasks] = useState([])
  const [statement, setStatement] = useState(null)

  const load = useCallback(() => {
    api.get('/api/sis/tasks/mine?audience=student')
      .then(({ data }) => {
        if (!data?.success) return
        setTasks(data.tasks || [])
        setStatement(data.signature_statement || null)
      })
      .catch(() => { /* module off, or not a student: nothing to show */ })
  }, [])

  useEffect(() => { load() }, [load])

  if (tasks.length === 0) return null

  return (
    <section aria-label="To do"
      className="mb-4 bg-white border border-gray-200 rounded-xl px-3.5 py-3 sm:px-5 sm:py-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-9 h-9 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0">
          <ClipboardDocumentListIcon className="w-5 h-5 text-optio-purple" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">To do</h2>
          <p className="text-xs text-gray-500">What your school asked you to do. Tick each step when it is done.</p>
        </div>
      </div>
      <ul className="space-y-3">
        {tasks.map((t) => (
          <li key={t.id}>
            <TaskCard task={t} api={taskApi} statement={statement} onChanged={load}
              highlighted={openTaskId === t.id} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export default MySchoolTodo
