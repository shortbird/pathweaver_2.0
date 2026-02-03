import { useState, useEffect } from 'react'
import { ArrowDownTrayIcon, DocumentTextIcon, PencilSquareIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'

const AdvisorNotesModal = ({ subjectId, subjectName, onClose }) => {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newNoteText, setNewNoteText] = useState('')
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchNotes()
  }, [subjectId])

  const fetchNotes = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get(`/api/advisor/notes/${subjectId}`)

      if (response.data.success) {
        setNotes(response.data.notes)
      }
    } catch (err) {
      console.error('Error fetching advisor notes:', err)
      setError('Failed to load notes')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateNote = async () => {
    if (!newNoteText.trim()) return

    try {
      setSubmitting(true)
      const response = await api.post('/api/advisor/notes', {
        subject_id: subjectId,
        note_text: newNoteText.trim()
      })

      if (response.data.success) {
        setNewNoteText('')
        fetchNotes() // Refresh list
      }
    } catch (err) {
      console.error('Error creating note:', err)
      alert('Failed to create note')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateNote = async (noteId) => {
    if (!editingText.trim()) return

    try {
      setSubmitting(true)
      const response = await api.put(`/api/advisor/notes/${noteId}`, {
        note_text: editingText.trim()
      })

      if (response.data.success) {
        setEditingNoteId(null)
        setEditingText('')
        fetchNotes() // Refresh list
      }
    } catch (err) {
      console.error('Error updating note:', err)
      alert('Failed to update note')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteNote = async (noteId) => {
    if (!confirm('Are you sure you want to delete this note? This cannot be undone.')) return

    try {
      await api.delete(`/api/advisor/notes/${noteId}`)
      fetchNotes() // Refresh list
    } catch (err) {
      console.error('Error deleting note:', err)
      alert('Failed to delete note')
    }
  }

  const startEditing = (note) => {
    setEditingNoteId(note.id)
    setEditingText(note.note_text)
  }

  const cancelEditing = () => {
    setEditingNoteId(null)
    setEditingText('')
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-full sm:max-w-2xl mx-2 sm:mx-0 w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <DocumentTextIcon className="h-7 w-7" />
              Advisor Notes
            </h2>
            <p className="text-purple-100 mt-1">Confidential notes for {subjectName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* New Note Input */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Add New Note
            </label>
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Enter your confidential notes here..."
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none resize-none min-h-[120px]"
              rows={4}
              disabled={submitting}
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleCreateNote}
                disabled={!newNoteText.trim() || submitting}
                className="px-4 py-2 bg-optio-purple text-white rounded-lg font-semibold hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 transition-colors min-h-[44px] w-full sm:w-auto"
              >
                <PlusIcon className="h-4 w-4" />
                Add Note
              </button>
            </div>
          </div>

          {/* Notes List */}
          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
                  <div className="h-20 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12">
              <DocumentTextIcon className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium text-lg">No notes yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Add your first note above to get started
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[50vh] overflow-y-auto">
              <h3 className="font-bold text-gray-800 mb-4">Previous Notes ({notes.length})</h3>
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start mb-2">
                    <div>
                      <p className="text-xs text-gray-500">
                        {formatDate(note.created_at)}
                        {note.advisor_name && ` • by ${note.advisor_name}`}
                      </p>
                    </div>
                    {editingNoteId !== note.id && (
                      <div className="flex gap-2 mt-2 sm:mt-0">
                        <button
                          onClick={() => startEditing(note)}
                          className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition-colors"
                          title="Edit note"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                          title="Delete note"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {editingNoteId === note.id ? (
                    <div>
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none resize-none min-h-[120px]"
                        rows={4}
                        disabled={submitting}
                      />
                      <div className="flex flex-col sm:flex-row justify-end gap-2 mt-2">
                        <button
                          onClick={cancelEditing}
                          disabled={submitting}
                          className="px-3 py-1.5 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px] w-full sm:w-auto"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleUpdateNote(note.id)}
                          disabled={!editingText.trim() || submitting}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1 transition-colors min-h-[44px] w-full sm:w-auto"
                        >
                          <ArrowDownTrayIcon className="h-4 w-4" />
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-800 whitespace-pre-wrap">{note.note_text}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 italic">
            <strong>Confidential:</strong> These notes are private and only viewable by you and system administrators.
          </p>
        </div>
      </div>
    </div>
  )
}

export default AdvisorNotesModal
