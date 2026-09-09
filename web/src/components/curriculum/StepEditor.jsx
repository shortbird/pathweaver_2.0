import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import { LinkIcon, PaperClipIcon, XMarkIcon, ArrowUpTrayIcon, PencilIcon, CheckIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

/**
 * Detect if user is on a mobile/touch device
 */
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isSmallScreen = window.innerWidth < 768
      setIsMobile(hasTouchScreen && isSmallScreen)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return isMobile
}

/**
 * Get the modifier key for the current platform
 */
const useModifierKey = () => {
  const [modKey, setModKey] = useState('Ctrl')

  useEffect(() => {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
                  (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
    setModKey(isMac ? 'Cmd' : 'Ctrl')
  }, [])

  return modKey
}

/**
 * StepEditor - Rich text editor for a single lesson step
 *
 * Each step is a focused chunk of content that students see one at a time.
 * This encourages concise, digestible content.
 */
const StepEditor = ({
  step,
  onChange,
  placeholder = 'Write the content for this step...',
  autoFocus = false,
  questId,
}) => {
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [editingAttachmentIndex, setEditingAttachmentIndex] = useState(null)
  const [editingAttachmentName, setEditingAttachmentName] = useState('')
  const [editingLinkIndex, setEditingLinkIndex] = useState(null)
  const [editingLinkText, setEditingLinkText] = useState('')
  const fileInputRef = useRef(null)
  const isMobile = useIsMobile()
  const modKey = useModifierKey()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
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
    content: step?.content || '',
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-[200px] p-6 prose-headings:font-bold prose-headings:text-gray-900 prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-gray-200 prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3 prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-6 prose-li:text-gray-700 prose-li:my-1 prose-strong:text-gray-900 prose-blockquote:border-l-4 prose-blockquote:border-optio-purple prose-blockquote:bg-optio-purple/5 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-a:text-optio-purple prose-a:no-underline hover:prose-a:underline [&>p+p]:mt-6 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-4 [&_li]:ml-2',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange?.({ ...step, content: html })
    },
    autofocus: autoFocus,
  })

  // Update editor content when step changes externally
  useEffect(() => {
    if (editor && step?.content !== undefined) {
      const currentContent = editor.getHTML()
      if (currentContent !== step.content && step.content !== currentContent) {
        editor.commands.setContent(step.content || '')
      }
    }
  }, [step?.id])

  const addLink = useCallback(() => {
    if (!linkUrl.trim()) return

    // Ensure URL has protocol
    let url = linkUrl.trim()
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url
    }

    // Add link to the links array
    const newLink = {
      url,
      displayText: linkText.trim() || url
    }
    const currentLinks = step.links || []
    onChange?.({ ...step, links: [...currentLinks, newLink] })

    setLinkUrl('')
    setLinkText('')
  }, [step, onChange, linkUrl, linkText])

  const handleLinkKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addLink()
    }
  }

  const handleRemoveLink = (index) => {
    const currentLinks = step.links || []
    onChange?.({ ...step, links: currentLinks.filter((_, i) => i !== index) })
  }

  const handleStartEditLink = (index) => {
    const link = step.links?.[index]
    if (link) {
      setEditingLinkIndex(index)
      setEditingLinkText(link.displayText || link.url)
    }
  }

  const handleSaveLinkText = () => {
    if (editingLinkIndex === null) return

    const currentLinks = step.links || []
    const updatedLinks = currentLinks.map((link, i) =>
      i === editingLinkIndex
        ? { ...link, displayText: editingLinkText.trim() || link.url }
        : link
    )
    onChange?.({ ...step, links: updatedLinks })
    setEditingLinkIndex(null)
    setEditingLinkText('')
  }

  const handleLinkTextKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveLinkText()
    } else if (e.key === 'Escape') {
      setEditingLinkIndex(null)
      setEditingLinkText('')
    }
  }

  // File attachment handlers
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !questId) return

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
        const newAttachment = { name: file.name, url: fileUrl, size: file.size }
        const currentAttachments = step.attachments || []
        onChange?.({ ...step, attachments: [...currentAttachments, newAttachment] })
        toast.success('File attached')
      }
    } catch (error) {
      console.error('Failed to upload file:', error)
      toast.error('Failed to upload file')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveAttachment = (index) => {
    const currentAttachments = step.attachments || []
    onChange?.({ ...step, attachments: currentAttachments.filter((_, i) => i !== index) })
  }

  const handleStartRenameAttachment = (index) => {
    const attachment = step.attachments?.[index]
    if (attachment) {
      setEditingAttachmentIndex(index)
      setEditingAttachmentName(attachment.displayName || attachment.name)
    }
  }

  const handleSaveAttachmentName = () => {
    if (editingAttachmentIndex === null) return

    const currentAttachments = step.attachments || []
    const updatedAttachments = currentAttachments.map((att, i) =>
      i === editingAttachmentIndex
        ? { ...att, displayName: editingAttachmentName.trim() || att.name }
        : att
    )
    onChange?.({ ...step, attachments: updatedAttachments })
    setEditingAttachmentIndex(null)
    setEditingAttachmentName('')
  }

  const handleAttachmentNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveAttachmentName()
    } else if (e.key === 'Escape') {
      setEditingAttachmentIndex(null)
      setEditingAttachmentName('')
    }
  }

  if (!editor) {
    return (
      <div className="p-4 text-gray-500 animate-pulse">
        Loading editor...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Editor */}
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
        <EditorContent editor={editor} />
      </div>

      {/* Keyboard shortcuts hint - hidden on mobile */}
      {!isMobile && (
        <p className="text-xs text-gray-400">
          <span className="font-medium">{modKey}+B</span> bold
          <span className="mx-2">·</span>
          <span className="font-medium">{modKey}+I</span> italic
          <span className="mx-2">·</span>
          <span className="font-medium">{modKey}+Shift+8</span> bullets
          <span className="mx-2">·</span>
          <span className="font-medium">{modKey}+Shift+7</span> numbers
          <span className="mx-2">·</span>
          <span className="font-medium">{modKey}+Z</span> undo
        </p>
      )}

      {/* Add Link Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={handleLinkKeyDown}
              placeholder="Link URL"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
            />
          </div>
          <input
            type="text"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            onKeyDown={handleLinkKeyDown}
            placeholder="Display text (optional)"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
          <button
            type="button"
            onClick={addLink}
            disabled={!linkUrl.trim()}
            className="px-4 py-2 text-sm font-medium text-optio-purple bg-white border border-optio-purple rounded-lg hover:bg-optio-purple/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Add Link
          </button>
        </div>

        {/* Links list */}
        {step.links && step.links.length > 0 && (
          <div className="space-y-2">
            {step.links.map((link, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm"
              >
                <LinkIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                {editingLinkIndex === index ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={editingLinkText}
                      onChange={(e) => setEditingLinkText(e.target.value)}
                      onKeyDown={handleLinkTextKeyDown}
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-optio-purple"
                      autoFocus
                      placeholder="Display text"
                    />
                    <button
                      type="button"
                      onClick={handleSaveLinkText}
                      className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                      title="Save"
                    >
                      <CheckIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <span className="text-gray-700 block truncate">
                        {link.displayText || link.url}
                      </span>
                      {link.displayText && link.displayText !== link.url && (
                        <span className="text-xs text-gray-400 block truncate">
                          {link.url}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleStartEditLink(index)}
                      className="p-1 text-gray-400 hover:text-optio-purple transition-colors"
                      title="Edit display text"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveLink(index)}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                  title="Remove link"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File attachments */}
      {questId && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <ArrowUpTrayIcon className="w-4 h-4" />
                  Attach File
                </>
              )}
            </button>
            <span className="text-xs text-gray-400">Max 25MB per file</span>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isUploading}
            />
          </div>

          {/* Attached files list */}
          {step.attachments && step.attachments.length > 0 && (
            <div className="space-y-2">
              {step.attachments.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm"
                >
                  <PaperClipIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  {editingAttachmentIndex === index ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editingAttachmentName}
                        onChange={(e) => setEditingAttachmentName(e.target.value)}
                        onKeyDown={handleAttachmentNameKeyDown}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-optio-purple"
                        autoFocus
                        placeholder="Display name"
                      />
                      <button
                        type="button"
                        onClick={handleSaveAttachmentName}
                        className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                        title="Save name"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-700 block truncate">
                          {file.displayName || file.name}
                        </span>
                        {file.displayName && file.displayName !== file.name && (
                          <span className="text-xs text-gray-400 block truncate">
                            Original: {file.name}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleStartRenameAttachment(index)}
                        className="p-1 text-gray-400 hover:text-optio-purple transition-colors"
                        title="Rename attachment"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(index)}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                    title="Remove attachment"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default StepEditor
