import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * The one email a student gets from a class review.
 *
 * Deciding a task contacts nobody. Every task's feedback is gathered here into
 * a draft the reviewer edits, and Send is the only step that reaches the
 * student: it applies the class decision, puts each task's feedback on the
 * task, and sends this email (backend ClassTaskReviewService.finish).
 *
 * The draft follows the task decisions until the reviewer edits it. After
 * that it is theirs, kept in this browser across reloads, and "Rebuild from
 * task feedback" starts it over.
 */

const draftKey = (questId) => `classReviewEmail:${questId}`

const readDraft = (questId) => {
  try {
    const raw = window.localStorage.getItem(draftKey(questId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const writeDraft = (questId, draft) => {
  try {
    if (draft) window.localStorage.setItem(draftKey(questId), JSON.stringify(draft))
    else window.localStorage.removeItem(draftKey(questId))
  } catch {
    // A draft that does not survive a reload is rebuilt from the tasks.
  }
}

// The draft is a compliment sandwich, in a calm voice: open on something the
// student did well, then what needs work, then close on what is working.
// Positives come from the reviewer's own feedback on accepted tasks first, and
// from the AI's positive note when the reviewer wrote none. **Title** is bold
// in the sent email.

const clean = (text) => (text || '').trim()

// Each AI note is written to stand alone, so most open with the same stock
// praise ("This looks great!", "Really nice work on this!"). Gathered into one
// email that line repeats down the page. Drop a stock opening sentence when
// something specific follows it; the specific part is the compliment.
const STOCK_OPENER = /^(this (looks|is) (great|awesome|excellent|really good)|really (nice|great|good) (work|job)|(great|nice|good|awesome|excellent) (work|job)|well done|love this|amazing work)\b[^.!?]*[.!?]+\s*/i

export const withoutStockOpener = (text) => {
  const note = clean(text)
  const rest = note.replace(STOCK_OPENER, '')
  return rest && rest !== note ? rest.charAt(0).toUpperCase() + rest.slice(1) : note
}

const positiveFor = (task) => {
  if (task.review?.state === 'accepted' && clean(task.review?.feedback)) {
    return withoutStockOpener(task.review.feedback)
  }
  const ai = task.ai?.review?.feedback?.celebrate
  return task.review?.state === 'returned' ? '' : withoutStockOpener(ai)
}

export function composeClassReviewEmail(detail, outcome) {
  const quest = detail?.quest || {}
  const student = detail?.student || {}
  const title = quest.title || 'your class'
  const firstName = student.first_name || student.display_name || 'there'
  const tasks = detail?.tasks || []

  const improvements = tasks.filter(t => t.review?.state === 'returned' && clean(t.review?.feedback))
  const positives = tasks
    .filter(t => t.review?.state !== 'returned')
    .map(t => ({ task: t, note: positiveFor(t) }))
    .filter(p => p.note)
  const [lead, ...morePositives] = positives

  const subject = outcome === 'approve'
    ? `You earned credit for ${title}`
    : `Feedback on your class: ${title}`

  const opening = lead
    ? `Thank you for the work you put into ${title}. Your work on ${lead.task.title} stood out. ${lead.note}`
    : `Thank you for the work you put into ${title}. I can see the time and care you gave it.`

  const block = (task, note) => `**${task.title}**\n${note}`

  const paragraphs = [`Hi ${firstName},`, opening]

  if (outcome === 'approve') {
    paragraphs.push(
      `I reviewed the class and approved it. You earned ${detail?.credits_earned || 0.5} credit in ${quest.transcript_subject_display || 'this subject'} on your transcript. Your evidence portfolio is attached.`)
    if (improvements.length) {
      paragraphs.push('A few things to keep in mind for your next class:')
      improvements.forEach(t => paragraphs.push(block(t, clean(t.review.feedback))))
    }
    if (morePositives.length) {
      paragraphs.push('Some other work I noticed:')
      morePositives.forEach(p => paragraphs.push(block(p.task, p.note)))
    }
    paragraphs.push('This credit reflects steady, careful work. Well done.')
  } else {
    if (improvements.length) {
      paragraphs.push(improvements.length === 1
        ? 'One task needs more work before the class can earn its credit:'
        : 'A few tasks need more work before the class can earn its credit:')
      improvements.forEach(t => paragraphs.push(block(t, clean(t.review.feedback))))
    } else {
      paragraphs.push('The class needs a bit more work before it can earn its credit.')
    }
    if (morePositives.length) {
      paragraphs.push('Some other work that is going well:')
      morePositives.forEach(p => paragraphs.push(block(p.task, p.note)))
    }
    paragraphs.push(
      'Most of this class is in good shape, and these tasks are close. Update them when you are ready, then resubmit the class and I will review it again.')
  }

  return { subject, body: paragraphs.join('\n\n') }
}

const ClassReviewEmail = ({ detail, onSent }) => {
  const confirm = useConfirm()
  const questId = detail.quest.id
  const defaultOutcome = detail.can_approve ? 'approve' : 'send_back'
  const [outcome, setOutcome] = useState(defaultOutcome)
  const [edited, setEdited] = useState(null)
  const [recipients, setRecipients] = useState(null)
  const [sending, setSending] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    const saved = readDraft(questId)
    setEdited(saved)
    setOutcome(saved?.outcome || defaultOutcome)
    setRecipients(null)
    api.get(`/api/admin/class-reviews/${questId}/email-recipients`)
      .then(res => setRecipients(res.data?.data || res.data))
      .catch(() => setRecipients({ to: null, cc: [] }))
    // defaultOutcome is only the starting point for a newly opened class.
  }, [questId])

  // Approve is only offered once every task is accepted.
  const effectiveOutcome = outcome === 'approve' && !detail.can_approve ? 'send_back' : outcome
  const auto = composeClassReviewEmail(detail, effectiveOutcome)
  const subject = edited?.subject ?? auto.subject
  const body = edited?.body ?? auto.body

  const edit = (field, value) => {
    const next = { subject, body, ...edited, outcome: effectiveOutcome, [field]: value }
    setEdited(next)
    writeDraft(questId, next)
  }

  const chooseOutcome = (value) => {
    setOutcome(value)
    if (edited) {
      const next = { ...edited, outcome: value }
      setEdited(next)
      writeDraft(questId, next)
    }
  }

  const rebuild = () => {
    setEdited(null)
    writeDraft(questId, null)
  }

  const studentName = detail.student?.first_name || detail.student?.display_name || 'the student'

  // The identical email, to the reviewer. Changes nothing and tells the
  // student nothing.
  const sendPreview = async () => {
    setPreviewing(true)
    try {
      const res = await api.post(`/api/admin/class-reviews/${questId}/send-preview`, {
        outcome: effectiveOutcome, subject: subject.trim(), body: body.trim(),
      })
      const data = res.data?.data || res.data || {}
      if (data.email_sent === false) {
        toast.error('The draft did not send.')
      } else {
        toast.success(effectiveOutcome === 'approve'
          ? `Draft sent to ${data.to}. The portfolio takes a minute to build.`
          : `Draft sent to ${data.to}.`)
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'The draft did not send.')
    } finally {
      setPreviewing(false)
    }
  }

  const send = async () => {
    const ok = await confirm({
      title: effectiveOutcome === 'approve'
        ? `Approve the class and email ${studentName}?`
        : `Send the class back and email ${studentName}?`,
      body: recipients?.to ? `To ${[recipients.to, ...(recipients.cc || [])].join(', ')}` : undefined,
      confirmLabel: 'Send',
      destructive: false,
    })
    if (!ok) return
    setSending(true)
    try {
      const res = await api.post(`/api/admin/class-reviews/${questId}/send`, {
        outcome: effectiveOutcome, subject: subject.trim(), body: body.trim(),
      })
      writeDraft(questId, null)
      const emailSent = (res.data?.data || res.data)?.email_sent
      if (emailSent === false) {
        toast.error('The class decision is saved, but the email did not send.')
      } else {
        toast.success(effectiveOutcome === 'approve'
          ? 'Class approved. The email and portfolio are on their way.'
          : 'Class sent back. The email is sent.')
      }
      onSent?.()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const noRecipient = recipients && !recipients.to
  const returned = detail.task_review_counts?.returned || 0

  return (
    <section aria-labelledby="class-review-email-title" className="border-t border-gray-200 pt-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 id="class-review-email-title" className="text-sm font-semibold text-gray-900">Email to {studentName}</h4>
        {edited && (
          <button type="button" onClick={rebuild} className="text-xs font-medium text-optio-purple hover:text-optio-purple-dark">
            Rebuild from task feedback
          </button>
        )}
      </div>

      <div role="radiogroup" aria-label="Outcome" className="flex gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={effectiveOutcome === 'approve'}
          disabled={!detail.can_approve}
          onClick={() => chooseOutcome('approve')}
          className={`px-3 py-1.5 text-sm rounded-md border disabled:opacity-50 ${effectiveOutcome === 'approve' ? 'border-green-600 bg-green-50 text-green-800' : 'border-gray-300 text-gray-700'}`}
        >
          Approve credit
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={effectiveOutcome === 'send_back'}
          onClick={() => chooseOutcome('send_back')}
          className={`px-3 py-1.5 text-sm rounded-md border ${effectiveOutcome === 'send_back' ? 'border-red-500 bg-red-50 text-red-800' : 'border-gray-300 text-gray-700'}`}
        >
          Send class back
        </button>
      </div>
      {!detail.can_approve && (
        <p className="text-xs text-gray-500">
          {returned > 0
            ? 'You sent a task back, so the class goes back to the student to improve and resubmit.'
            : 'Accept every task to approve the class.'}
        </p>
      )}

      <div className="text-xs text-gray-500 break-words">
        {recipients === null ? 'Loading recipients…'
          : noRecipient ? 'No email address on file for this student. Send saves the decision without an email.'
            : <>To {recipients.to}{recipients.cc?.length ? `, cc ${recipients.cc.join(', ')}` : ''}</>}
      </div>

      <label className="block">
        <span className="text-xs font-medium text-gray-700">Subject</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => edit('subject', e.target.value)}
          className="mt-1 w-full text-sm border border-gray-300 rounded-md p-2"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Message</span>
        <textarea
          value={body}
          onChange={(e) => edit('body', e.target.value)}
          className="mt-1 w-full text-sm border border-gray-300 rounded-md p-2 min-h-[240px]"
        />
      </label>
      <p className="text-xs text-gray-400">
        Text between ** and ** shows in bold. The email ends with &ldquo;Best regards, The Optio Team&rdquo;. The message also shows on the student&apos;s class page, and each task&apos;s feedback shows on that task.
      </p>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={sendPreview}
          disabled={previewing || !subject.trim() || !body.trim()}
          className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          {previewing ? 'Sending draft…' : 'Send draft to me'}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={sending || !subject.trim() || !body.trim()}
          className="px-5 py-2 bg-gradient-primary text-white rounded-md disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </section>
  )
}

export default ClassReviewEmail
