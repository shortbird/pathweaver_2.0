import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import MarkdownEditor from '../../components/curriculum/MarkdownEditor'
import IframeEmbed from '../../components/curriculum/IframeEmbed'
import FileUploader from '../../components/curriculum/FileUploader'
import ReactMarkdown from 'react-markdown'

const CurriculumBuilder = () => {
  const { questId } = useParams()
  const navigate = useNavigate()

  // State
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [quest, setQuest] = useState(null)
  const [markdownContent, setMarkdownContent] = useState('')
  const [embeds, setEmbeds] = useState([])
  const [attachments, setAttachments] = useState([])
  const [showPreview, setShowPreview] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Auto-save timer
  const [autoSaveTimer, setAutoSaveTimer] = useState(null)

  // Load quest and curriculum data
  useEffect(() => {
    const fetchQuestCurriculum = async () => {
      try {
        setLoading(true)
        const response = await api.get(`/api/curriculum/${questId}`)
        const data = response.data

        setQuest(data.quest)

        // Parse curriculum content
        if (data.quest.curriculum_content) {
          const content = data.quest.curriculum_content
          setMarkdownContent(content.markdown || '')
          setEmbeds(content.embeds || [])
        }

        // Load attachments
        setAttachments(data.attachments || [])
      } catch (error) {
        console.error('Failed to load curriculum:', error)
        toast.error('Failed to load curriculum data')
      } finally {
        setLoading(false)
      }
    }

    if (questId) {
      fetchQuestCurriculum()
    }
  }, [questId])

  // Auto-save on content change (debounced)
  useEffect(() => {
    if (!hasUnsavedChanges) return

    // Clear existing timer
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
    }

    // Set new timer for 3 seconds
    const timer = setTimeout(() => {
      handleSave(true) // true = auto-save (silent)
    }, 3000)

    setAutoSaveTimer(timer)

    return () => clearTimeout(timer)
  }, [markdownContent, embeds, hasUnsavedChanges])

  // Mark as unsaved when content changes
  useEffect(() => {
    setHasUnsavedChanges(true)
  }, [markdownContent, embeds])

  const handleSave = async (isAutoSave = false) => {
    try {
      setSaving(true)

      const curriculumData = {
        markdown: markdownContent,
        embeds: embeds,
        version: (quest?.curriculum_version || 0) + 1
      }

      await api.put(`/api/curriculum/${questId}`, {
        curriculum_content: curriculumData
      })

      setHasUnsavedChanges(false)

      if (!isAutoSave) {
        toast.success('Curriculum saved successfully')
      }
    } catch (error) {
      console.error('Save error:', error)
      if (!isAutoSave) {
        toast.error('Failed to save curriculum')
      }
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    try {
      await handleSave()
      toast.success('Curriculum published')
      navigate(`/quests/${questId}`)
    } catch (error) {
      console.error('Publish error:', error)
      toast.error('Failed to publish curriculum')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(-1)}
                className="text-gray-600 hover:text-gray-900"
                aria-label="Go back"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Curriculum Builder</h1>
                <p className="text-sm text-gray-600">{quest?.title || 'Loading...'}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {hasUnsavedChanges && (
                <span className="text-sm text-gray-600">Unsaved changes</span>
              )}
              {saving && (
                <span className="text-sm text-optio-purple">Saving...</span>
              )}
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {showPreview ? 'Edit Mode' : 'Preview'}
              </button>
              <button
                onClick={() => handleSave(false)}
                disabled={saving || !hasUnsavedChanges}
                className="px-4 py-2 text-sm font-medium text-white bg-optio-purple rounded-lg hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Draft
              </button>
              <button
                onClick={handlePublish}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {showPreview ? (
          /* Preview Mode */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Student View Preview</h2>

            {/* Markdown Content */}
            {markdownContent && (
              <div className="prose prose-lg max-w-none mb-8">
                <ReactMarkdown>{markdownContent}</ReactMarkdown>
              </div>
            )}

            {/* Embeds */}
            {embeds.length > 0 && (
              <div className="space-y-6 mb-8">
                {embeds.map(embed => (
                  <div key={embed.id}>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">{embed.title}</h3>
                    <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                      <iframe
                        src={embed.url}
                        title={embed.title}
                        className="w-full h-full"
                        allowFullScreen
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Attachments */}
            {attachments.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Download Materials</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {attachments.map(attachment => (
                    <a
                      key={attachment.id}
                      href={attachment.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <svg className="w-8 h-8 text-optio-purple mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{attachment.file_name}</p>
                        <p className="text-xs text-gray-500">
                          {(attachment.file_size_bytes / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {!markdownContent && embeds.length === 0 && attachments.length === 0 && (
              <p className="text-gray-500 italic">No curriculum content yet. Switch to Edit Mode to start building.</p>
            )}
          </div>
        ) : (
          /* Edit Mode */
          <div className="space-y-8">
            {/* Markdown Editor Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Curriculum Content</h2>
              <MarkdownEditor
                value={markdownContent}
                onChange={setMarkdownContent}
                placeholder="Write your curriculum content here. Use the toolbar for formatting, or write markdown directly."
              />
            </div>

            {/* Embeds Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <IframeEmbed
                embeds={embeds}
                onChange={setEmbeds}
              />
            </div>

            {/* File Attachments Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <FileUploader
                questId={questId}
                attachments={attachments}
                onChange={setAttachments}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CurriculumBuilder
