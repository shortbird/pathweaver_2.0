import React, { useEffect, useState } from 'react'
import api from '../../services/api'

const AdminPlatformSettings = () => {
  const [form, setForm] = useState({
    teacher_name: '',
    teacher_bio: '',
    teacher_credentials: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const resp = await api.get('/api/platform/settings')
        if (cancelled) return
        const s = resp.data?.settings || {}
        setForm({
          teacher_name: s.teacher_name || '',
          teacher_bio: s.teacher_bio || '',
          teacher_credentials: s.teacher_credentials || '',
        })
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.error || e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleField = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const resp = await api.put('/api/platform/settings', form)
      const s = resp.data?.settings || {}
      setForm({
        teacher_name: s.teacher_name || '',
        teacher_bio: s.teacher_bio || '',
        teacher_credentials: s.teacher_credentials || '',
      })
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-optio-purple" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Platform settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Teacher-of-record information shown on every student-curated class page.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Teacher name</label>
          <input
            type="text"
            value={form.teacher_name}
            onChange={handleField('teacher_name')}
            placeholder="e.g. Tanner Bowman"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Credentials / licensure</label>
          <input
            type="text"
            value={form.teacher_credentials}
            onChange={handleField('teacher_credentials')}
            placeholder="e.g. Licensed secondary science teacher (UT #12345)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
          <textarea
            value={form.teacher_bio}
            onChange={handleField('teacher_bio')}
            rows={5}
            placeholder="Short bio describing your teaching background."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
          />
        </div>
      </section>

      <div className="mt-6 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {savedAt && `Saved at ${savedAt}`}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

export default AdminPlatformSettings
