import React, { useState } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

const PILLARS = [
  { value: 'stem', label: 'STEM', color: 'blue' },
  { value: 'wellness', label: 'Wellness', color: 'green' },
  { value: 'communication', label: 'Communication', color: 'purple' },
  { value: 'civics', label: 'Civics', color: 'red' },
  { value: 'art', label: 'Art', color: 'pink' }
]

const CourseImportEditor = ({ previewData, onBack, onImportComplete }) => {
  const [quest, setQuest] = useState({
    title: previewData.quest_preview.title,
    description: previewData.quest_preview.description || '',
    cover_image: null
  })

  const [tasks, setTasks] = useState(
    previewData.tasks_preview.map(task => ({
      ...task,
      pillar: task.pillar || 'stem'
    }))
  )

  const [searchingImage, setSearchingImage] = useState(false)
  const [importing, setImporting] = useState(false)

  const handleQuestChange = (field, value) => {
    setQuest(prev => ({ ...prev, [field]: value }))
  }

  const handleTaskChange = (index, field, value) => {
    setTasks(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const handleSearchImage = async () => {
    if (!quest.title.trim()) {
      toast.error('Please enter a quest title first')
      return
    }

    setSearchingImage(true)
    try {
      const response = await api.post('/api/images/search-quest', {
        quest_title: quest.title,
        quest_description: quest.description
      })

      if (response.data.image_url) {
        setQuest(prev => ({ ...prev, cover_image: response.data.image_url }))
        toast.success('Cover image found!')
      } else {
        toast.error('No suitable image found. Try editing the title.')
      }
    } catch (error) {
      console.error('Image search error:', error)
      toast.error('Failed to search for image')
    } finally {
      setSearchingImage(false)
    }
  }

  const handleRemoveTask = (index) => {
    if (tasks.length <= 1) {
      toast.error('Quest must have at least one task')
      return
    }
    setTasks(prev => prev.filter((_, i) => i !== index))
  }

  const handleImport = async () => {
    // Validation
    if (!quest.title.trim()) {
      toast.error('Quest title is required')
      return
    }

    if (tasks.length === 0) {
      toast.error('Quest must have at least one task')
      return
    }

    const invalidTasks = tasks.filter(t => !t.title.trim() || t.xp_value <= 0)
    if (invalidTasks.length > 0) {
      toast.error('All tasks must have a title and XP value greater than 0')
      return
    }

    setImporting(true)
    try {
      const response = await api.post('/api/admin/courses/import/confirm', {
        quest: {
          title: quest.title,
          description: quest.description,
          cover_image: quest.cover_image,
          quest_type: 'course',
          lms_platform: 'canvas',
          lms_course_id: previewData.quest_preview.lms_course_id,
          is_active: false,
          is_public: false,
          metadata: {
            ...previewData.quest_preview.metadata,
            imported_at: new Date().toISOString()
          }
        },
        tasks: tasks.map((task, idx) => ({
          title: task.title,
          description: task.description,
          pillar: task.pillar,
          xp_value: task.xp_value,
          order_index: idx + 1,
          is_required: true,
          is_manual: false,
          metadata: task.metadata
        }))
      })

      if (response.data.success) {
        toast.success(`Quest "${quest.title}" imported successfully!`)
        onImportComplete(response.data.quest_id)
      } else {
        toast.error(response.data.error || 'Failed to import quest')
      }
    } catch (error) {
      console.error('Import error:', error)
      toast.error(error.response?.data?.error || 'Failed to import quest')
    } finally {
      setImporting(false)
    }
  }

  const totalXP = tasks.reduce((sum, task) => sum + task.xp_value, 0)

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <button
          onClick={onBack}
          className="text-gray-600 hover:text-gray-900 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Upload
        </button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Course Quest</h1>
        <p className="text-gray-600">
          Customize the quest details before importing. All fields are editable.
        </p>
      </div>

      <div className="space-y-6">
        {/* Quest Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Quest Details</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quest Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={quest.title}
                onChange={(e) => handleQuestChange('title', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                placeholder="Enter quest title..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quest Description
              </label>
              <textarea
                value={quest.description}
                onChange={(e) => handleQuestChange('description', e.target.value)}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                placeholder="Enter quest description..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cover Image
              </label>
              {quest.cover_image ? (
                <div className="relative">
                  <img
                    src={quest.cover_image}
                    alt={`Cover image for quest: ${quest.title}`}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <button
                    onClick={() => handleQuestChange('cover_image', null)}
                    className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <p className="text-gray-500 mb-4">No cover image selected</p>
                  <button
                    onClick={handleSearchImage}
                    disabled={searchingImage || !quest.title.trim()}
                    className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {searchingImage ? 'Searching...' : 'Search for Image'}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-semibold text-blue-900">Quest Summary</p>
              </div>
              <p className="text-sm text-blue-800">
                <span className="font-medium">{tasks.length}</span> tasks ·
                <span className="font-medium"> {totalXP} XP</span> total ·
                Imported from Canvas
              </p>
            </div>
          </div>
        </div>

        {/* Tasks List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Tasks ({tasks.length})
          </h2>

          <div className="space-y-4">
            {tasks.map((task, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-lg p-4 hover:border-optio-purple transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <span className="inline-block w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium text-gray-600">
                      {index + 1}
                    </span>
                  </div>

                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Task Title
                      </label>
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) => handleTaskChange(index, 'title', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Description
                      </label>
                      <textarea
                        value={task.description}
                        onChange={(e) => handleTaskChange(index, 'description', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Pillar
                        </label>
                        <select
                          value={task.pillar}
                          onChange={(e) => handleTaskChange(index, 'pillar', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                        >
                          {PILLARS.map(pillar => (
                            <option key={pillar.value} value={pillar.value}>
                              {pillar.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          XP Value
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={task.xp_value}
                          onChange={(e) => handleTaskChange(index, 'xp_value', parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveTask(index)}
                    className="flex-shrink-0 text-red-600 hover:text-red-700 p-2"
                    title="Remove task"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div>
            <p className="text-sm text-gray-600">
              Ready to import <span className="font-semibold">{tasks.length} tasks</span> worth <span className="font-semibold">{totalXP} XP</span>
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || !quest.title.trim() || tasks.length === 0}
              className="px-8 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? 'Importing...' : 'Import Quest'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CourseImportEditor
