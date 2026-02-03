import React, { useState } from 'react'

/**
 * Convert a video URL to its embeddable format.
 * YouTube, Vimeo, Loom etc. block direct iframe embedding of their watch/share URLs.
 */
const convertToEmbedUrl = (urlString) => {
  try {
    const parsedUrl = new URL(urlString)
    const hostname = parsedUrl.hostname.toLowerCase()

    // YouTube: youtube.com/watch?v=ID or youtu.be/ID -> youtube.com/embed/ID
    if (hostname.includes('youtube.com')) {
      const videoId = parsedUrl.searchParams.get('v')
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`
      }
    }
    if (hostname.includes('youtu.be')) {
      const videoId = parsedUrl.pathname.slice(1) // Remove leading /
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`
      }
    }

    // Vimeo: vimeo.com/ID -> player.vimeo.com/video/ID
    if (hostname.includes('vimeo.com') && !hostname.includes('player.vimeo.com')) {
      const videoId = parsedUrl.pathname.split('/').pop()
      if (videoId && /^\d+$/.test(videoId)) {
        return `https://player.vimeo.com/video/${videoId}`
      }
    }

    // Loom: loom.com/share/ID -> loom.com/embed/ID
    if (hostname.includes('loom.com') && parsedUrl.pathname.includes('/share/')) {
      return urlString.replace('/share/', '/embed/')
    }

    // Google Drive: Convert to preview format if not already
    if (hostname.includes('drive.google.com') && parsedUrl.pathname.includes('/file/d/')) {
      const match = parsedUrl.pathname.match(/\/file\/d\/([^/]+)/)
      if (match) {
        return `https://drive.google.com/file/d/${match[1]}/preview`
      }
    }

    // Already an embed URL or unsupported - return as-is
    return urlString
  } catch {
    return urlString
  }
}

const IframeEmbed = ({ embeds, onChange }) => {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState('')

  const validateUrl = (urlString) => {
    try {
      const parsedUrl = new URL(urlString)
      // Allow common video/content platforms
      const allowedDomains = [
        'youtube.com',
        'youtu.be',
        'vimeo.com',
        'loom.com',
        'drive.google.com',
        'docs.google.com',
        'edpuzzle.com',
        'kahoot.it',
        'quizlet.com'
      ]
      const isAllowed = allowedDomains.some(domain => parsedUrl.hostname.includes(domain))
      return isAllowed
    } catch {
      return false
    }
  }

  const handleAddEmbed = () => {
    if (!url) {
      setError('Please enter a URL')
      return
    }

    if (!validateUrl(url)) {
      setError('Invalid URL or unsupported platform. Supported: YouTube, Vimeo, Loom, Google Drive, EdPuzzle, Kahoot, Quizlet')
      return
    }

    // Convert to embed URL format for proper iframe embedding
    const embedUrl = convertToEmbedUrl(url)

    const newEmbed = {
      id: Date.now().toString(),
      url: embedUrl,  // Store the converted embed URL
      originalUrl: url,  // Keep original for display
      title: title || 'Embedded Content',
      type: 'iframe',
      addedAt: new Date().toISOString()
    }

    onChange([...embeds, newEmbed])
    setUrl('')
    setTitle('')
    setError('')
    setShowAddForm(false)
  }

  const handleRemoveEmbed = (id) => {
    onChange(embeds.filter(embed => embed.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Embedded Content</h3>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity"
        >
          {showAddForm ? 'Cancel' : '+ Add Embed'}
        </button>
      </div>

      {showAddForm && (
        <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
          <div className="space-y-3">
            <div>
              <label htmlFor="embed-url" className="block text-sm font-medium text-gray-700 mb-1">
                Content URL
              </label>
              <input
                id="embed-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="input-field w-full"
              />
              <p className="mt-1 text-xs text-gray-500">
                Supported: YouTube, Vimeo, Loom, Google Drive, EdPuzzle, Kahoot, Quizlet
              </p>
            </div>

            <div>
              <label htmlFor="embed-title" className="block text-sm font-medium text-gray-700 mb-1">
                Title (Optional)
              </label>
              <input
                id="embed-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Introduction Video"
                className="input-field w-full"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="button"
              onClick={handleAddEmbed}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-optio-purple rounded-lg hover:bg-opacity-90 transition-opacity"
            >
              Add Embed
            </button>
          </div>
        </div>
      )}

      {/* Display existing embeds */}
      {embeds.length > 0 ? (
        <div className="space-y-3">
          {embeds.map(embed => (
            <div key={embed.id} className="border border-gray-300 rounded-lg p-4 bg-white">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-medium text-gray-900">{embed.title}</h4>
                  <p className="text-xs text-gray-500 mt-1">{embed.originalUrl || embed.url}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveEmbed(embed.id)}
                  className="text-red-600 hover:text-red-800 transition-colors"
                  aria-label="Remove embed"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Preview */}
              <div className="aspect-video bg-gray-100 rounded overflow-hidden">
                <iframe
                  src={convertToEmbedUrl(embed.url)}
                  title={embed.title}
                  className="w-full h-full"
                  allowFullScreen
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="mt-2 text-sm text-gray-600">No embedded content yet</p>
          <p className="text-xs text-gray-500">Click "Add Embed" to include videos or interactive content</p>
        </div>
      )}
    </div>
  )
}

export default IframeEmbed
