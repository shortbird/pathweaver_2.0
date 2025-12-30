import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  PlusIcon,
  TrashIcon,
  Bars3Icon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  RocketLaunchIcon,
  Bars4Icon,
  PhotoIcon,
  SparklesIcon,
  ArrowUpTrayIcon,
  PencilIcon,
  EyeIcon,
  EyeSlashIcon,
  Cog6ToothIcon,
  XMarkIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import courseService from '../../services/courseService'
import CoursePreview from '../../components/CoursePreview'
import CreateQuestModal from '../../components/CreateQuestModal'
import LessonEditor from '../../components/LessonEditor'
import ImageCropModal from '../../components/ImageCropModal'
import LessonPreviewModal from '../../components/curriculum/LessonPreviewModal'
import LessonTaskPanel from '../../components/curriculum/LessonTaskPanel'

// Helper to extract HTML content from lesson content structure
const getLessonHtmlContent = (content) => {
  if (!content) return ''
  // If content is already a string (legacy or raw HTML), return it
  if (typeof content === 'string') return content
  // If content is an object with blocks array, extract text block content
  if (content.blocks && Array.isArray(content.blocks)) {
    return content.blocks
      .filter(block => block.type === 'text')
      .map(block => block.content || '')
      .join('')
  }
  return ''
}

// Cover image component with Pexels search and upload
const CourseCoverImage = ({ coverUrl, onUpdate, courseId, courseTitle, courseDescription, isSaving }) => {
  const [isSearching, setIsSearching] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showCropModal, setShowCropModal] = useState(false)
  const [imageToCrop, setImageToCrop] = useState(null)
  const fileInputRef = React.useRef(null)

  const handleSearchPexels = async () => {
    if (!courseTitle?.trim()) {
      toast.error('Please enter a course title first')
      return
    }

    try {
      setIsSearching(true)
      const response = await api.post('/api/images/search-quest', {
        quest_title: courseTitle,
        quest_description: courseDescription || ''
      })

      if (response.data.success && response.data.image_url) {
        onUpdate(response.data.image_url)
        toast.success('Cover image updated')
      } else {
        toast.error('No suitable image found')
      }
    } catch (error) {
      console.error('Failed to search for cover image:', error)
      toast.error('Failed to find cover image')
    } finally {
      setIsSearching(false)
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB')
      return
    }

    // Create a URL for the image and show crop modal
    const imageUrl = URL.createObjectURL(file)
    setImageToCrop(imageUrl)
    setShowCropModal(true)

    // Clear the input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCropComplete = async (croppedBlob) => {
    setShowCropModal(false)

    // Clean up the object URL
    if (imageToCrop) {
      URL.revokeObjectURL(imageToCrop)
      setImageToCrop(null)
    }

    try {
      setIsUploading(true)
      const formData = new FormData()
      formData.append('image', croppedBlob, 'cover-image.jpg')

      const response = await api.post(`/api/courses/${courseId}/cover-image`, formData)

      if (response.data.success && response.data.url) {
        onUpdate(response.data.url)
        toast.success('Cover image uploaded')
      } else {
        toast.error(response.data.error || 'Failed to upload image')
      }
    } catch (error) {
      console.error('Failed to upload cover image:', error)
      const errorMsg = error.response?.data?.error || error.message || 'Failed to upload image'
      console.error('Server error:', errorMsg)
      toast.error(errorMsg)
    } finally {
      setIsUploading(false)
    }
  }

  const handleCropCancel = () => {
    setShowCropModal(false)
    if (imageToCrop) {
      URL.revokeObjectURL(imageToCrop)
      setImageToCrop(null)
    }
  }

  const isLoading = isSearching || isUploading || isSaving

  return (
    <div className="relative group">
      {/* Cover Image Display */}
      <div className="relative h-64 rounded-xl overflow-hidden bg-gradient-to-r from-optio-purple/20 to-optio-pink/20">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="Course cover"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PhotoIcon className="w-16 h-16 text-gray-300" />
          </div>
        )}

        {/* Overlay with buttons */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
          <button
            onClick={handleSearchPexels}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-sm font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSearching ? (
              <div className="w-4 h-4 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
            ) : (
              <SparklesIcon className="w-4 h-4" />
            )}
            Generate Cover
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-sm font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
            ) : (
              <ArrowUpTrayIcon className="w-4 h-4" />
            )}
            Upload
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Image Crop Modal */}
      <ImageCropModal
        isOpen={showCropModal}
        onClose={handleCropCancel}
        imageSrc={imageToCrop}
        onCropComplete={handleCropComplete}
        aspectRatio={16 / 9}
        title="Crop Cover Image"
      />
    </div>
  )
}

