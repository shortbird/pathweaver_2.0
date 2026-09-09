import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { checkinAPI } from '../services/api'

const AdvisorCheckinPage = () => {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const editorRef = useRef(null)

  // Step tracking: 'upload' -> 'review' -> 'sent'
  const [step, setStep] = useState('upload')

  // Upload step state
  const [meetingNotes, setMeetingNotes] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  // Review step state (AI-generated email, editable)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentName, setParentName] = useState('')
  const [advisorName, setAdvisorName] = useState('')
  const [studentName, setStudentName] = useState('')
  const [sending, setSending] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [testSent, setTestSent] = useState(false)

  const handleGenerate = async () => {
    if (!meetingNotes.trim()) {
      setError('Please paste your meeting notes before generating.')
      return
    }

    try {
      setGenerating(true)
      setError(null)

      const response = await checkinAPI.generateEmail(studentId, meetingNotes)

      if (response.data.success) {
        const { email } = response.data
        setEmailSubject(email.subject)
        setEmailBody(email.body)
        setParentEmail(email.parent_email)
        setParentName(email.parent_name)
        setAdvisorName(email.advisor_name)
        setStudentName(email.student_name)
        setStep('review')
      }
    } catch (err) {
      console.error('Error generating email:', err)
      setError(err.response?.data?.error || 'Failed to generate email. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const handleSendEmail = async () => {
    if (!emailBody.trim()) {
      setError('Email body cannot be empty.')
      return
    }

    try {
      setSending(true)
      setError(null)

      const response = await checkinAPI.sendEmail({
        student_id: studentId,
        parent_email: parentEmail,
        subject: emailSubject,
        body: emailBody,
        meeting_notes: meetingNotes
      })

      if (response.data.success) {
        setStep('sent')
      }
    } catch (err) {
      console.error('Error sending email:', err)
      setError(err.response?.data?.error || 'Failed to send email. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleSendTest = async () => {
    if (!emailBody.trim()) {
      setError('Email body cannot be empty.')
      return
    }

    try {
      setSendingTest(true)
      setError(null)

      const response = await checkinAPI.sendEmail({
        student_id: studentId,
        parent_email: parentEmail,
        subject: emailSubject,
        body: emailBody,
        meeting_notes: meetingNotes,
        test: true
      })

      if (response.data.success) {
        setTestSent(true)
      }
    } catch (err) {
      console.error('Error sending test email:', err)
      setError(err.response?.data?.error || 'Failed to send test email.')
    } finally {
      setSendingTest(false)
    }
  }

  const handleBack = () => {
    setStep('upload')
    setError(null)
  }

  const handleDone = () => {
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-primary rounded-t-2xl p-6 text-white">
          <h1 className="text-3xl font-bold mb-1">Check-in Recap</h1>
          <p className="text-white/80 font-medium">
            Upload your meeting notes and send a recap email to the parent
          </p>
        </div>

        <div className="bg-white rounded-b-2xl shadow-lg p-8">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-6">
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          )}

          {/* Step 1: Upload Meeting Notes */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div>
                <label className="block text-gray-800 font-semibold mb-2 text-lg">
                  Meeting Notes
                </label>
                <p className="text-gray-500 text-sm mb-3">
                  Paste your Gemini meeting notes, transcription, or summary below.
                  AI will read these and draft a parent recap email.
                </p>
                <textarea
                  value={meetingNotes}
                  onChange={(e) => setMeetingNotes(e.target.value)}
                  rows={14}
                  className="input-field resize-y font-mono text-sm leading-relaxed"
                  placeholder="Paste your meeting notes here..."
                  autoFocus
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="btn-quiet flex-1 py-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating || !meetingNotes.trim()}
                  className="btn-primary flex-1 py-3"
                >
                  {generating ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating Email...
                    </span>
                  ) : (
                    'Generate Parent Email'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Review & Edit Email */}
          {step === 'review' && (
            <div className="space-y-6">
              {/* Recipient info */}
              <div className="bg-optio-purple/5 border border-optio-purple/20 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 font-medium">To:</span>{' '}
                    <span className="text-gray-800 font-semibold">{parentName}</span>
                    <span className="text-gray-500 ml-1">({parentEmail})</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">From:</span>{' '}
                    <span className="text-gray-800 font-semibold">{advisorName}</span>
                    <span className="text-gray-500 ml-1">(via Optio)</span>
                  </div>
                </div>
              </div>

              {/* Subject line */}
              <div>
                <label className="block text-gray-700 font-semibold mb-2">
                  Subject
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="input-field font-medium"
                />
              </div>

              {/* Email body editor */}
              <div>
                <label className="block text-gray-700 font-semibold mb-2">
                  Email Body
                </label>
                <p className="text-gray-500 text-xs mb-2">
                  Review and edit the AI-generated email below before sending.
                </p>
                <textarea
                  ref={editorRef}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={16}
                  className="input-field resize-y text-sm leading-relaxed"
                />
              </div>

              {/* Test email confirmation */}
              {testSent && (
                <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
                  <p className="text-green-800 font-medium">Test email sent to your inbox. Check it before sending to the parent.</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  className="btn-quiet px-5 py-3"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="btn-quiet px-5 py-3"
                >
                  {generating ? 'Regenerating...' : 'Regenerate'}
                </button>
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={sendingTest || !emailBody.trim()}
                  className="btn-quiet px-5 py-3"
                >
                  {sendingTest ? 'Sending Test...' : 'Send Test to Myself'}
                </button>
                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={sending || !emailBody.trim()}
                  className="btn-primary flex-1 py-3"
                >
                  {sending ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending to Parent...
                    </span>
                  ) : (
                    'Send to Parent'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 'sent' && (
            <div className="text-center py-12 space-y-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Email Sent</h2>
                <p className="text-gray-600">
                  Recap email sent to <span className="font-semibold">{parentName}</span> at{' '}
                  <span className="font-semibold">{parentEmail}</span>.
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  A check-in record has been saved with the meeting notes.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDone}
                className="btn-primary btn-lg"
              >
                Back to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdvisorCheckinPage
