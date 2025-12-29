import React, { useState, useRef, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import { toast } from 'react-hot-toast'
import { ArrowUpTrayIcon, TrashIcon, PlayIcon } from '@heroicons/react/24/outline'
import api from '../services/api'

// Helper to extract HTML from blocks structure (backend stores content as blocks)
const getLessonHtmlContent = (content) => {
  if (!content) return ''
  // If it's already a string (HTML), return as-is
  if (typeof content === 'string') return content
  // If it's a blocks structure, extract HTML from text blocks
  if (content.blocks && Array.isArray(content.blocks)) {
    return content.blocks
      .filter(block => block.type === 'text')
      .map(block => block.content || '')
      .join('')
  }
  return ''
}

const LessonEditor = ({
  questId,
  lesson = null,
  onSave,
  onCancel,
}) => {
  // Debug: log what content is being loaded
  console.log('[LessonEditor] Loading lesson:', {
    id: lesson?.id,
    rawContent: lesson?.content,
    extractedHtml: getLessonHtmlContent(lesson?.content)
  })

  const [title, setTitle] = useState(lesson?.title || '')
  const [order, setOrder] = useState(lesson?.order || 1)
  const [xpThreshold, setXpThreshold] = useState(lesson?.xp_threshold || 0)
  const [videoUrl, setVideoUrl] = useState(lesson?.video_url || '')
  const [files, setFiles] = useState(lesson?.files || [])
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: 'Write your lesson content here...',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-optio-purple underline hover:text-optio-pink transition-colors',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: getLessonHtmlContent(lesson?.content),
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none min-h-[300px] max-w-none p-4',
      },
    },
  })

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file size (25MB max)
    if (file.size > 25 * 1024 * 1024) {
      toast.error('File size exceeds 25MB limit')
      return
    }

    try {
      setIsUploading(true)
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.post(
        `/api/quests/${questId}/curriculum/attachments`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )

      const fileUrl = response.data.url || response.data.attachment?.file_url
      if (fileUrl) {
        setFiles([...files, {
          name: file.name,
          url: fileUrl,
          size: file.size,
        }])
        toast.success('File uploaded')
      }
    } catch (error) {
      console.error('Failed to upload file:', error)
      toast.error('Failed to upload file')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveFile = (index) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  const detectVideoEmbed = (url) => {
    if (!url) return null

    // YouTube patterns
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    const youtubeMatch = url.match(youtubeRegex)
    if (youtubeMatch) {
      // Use privacy-enhanced mode and disable related videos from other channels
      return `https://www.youtube-nocookie.com/embed/${youtubeMatch[1]}?rel=0&modestbranding=1`
    }

    // Vimeo patterns
    const vimeoRegex = /vimeo\.com\/(?:video\/)?(\d+)/
    const vimeoMatch = url.match(vimeoRegex)
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`
    }

    // Google Drive patterns - convert share links to embed/preview links
    const driveRegex = /drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/
    const driveMatch = url.match(driveRegex)
    if (driveMatch) {
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`
    }

    return null
  }

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Please enter a lesson title')
      return
    }

    if (!editor) {
      toast.error('Editor not ready')
      return
    }

    // Force editor to sync any pending changes
    editor.commands.blur()

    const content = editor.getHTML()

    // DEBUG: Log content to console
    console.log('[LessonEditor] Raw editor content:', content)
    console.log('[LessonEditor] Content length:', content?.length)

    if (!content || content === '<p></p>') {
      toast.error('Please add lesson content')
      return
    }

    try {
      setIsSaving(true)
      const lessonData = {
        title: title.trim(),
        content,
        sequence_order: order,
        xp_threshold: parseInt(xpThreshold) || 0,
        video_url: videoUrl.trim() || null,
        files: files.length > 0 ? files : null,
      }

      // Debug logging
      console.log('[LessonEditor] Saving lesson data:', {
        questId,
        lessonId: lesson?.id,
        contentLength: content?.length,
        contentPreview: content?.substring(0, 100),
        lessonData
      })

      let response
      if (lesson?.id) {
        // Update existing lesson
        response = await api.put(
          `/api/quests/${questId}/curriculum/lessons/${lesson.id}`,
          lessonData
        )
      } else {
        // Create new lesson
        response = await api.post(
          `/api/quests/${questId}/curriculum/lessons`,
          lessonData
        )
      }

      console.log('[LessonEditor] Save response:', response.data)

      if (response.data.success) {
        toast.success(lesson?.id ? 'Lesson updated' : 'Lesson created')
        onSave?.(response.data.lesson)
      }
    } catch (error) {
      console.error('Failed to save lesson:', error)
      console.error('Error response:', error.response?.data)
      toast.error(error.response?.data?.error || 'Failed to save lesson')
    } finally {
      setIsSaving(false)
    }
  }

  if (!editor) {
    return <div className="p-4">Loading editor...</div>
  }

  const MenuButton = ({ onClick, isActive, disabled, children, title }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        px-3 py-1.5 rounded transition-colors min-w-[36px] h-[32px]
        flex items-center justify-center text-sm font-medium
        ${isActive
          ? 'bg-optio-purple text-white'
          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {children}
    </button>
  )

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('Enter URL:', previousUrl)

    if (url === null) return

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const embedUrl = detectVideoEmbed(videoUrl)

  return (
    <div className="space-y-6">
      {/* Lesson Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Lesson Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter lesson title"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Order
          </label>
          <input
            type="number"
            min="1"
            value={order}
            onChange={(e) => setOrder(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
        </div>
      </div>

      {/* XP Threshold */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          XP Threshold (minimum XP required to unlock)
        </label>
        <input
          type="number"
          min="0"
          value={xpThreshold}
          onChange={(e) => setXpThreshold(e.target.value)}
          placeholder="0"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
        />
        <p className="mt-1 text-xs text-gray-500">
          Leave at 0 for no restrictions. Students need this much XP to access this lesson.
        </p>
      </div>

      {/* Rich Text Editor */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Lesson Content
        </label>
        <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
          {/* Toolbar */}
          <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-300 p-2 flex items-center gap-1 flex-wrap">
            <MenuButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              isActive={editor.isActive('heading', { level: 1 })}
              title="Heading 1"
            >
              <span className="text-lg font-bold">H1</span>
            </MenuButton>

            <MenuButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              isActive={editor.isActive('heading', { level: 2 })}
              title="Heading 2"
            >
              <span className="text-base font-bold">H2</span>
            </MenuButton>

            <MenuButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              isActive={editor.isActive('heading', { level: 3 })}
              title="Heading 3"
            >
              <span className="text-sm font-semibold">H3</span>
            </MenuButton>

            <div className="w-px h-6 bg-gray-300 mx-1" />

            <MenuButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              isActive={editor.isActive('bold')}
              title="Bold (Ctrl+B)"
            >
              <span className="font-bold">B</span>
            </MenuButton>

            <MenuButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              isActive={editor.isActive('italic')}
              title="Italic (Ctrl+I)"
            >
              <span className="italic">I</span>
            </MenuButton>

            <div className="w-px h-6 bg-gray-300 mx-1" />

            <MenuButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              isActive={editor.isActive('bulletList')}
              title="Bullet List"
            >
              <span className="text-lg">•</span>
            </MenuButton>

            <MenuButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              isActive={editor.isActive('orderedList')}
              title="Numbered List"
            >
              <span className="text-sm font-medium">1.</span>
            </MenuButton>

            <div className="w-px h-6 bg-gray-300 mx-1" />

            <MenuButton
              onClick={setLink}
              isActive={editor.isActive('link')}
              title="Add Link (Ctrl+K)"
            >
              <span className="text-sm underline">Link</span>
            </MenuButton>

            <div className="w-px h-6 bg-gray-300 mx-1" />

            <MenuButton
              onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
              title="Clear Formatting"
            >
              <span className="text-sm">Clear</span>
            </MenuButton>

            <div className="ml-auto flex gap-1">
              <MenuButton
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                title="Undo (Ctrl+Z)"
              >
                <span className="text-sm">↶</span>
              </MenuButton>

              <MenuButton
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                title="Redo (Ctrl+Shift+Z)"
              >
                <span className="text-sm">↷</span>
              </MenuButton>
            </div>
          </div>

          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Video URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Video URL (optional)
        </label>
        <input
          type="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="YouTube or Vimeo URL"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
        />
        {embedUrl && (
          <div className="mt-3">
            <div className="aspect-video rounded-lg overflow-hidden bg-gray-100">
              <iframe
                src={embedUrl}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Video preview"
              />
            </div>
            <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
              <PlayIcon className="w-4 h-4" />
              Video detected and will be embedded
            </p>
          </div>
        )}
      </div>

      {/* File Uploads */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Attachments (optional)
        </label>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
        >
          <ArrowUpTrayIcon className="w-4 h-4" />
          {isUploading ? 'Uploading...' : 'Upload File'}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileUpload}
          className="hidden"
          disabled={isUploading}
        />

        {files.length > 0 && (
          <div className="mt-3 space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  {file.size && (
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Remove file"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="mt-2 text-xs text-gray-500">
          Max 25MB per file. Students can download these files.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : lesson?.id ? 'Update Lesson' : 'Create Lesson'}
        </button>
      </div>
    </div>
  )
}

export default LessonEditor