// Sortable quest item component
const SortableQuestItem = ({ quest, isSelected, onSelect, onRemove, onTogglePublish }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: quest.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isPublished = quest.is_published !== false

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(quest)}
      className={`group flex items-center gap-2 p-3 rounded-lg transition-all cursor-pointer ${
        isSelected
          ? 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border-2 border-optio-purple'
          : 'bg-white border border-gray-200 hover:border-optio-purple/50'
      } ${!isPublished ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <Bars3Icon className="w-4 h-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <span className="text-xs font-medium text-gray-500 mt-0.5">
            {quest.order_index + 1}
          </span>
          <h4 className={`font-medium text-sm leading-snug ${isPublished ? 'text-gray-900' : 'text-gray-500'}`}>
            {quest.title || 'Untitled Project'}
          </h4>
          {!isPublished && (
            <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">Draft</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onTogglePublish(quest.id, !isPublished)
        }}
        className={`opacity-0 group-hover:opacity-100 p-1.5 rounded transition-all ${
          isPublished
            ? 'text-green-600 hover:bg-green-50'
            : 'text-gray-400 hover:bg-gray-100'
        }`}
        aria-label={isPublished ? 'Unpublish project' : 'Publish project'}
        title={isPublished ? 'Unpublish project' : 'Publish project'}
      >
        {isPublished ? <EyeIcon className="w-4 h-4" /> : <EyeSlashIcon className="w-4 h-4" />}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(quest.id)
        }}
        className="opacity-0 group-hover:opacity-100 p-1.5 text-red-600 hover:bg-red-50 rounded transition-all"
        aria-label="Remove quest"
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

// Sortable lesson item component
const SortableLessonItem = ({ lesson, isSelected, onSelect, onPreview, onEdit, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = React.useRef(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const taskCount = lesson.linked_task_ids?.length || 0

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect?.(lesson)}
      className={`relative flex items-center gap-3 p-3 rounded-lg border transition-colors group cursor-pointer ${
        isSelected
          ? 'border-optio-purple bg-optio-purple/5'
          : 'border-gray-200 hover:border-optio-purple/50'
      }`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <Bars3Icon className="w-4 h-4" />
      </button>
      <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-optio-purple/10 text-optio-purple rounded-full text-xs font-medium">
        {lesson.sequence_order || lesson.order || 1}
      </span>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-gray-900 truncate">
          {lesson.title}
        </h4>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {taskCount > 0 && (
            <span>{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
          )}
          {taskCount > 0 && lesson.xp_threshold > 0 && (
            <span className="text-gray-300">|</span>
          )}
          {lesson.xp_threshold > 0 && (
            <span>{lesson.xp_threshold} XP to complete</span>
          )}
        </div>
      </div>
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen(!menuOpen)
          }}
          className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
          aria-label="Lesson options"
        >
          <EllipsisVerticalIcon className="w-5 h-5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[100px]">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                onPreview(lesson)
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Preview
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                onEdit(lesson)
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                onDelete(lesson)
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Add quest modal component
const AddQuestModal = ({ isOpen, onClose, onAddQuest, organizationId, existingQuestIds = [] }) => {
  const [loading, setLoading] = useState(false)
  const [quests, setQuests] = useState([])
  const [selectedQuestId, setSelectedQuestId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchQuests()
    }
  }, [isOpen])

  const fetchQuests = async () => {
    try {
      setLoading(true)
      // Fetch all available quests - backend handles organization visibility automatically
      const response = await api.get('/api/quests', {
        params: {
          per_page: 100  // Get more quests
        }
      })
      // Filter out quests already in the course
      const availableQuests = (response.data.quests || response.data.data || []).filter(
        q => !existingQuestIds.includes(q.id)
      )
      setQuests(availableQuests)
    } catch (error) {
      console.error('Failed to fetch quests:', error)
      toast.error('Failed to load quests')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    if (selectedQuestId) {
      const quest = quests.find(q => q.id === selectedQuestId)
      onAddQuest(quest)
      setSelectedQuestId(null)
    }
  }

  const handleCreateSuccess = (newQuest) => {
    setShowCreateModal(false)
    // Add the new quest directly
    onAddQuest(newQuest)
  }

  // Filter quests by search term
  const filteredQuests = quests.filter(quest =>
    quest.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    quest.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Project to Course</h2>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
              >
                <PlusIcon className="w-4 h-4" />
                Create New Quest
              </button>
            </div>
            {/* Search input */}
            <div className="mt-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search quests..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
              </div>
            ) : filteredQuests.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="mb-4">
                  {searchTerm ? 'No quests match your search.' : 'No quests available.'}
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="text-optio-purple hover:underline"
                >
                  Create a new quest to add as a project
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredQuests.map(quest => (
                  <button
                    key={quest.id}
                    onClick={() => setSelectedQuestId(quest.id)}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      selectedQuestId === quest.id
                        ? 'border-optio-purple bg-optio-purple/5'
                        : 'border-gray-200 hover:border-optio-purple/50'
                    }`}
                  >
                    <h3 className="font-medium text-gray-900">{quest.title}</h3>
                    {quest.description && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{quest.description}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!selectedQuestId}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Project
            </button>
          </div>
        </div>
      </div>

      {/* Create Quest Modal */}
      {showCreateModal && (
        <CreateQuestModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </>
  )
}

