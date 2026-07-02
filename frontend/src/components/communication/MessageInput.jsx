import React, { useState, useRef } from 'react'
import { PaperAirplaneIcon, PaperClipIcon, XMarkIcon, DocumentIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { formatFileSize } from './MessageParts'

const ACCEPTED_FILES = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt'
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB (backend limit)

/**
 * Composer shared by DMs and group chats.
 *
 * onSendMessage(content, { attachments, replyToMessageId })
 * replyTo: { id, sender_name, content } | null - shows the reply banner
 */
const MessageInput = ({
  onSendMessage,
  disabled = false,
  placeholder = 'Type a message...',
  replyTo = null,
  onCancelReply
}) => {
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  const canSend = (message.trim().length > 0 || attachments.length > 0) && !disabled && !uploading

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSend) return
    onSendMessage(message.trim(), {
      attachments,
      replyToMessageId: replyTo?.id || null
    })
    setMessage('')
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleChange = (e) => {
    setMessage(e.target.value)
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // Allow re-selecting the same file
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} is too large (max 25MB)`)
        continue
      }
      setUploading(true)
      setUploadProgress(0)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const response = await api.post('/api/messages/attachments', formData, {
          onUploadProgress: (event) => {
            if (event.total) setUploadProgress(Math.round((event.loaded * 100) / event.total))
          }
        })
        const data = response.data.data || response.data
        if (data?.attachment) {
          setAttachments((prev) => [...prev, data.attachment])
        }
      } catch (error) {
        toast.error(error.response?.data?.error || `Failed to upload ${file.name}`)
      } finally {
        setUploading(false)
      }
    }
  }

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 bg-white p-4">
      {/* Reply banner */}
      {replyTo && (
        <div className="mb-2 flex items-center justify-between gap-2 px-3 py-2 bg-purple-50 border-l-2 border-optio-purple rounded-lg">
          <p className="text-xs text-gray-600 truncate">
            Replying to{' '}
            <span className="font-semibold text-optio-purple">{replyTo.sender_name || 'Unknown'}</span>
            {replyTo.content ? `: ${replyTo.content}` : ''}
          </p>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-white flex-shrink-0"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending attachment chips */}
      {(attachments.length > 0 || uploading) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {attachments.map((att, index) => (
            <div key={att.url || index} className="relative">
              {att.type === 'image' ? (
                <img
                  src={att.url}
                  alt={att.name || 'Attachment'}
                  className="w-14 h-14 rounded-lg object-cover border border-gray-200"
                />
              ) : (
                <div className="flex items-center gap-1.5 pl-2 pr-3 py-2 bg-gray-100 rounded-lg text-xs text-gray-700 max-w-[200px]">
                  <DocumentIcon className="w-4 h-4 flex-shrink-0 text-gray-500" />
                  <span className="truncate font-medium">{att.name || 'File'}</span>
                  {att.size ? (
                    <span className="text-gray-400 flex-shrink-0">{formatFileSize(att.size)}</span>
                  ) : null}
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                aria-label={`Remove ${att.name || 'attachment'}`}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-700 hover:bg-gray-900 text-white rounded-full flex items-center justify-center"
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-xs text-gray-500">
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-optio-purple" />
              Uploading... {uploadProgress}%
            </div>
          )}
        </div>
      )}

      <div className="flex items-end space-x-2">
        {/* Attachment button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          title="Attach a file"
          aria-label="Attach a file"
          className="p-3 text-gray-500 hover:text-optio-purple hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <PaperClipIcon className="w-5 h-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILES}
          onChange={handleFilesSelected}
          className="hidden"
          data-testid="message-file-input"
        />

        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-none"
            rows="1"
            maxLength={2000}
            style={{ minHeight: '38px', maxHeight: '120px' }}
          />
          {/* Quiet helper row: counter only when it matters; hint on larger screens */}
          <div className="flex justify-between items-center mt-0.5 px-1">
            <span className={`text-[11px] ${message.length > 1800 ? 'text-amber-600' : 'text-transparent'}`}>
              {message.length}/2000
            </span>
            <span className="hidden sm:inline text-[11px] text-gray-300">
              Enter to send
            </span>
          </div>
        </div>
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className="bg-gradient-primary text-white p-3 rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <PaperAirplaneIcon className="w-5 h-5" />
        </button>
      </div>
    </form>
  )
}

export default MessageInput
