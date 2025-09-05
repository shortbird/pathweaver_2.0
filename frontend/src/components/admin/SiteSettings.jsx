import React, { useState, useEffect } from 'react'
import api from '../../services/api'

const SiteSettings = () => {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await api.get('/api/settings')
      setSettings(response.data)
      setPreviewUrl(response.data?.logo_url)
      setLoading(false)
    } catch (error) {
      console.error('Failed to fetch settings:', error)
      setLoading(false)
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Preview the image
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreviewUrl(reader.result)
    }
    reader.readAsDataURL(file)

    // Upload to server
    const formData = new FormData()
    formData.append('logo', file)

    setUploading(true)
    setMessage('')

    try {
      const response = await api.post('/settings/upload-logo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      setSettings({...settings, logo_url: response.data.logo_url})
      setMessage('Logo uploaded successfully!')
      
      // Refresh the page after a short delay to show the new logo
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (error) {
      console.error('Failed to upload logo:', error)
      setMessage('Failed to upload logo. Please try again.')
      // Reset preview on error
      setPreviewUrl(settings?.logo_url)
    } finally {
      setUploading(false)
    }
  }

  const handleSettingsUpdate = async (e) => {
    e.preventDefault()
    setMessage('')

    try {
      const response = await api.put('/settings', {
        site_name: e.target.site_name.value,
        site_description: e.target.site_description.value,
        footer_text: e.target.footer_text.value
      })

      setSettings(response.data)
      setMessage('Settings updated successfully!')
    } catch (error) {
      console.error('Failed to update settings:', error)
      setMessage('Failed to update settings. Please try again.')
    }
  }

  if (loading) {
    return <div className="p-6">Loading settings...</div>
  }

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-2xl font-bold mb-6">Site Settings</h2>

      {message && (
        <div className={`mb-4 p-3 rounded ${
          message.includes('success') 
            ? 'bg-green-100 text-green-700' 
            : 'bg-red-100 text-red-700'
        }`}>
          {message}
        </div>
      )}

      {/* Logo Upload Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Site Logo</h3>
        
        <div className="flex items-start space-x-6">
          <div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Logo
              </label>
              {previewUrl ? (
                <div className="border rounded p-4 bg-gray-50">
                  <img 
                    src={previewUrl} 
                    alt="Site logo" 
                    className="h-12 w-auto"
                  />
                </div>
              ) : (
                <div className="border rounded p-4 bg-gray-50 text-gray-500">
                  No logo uploaded
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload New Logo
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={uploading}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-primary file:text-white
                  hover:file:bg-primary-dark
                  disabled:opacity-50"
              />
              <p className="mt-2 text-sm text-gray-500">
                Recommended: PNG with transparent background, height 32-48px
              </p>
            </div>
          </div>
        </div>

        {uploading && (
          <div className="mt-4 text-sm text-gray-600">
            Uploading logo...
          </div>
        )}
      </div>

      {/* Other Settings Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">General Settings</h3>
        
        <form onSubmit={handleSettingsUpdate}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Site Name
              </label>
              <input
                type="text"
                name="site_name"
                defaultValue={settings?.site_name || 'Optio'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Site Description
              </label>
              <textarea
                name="site_description"
                rows={3}
                defaultValue={settings?.site_description || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                placeholder="Brief description of your site..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Footer Text
              </label>
              <input
                type="text"
                name="footer_text"
                defaultValue={settings?.footer_text || '© 2025 Optio. All rights reserved.'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          <div className="mt-6">
            <button
              type="submit"
              className="btn-primary"
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SiteSettings