// Lesson Editor Modal - full screen modal for editing lessons
const LessonEditorModal = ({ isOpen, questId, lesson, onSave, onClose }) => {
  const editorRef = React.useRef(null)

  const handleClose = () => {
    // Fire autosave in background and close immediately
    if (editorRef.current?.save) {
      editorRef.current.save()
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white w-full h-full md:w-[95vw] md:h-[95vh] md:max-w-7xl md:rounded-xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">
            {lesson ? 'Edit Lesson' : 'New Lesson'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <LessonEditor
            ref={editorRef}
            questId={questId}
            lesson={lesson}
            onSave={onSave}
            onCancel={handleClose}
          />
        </div>
      </div>
    </div>
  )
}

// Course Details Modal (edit title, description, cover image)
const CourseDetailsModal = ({ isOpen, onClose, course, courseId, onUpdate, isSaving }) => {
  const [localTitle, setLocalTitle] = useState(course?.title || '')
  const [localDescription, setLocalDescription] = useState(course?.description || '')

  useEffect(() => {
    if (course) {
      setLocalTitle(course.title || '')
      setLocalDescription(course.description || '')
    }
  }, [course])

  const handleSave = () => {
    onUpdate({
      title: localTitle,
      description: localDescription
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Course Details</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Cover Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cover Image
            </label>
            <CourseCoverImage
              coverUrl={course?.cover_image_url}
              onUpdate={(url) => onUpdate({ cover_image_url: url })}
              courseId={courseId}
              courseTitle={localTitle}
              courseDescription={localDescription}
              isSaving={isSaving}
            />
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Course Title
            </label>
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              placeholder="Enter course title"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
              placeholder="Describe what students will learn..."
            />
          </div>

          {/* Status Badge */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              course?.status === 'published' ? 'bg-green-100 text-green-700' :
              course?.status === 'archived' ? 'bg-gray-100 text-gray-600' :
              'bg-yellow-100 text-yellow-700'
            }`}>
              {course?.status || 'draft'}
            </span>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

const CourseBuilder = () => {
  const { id: courseId } = useParams()
  const navigate = useNavigate()
  const isNewCourse = courseId === 'new' || !courseId

  // State
  const [loading, setLoading] = useState(!isNewCourse)
  const [course, setCourse] = useState(isNewCourse ? { title: '', description: '', status: 'draft' } : null)
  const [quests, setQuests] = useState([])
  const [selectedQuest, setSelectedQuest] = useState(null)
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [lessons, setLessons] = useState([])
  const [loadingLessons, setLoadingLessons] = useState(false)
  const [showLessons, setShowLessons] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('saved') // 'saved', 'saving', 'error'
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [showAddQuestModal, setShowAddQuestModal] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showCourseDetails, setShowCourseDetails] = useState(false)
  const [editingLesson, setEditingLesson] = useState(null) // null = not editing, 'new' = creating, or lesson object
  const [showLessonEditor, setShowLessonEditor] = useState(false)
  const [previewingLesson, setPreviewingLesson] = useState(null) // Lesson to preview

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Fetch course and quests (only for existing courses)
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // Fetch course info
        const courseResponse = await courseService.getCourseById(courseId)
        setCourse(courseResponse.course)

        // Fetch course quests
        const questsResponse = await api.get(`/api/courses/${courseId}/quests`)
        const fetchedQuests = questsResponse.data.quests || []
        setQuests(fetchedQuests)

        // Select first quest if available
        if (fetchedQuests.length > 0) {
          setSelectedQuest(fetchedQuests[0])
        }
      } catch (error) {
        console.error('Failed to load course:', error)
        toast.error('Failed to load course data')
      } finally {
        setLoading(false)
      }
    }

    if (courseId && !isNewCourse) {
      fetchData()
    }
  }, [courseId, isNewCourse])

  // Fetch lessons when selectedQuest changes
  useEffect(() => {
    const fetchLessons = async () => {
      if (!selectedQuest?.id) {
        setLessons([])
        setSelectedLesson(null)
        return
      }

      try {
        setLoadingLessons(true)
        setSelectedLesson(null) // Clear selected lesson when quest changes
        // Fetch from curriculum/lessons endpoint (curriculum_lessons table), not /curriculum (legacy JSON)
        const response = await api.get(`/api/quests/${selectedQuest.id}/curriculum/lessons`)
        const fetchedLessons = response.data.lessons || []
        setLessons(fetchedLessons)
        // Auto-select first lesson if available
        if (fetchedLessons.length > 0) {
          setSelectedLesson(fetchedLessons[0])
        }
      } catch (error) {
        console.error('Failed to load lessons:', error)
        toast.error('Failed to load lessons')
        setLessons([])
      } finally {
        setLoadingLessons(false)
      }
    }

    fetchLessons()
  }, [selectedQuest?.id])

  // Create new course
  const handleCreateCourse = async () => {
    if (!course.title?.trim()) {
      toast.error('Please enter a course title')
      return
    }

    try {
      setIsCreating(true)
      const response = await courseService.createCourse({
        title: course.title,
        description: course.description || ''
      })

      toast.success('Course created!')
      // Navigate to edit the new course
      navigate(`/courses/${response.course.id}/edit`, { replace: true })
    } catch (error) {
      console.error('Failed to create course:', error)
      toast.error('Failed to create course')
    } finally {
      setIsCreating(false)
    }
  }

  // Update course metadata
  const handleUpdateCourse = useCallback(async (updates) => {
    try {
      setSaveStatus('saving')
      await courseService.updateCourse(courseId, updates)

      // Update local state
      setCourse(prev => ({ ...prev, ...updates }))

      setSaveStatus('saved')
    } catch (error) {
      console.error('Failed to update course:', error)
      setSaveStatus('error')
      toast.error('Failed to save changes')
    }
  }, [courseId])

  // Add quest to course
  const handleAddQuest = async (quest) => {
    try {
      setSaving(true)
      await courseService.addQuestToCourse(courseId, quest.id, {
        sequence_order: quests.length
      })

      const updatedQuest = { ...quest, order_index: quests.length }
      setQuests([...quests, updatedQuest])
      setSelectedQuest(updatedQuest)
      setShowAddQuestModal(false)
      toast.success('Project added to course')
    } catch (error) {
      console.error('Failed to add quest:', error)
      toast.error('Failed to add quest')
    } finally {
      setSaving(false)
    }
  }

  // Remove quest from course
  const handleRemoveQuest = async (questId) => {
    if (!confirm('Are you sure you want to remove this project from the course?')) return

    try {
      setSaving(true)
      await courseService.removeQuestFromCourse(courseId, questId)

      const updatedQuests = quests.filter(q => q.id !== questId)
      setQuests(updatedQuests)

      if (selectedQuest?.id === questId) {
        setSelectedQuest(updatedQuests[0] || null)
      }

      toast.success('Project removed from course')
    } catch (error) {
      console.error('Failed to remove quest:', error)
      toast.error('Failed to remove quest')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleQuestPublish = async (questId, isPublished) => {
    try {
      await api.put(`/api/courses/${courseId}/quests/${questId}`, {
        is_published: isPublished
      })

      // Update local state
      setQuests(quests.map(q =>
        q.id === questId ? { ...q, is_published: isPublished } : q
      ))

      if (selectedQuest?.id === questId) {
        setSelectedQuest({ ...selectedQuest, is_published: isPublished })
      }

      toast.success(isPublished ? 'Project published' : 'Project unpublished')
    } catch (error) {
      console.error('Failed to toggle project publish status:', error)
      toast.error('Failed to update project')
    }
  }

  // Reorder quests via drag and drop
  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = quests.findIndex(q => q.id === active.id)
    const newIndex = quests.findIndex(q => q.id === over.id)
    const reorderedQuests = arrayMove(quests, oldIndex, newIndex)

    // Update order_index for each quest
    const questsWithNewOrder = reorderedQuests.map((q, idx) => ({
      ...q,
      order_index: idx
    }))

    // Optimistic update
    setQuests(questsWithNewOrder)

    // Update selectedQuest if it was reordered
    if (selectedQuest) {
      const updatedSelected = questsWithNewOrder.find(q => q.id === selectedQuest.id)
      if (updatedSelected) {
        setSelectedQuest(updatedSelected)
      }
    }

    try {
      await courseService.reorderQuests(
        courseId,
        questsWithNewOrder.map(q => q.id)
      )
    } catch (error) {
      console.error('Failed to reorder quests:', error)
      toast.error('Failed to save project order')
      // Revert on error
      setQuests(quests)
    }
  }

  // Reorder lessons via drag and drop
  const handleLessonDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = lessons.findIndex(l => l.id === active.id)
    const newIndex = lessons.findIndex(l => l.id === over.id)
    const reorderedLessons = arrayMove(lessons, oldIndex, newIndex)

    // Update sequence_order for each lesson
    const lessonsWithNewOrder = reorderedLessons.map((l, idx) => ({
      ...l,
      sequence_order: idx + 1,
      order: idx + 1
    }))

    // Optimistic update
    setLessons(lessonsWithNewOrder)

    try {
      await api.put(`/api/quests/${selectedQuest.id}/curriculum/lessons/reorder`, {
        lesson_order: lessonsWithNewOrder.map(l => l.id)
      })
    } catch (error) {
      console.error('Failed to reorder lessons:', error)
      toast.error('Failed to save lesson order')
      // Revert on error
      setLessons(lessons)
    }
  }

  // Handle lesson delete
  const handleDeleteLesson = async (lesson) => {
    if (!confirm('Delete this lesson?')) return
    try {
      await api.delete(`/api/quests/${selectedQuest.id}/curriculum/lessons/${lesson.id}`)
      setLessons(lessons.filter(l => l.id !== lesson.id))
      toast.success('Lesson deleted')
    } catch (error) {
      toast.error('Failed to delete lesson')
    }
  }

  // Publish or unpublish course
  const handlePublishToggle = async () => {
    const isCurrentlyPublished = course?.status === 'published'

    if (isCurrentlyPublished) {
      // Unpublish
      if (!confirm('Are you sure you want to unpublish this course? Students will no longer be able to access it.')) return

      try {
        setIsPublishing(true)
        await courseService.unpublishCourse(courseId)
        setCourse(prev => ({ ...prev, status: 'draft' }))
        toast.success('Course unpublished')
      } catch (error) {
        console.error('Failed to unpublish course:', error)
        toast.error('Failed to unpublish course')
      } finally {
        setIsPublishing(false)
      }
    } else {
      // Publish
      if (!confirm('Are you sure you want to publish this course? This will create a badge for course completion.')) return

      try {
        setIsPublishing(true)
        await courseService.publishCourse(courseId)
        setCourse(prev => ({ ...prev, status: 'published' }))
        toast.success('Course published! A completion badge has been created.')
      } catch (error) {
        console.error('Failed to publish course:', error)
        toast.error('Failed to publish course')
      } finally {
        setIsPublishing(false)
      }
    }
  }

  // Save status indicator
  const SaveStatusIndicator = () => {
    if (saveStatus === 'saving') {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-4 h-4 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
          <span>Saving...</span>
        </div>
      )
    }
    if (saveStatus === 'saved') {
      return (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircleIcon className="w-4 h-4" />
          <span>Saved</span>
        </div>
      )
    }
    if (saveStatus === 'error') {
      return (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <ExclamationCircleIcon className="w-4 h-4" />
          <span>Save failed</span>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  // New course creation form
  if (isNewCourse) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/courses')}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Go back to courses"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">Create New Course</h1>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Course Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={course?.title || ''}
                  onChange={(e) => setCourse(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                  placeholder="Enter course title"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={course?.description || ''}
                  onChange={(e) => setCourse(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                  placeholder="Describe what students will learn in this course"
                />
              </div>

              <div className="pt-4">
                <button
                  onClick={handleCreateCourse}
                  disabled={isCreating || !course?.title?.trim()}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isCreating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <PlusIcon className="w-5 h-5" />
                      Create Course
                    </>
                  )}
                </button>
              </div>

              <p className="text-sm text-gray-500 text-center">
                After creating the course, you can add projects and publish it.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Left: Back + Title */}
            <button
              onClick={() => navigate('/courses')}
              className="flex items-center gap-2 sm:gap-3 p-2 -m-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Go back to courses"
            >
              <ChevronLeftIcon className="w-5 h-5 flex-shrink-0" />
              <span className="text-base sm:text-xl font-bold text-gray-900">Course Builder</span>
            </button>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* Save Status */}
              <div className="hidden sm:block">
                <SaveStatusIndicator />
              </div>

              {/* Edit Course Details Button */}
              <button
                onClick={() => setShowCourseDetails(true)}
                className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm"
                aria-label="Edit course details"
              >
                <Cog6ToothIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Details</span>
              </button>

              {/* Mobile Sidebar Toggle */}
              <button
                onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                className="lg:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Toggle sidebar"
              >
                <Bars4Icon className="w-5 h-5" />
              </button>

              {/* Preview Button */}
              <button
                onClick={() => setShowPreview(true)}
                disabled={!course || quests.length === 0}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                aria-label="Preview course"
              >
                <EyeIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Preview</span>
              </button>

              {/* Publish Button */}
              <button
                onClick={handlePublishToggle}
                disabled={isPublishing || !course || (course?.status !== 'published' && quests.length === 0)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium ${
                  course?.status === 'published'
                    ? 'bg-gray-600 text-white hover:bg-gray-700'
                    : 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                }`}
              >
                <RocketLaunchIcon className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {isPublishing ? (course?.status === 'published' ? 'Unpublishing...' : 'Publishing...') : course?.status === 'published' ? 'Unpublish' : 'Publish'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6">
        {/* Course Title Header */}
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
            {course?.title || 'Untitled Course'}
          </h2>
          <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${
            course?.status === 'published' ? 'bg-green-100 text-green-700' :
            course?.status === 'archived' ? 'bg-gray-100 text-gray-600' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {course?.status || 'draft'}
          </span>
        </div>

        <div className="flex gap-6">
          {/* Quest List Sidebar */}
          <div
            className={`
              lg:block lg:w-80 flex-shrink-0
              ${isMobileSidebarOpen ? 'fixed inset-0 z-40 bg-white p-4' : 'hidden'}
            `}
          >
            {/* Mobile close overlay */}
            {isMobileSidebarOpen && (
              <div
                className="fixed inset-0 bg-black/50 -z-10 lg:hidden"
                onClick={() => setIsMobileSidebarOpen(false)}
              />
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-4 h-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Projects ({quests.length})</h2>
                <button
                  onClick={() => setShowAddQuestModal(true)}
                  className="p-2 text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors"
                  aria-label="Add project"
                >
                  <PlusIcon className="w-5 h-5" />
                </button>
              </div>

              {quests.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-sm">No projects in this course yet.</p>
                  <button
                    onClick={() => setShowAddQuestModal(true)}
                    className="mt-3 text-sm text-optio-purple hover:underline"
                  >
                    Add your first project
                  </button>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={quests.map(q => q.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto">
                      {quests.map(quest => (
                        <SortableQuestItem
                          key={quest.id}
                          quest={quest}
                          isSelected={selectedQuest?.id === quest.id}
                          onSelect={setSelectedQuest}
                          onRemove={handleRemoveQuest}
                          onTogglePublish={handleToggleQuestPublish}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          {/* Content Editor */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Selected Quest Details */}
            {selectedQuest && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-gray-900">{selectedQuest.title}</h2>
                    {selectedQuest.description && (
                      <p className="text-sm text-gray-600 mt-1">{selectedQuest.description}</p>
                    )}
                  </div>

                </div>

                {/* Lessons and Tasks Section - Two Column Layout */}
                <div className="border-t border-gray-200 pt-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Column 1: Lessons List */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-medium text-gray-700">
                          Lessons{!loadingLessons && ` (${lessons.length})`}
                        </h3>
                        <button
                          onClick={() => {
                            setEditingLesson(null)
                            setShowLessonEditor(true)
                          }}
                          className="flex items-center gap-1 text-sm text-optio-purple hover:text-optio-pink transition-colors"
                        >
                          <PlusIcon className="w-4 h-4" />
                          Add Lesson
                        </button>
                      </div>

                      {loadingLessons ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-6 h-6 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : lessons.length === 0 ? (
                        <div className="text-center py-8 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-500 mb-3">
                            No lessons yet. Add your first lesson to this project.
                          </p>
                          <button
                            onClick={() => {
                              setEditingLesson(null)
                              setShowLessonEditor(true)
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                          >
                            <PlusIcon className="w-4 h-4" />
                            Add Lesson
                          </button>
                        </div>
                      ) : (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleLessonDragEnd}
                        >
                          <SortableContext
                            items={lessons.sort((a, b) => (a.sequence_order || a.order || 0) - (b.sequence_order || b.order || 0)).map(l => l.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {lessons
                                .sort((a, b) => (a.sequence_order || a.order || 0) - (b.sequence_order || b.order || 0))
                                .map((lesson) => (
                                  <SortableLessonItem
                                    key={lesson.id}
                                    lesson={lesson}
                                    isSelected={selectedLesson?.id === lesson.id}
                                    onSelect={setSelectedLesson}
                                    onPreview={setPreviewingLesson}
                                    onEdit={(l) => {
                                      setEditingLesson(l)
                                      setShowLessonEditor(true)
                                    }}
                                    onDelete={handleDeleteLesson}
                                  />
                                ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </div>

                    {/* Column 2: Tasks for Selected Lesson */}
                    <div className="border-l border-gray-200 pl-4 min-h-[200px]">
                      <LessonTaskPanel
                        lesson={selectedLesson}
                        questId={selectedQuest?.id}
                        questTitle={selectedQuest?.title}
                        questDescription={selectedQuest?.description}
                        onTasksUpdated={async () => {
                          // Refresh lessons to update linked_task_ids
                          try {
                            const response = await api.get(`/api/quests/${selectedQuest.id}/curriculum/lessons`)
                            const fetchedLessons = response.data.lessons || []
                            setLessons(fetchedLessons)
                            // Update selected lesson with fresh data
                            const updatedSelectedLesson = fetchedLessons.find(l => l.id === selectedLesson?.id)
                            if (updatedSelectedLesson) {
                              setSelectedLesson(updatedSelectedLesson)
                            }
                          } catch (error) {
                            console.error('Failed to refresh lessons:', error)
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}


            {/* Empty state when no quests */}
            {quests.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <div className="max-w-sm mx-auto">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Add your first project</h3>
                  <p className="text-gray-500 text-sm mb-4">
                    Courses are made up of projects (quests). Add existing quests or create new ones to build your course.
                  </p>
                  <button
                    onClick={() => setShowAddQuestModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
                  >
                    <PlusIcon className="w-5 h-5" />
                    Add Project
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Quest Modal */}
      <AddQuestModal
        isOpen={showAddQuestModal}
        onClose={() => setShowAddQuestModal(false)}
        onAddQuest={handleAddQuest}
        organizationId={course?.organization_id}
        existingQuestIds={quests.map(q => q.id)}
      />

      {/* Course Preview Modal */}
      {showPreview && (
        <CoursePreview
          course={course}
          quests={quests}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Course Details Modal */}
      <CourseDetailsModal
        isOpen={showCourseDetails}
        onClose={() => setShowCourseDetails(false)}
        course={course}
        courseId={courseId}
        onUpdate={handleUpdateCourse}
        isSaving={saveStatus === 'saving'}
      />

      {/* Lesson Preview Modal */}
      {previewingLesson && (
        <LessonPreviewModal
          lesson={previewingLesson}
          onClose={() => setPreviewingLesson(null)}
          onEdit={(lesson) => {
            setPreviewingLesson(null)
            setEditingLesson(lesson)
            setShowLessonEditor(true)
          }}
        />
      )}

      {/* Lesson Editor Modal */}
      <LessonEditorModal
        isOpen={showLessonEditor}
        questId={selectedQuest?.id}
        lesson={editingLesson}
        onSave={(savedLesson) => {
          if (editingLesson) {
            // Update existing lesson
            setLessons(lessons.map(l => l.id === savedLesson.id ? savedLesson : l))
            if (selectedLesson?.id === savedLesson.id) {
              setSelectedLesson(savedLesson)
            }
          } else {
            // New lesson created - add to list and set as editing lesson for future saves
            setLessons([...lessons, savedLesson])
            setSelectedLesson(savedLesson)
            setEditingLesson(savedLesson)
          }
        }}
        onClose={() => {
          setShowLessonEditor(false)
          setEditingLesson(null)
        }}
      />
    </div>
  )
}

export default CourseBuilder
