import React, { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

const AdminKhanAcademySync = () => {
  const [courses, setCourses] = useState([])
  const [selectedCourses, setSelectedCourses] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [syncedQuests, setSyncedQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [customUrl, setCustomUrl] = useState('')
  const [activeTab, setActiveTab] = useState('sync') // 'sync' or 'synced'

  useEffect(() => {
    fetchAvailableCourses()
    fetchSyncedQuests()
  }, [])

  const fetchAvailableCourses = async () => {
    try {
      const response = await api.get('/api/admin/khan-academy/courses')
      setCourses(response.data.courses || [])
    } catch (error) {
      toast.error('Failed to load available courses')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSyncedQuests = async () => {
    try {
      const response = await api.get('/api/admin/khan-academy/sync-status')
      setSyncedQuests(response.data.quests || [])
    } catch (error) {
      console.error('Failed to load synced quests', error)
    }
  }

  const handleSelectCourse = (courseUrl) => {
    setSelectedCourses(prev => {
      if (prev.includes(courseUrl)) {
        return prev.filter(url => url !== courseUrl)
      } else {
        return [...prev, courseUrl]
      }
    })
  }

  const handleSelectAll = () => {
    if (selectedCourses.length === courses.length) {
      setSelectedCourses([])
    } else {
      setSelectedCourses(courses.map(c => c.url))
    }
  }

  const handleSyncSelected = async () => {
    if (selectedCourses.length === 0) {
      toast.error('Please select at least one course')
      return
    }

    if (!window.confirm(`Are you sure you want to sync ${selectedCourses.length} course(s)? This may take a few minutes.`)) {
      return
    }

    setSyncing(true)
    const loadingToast = toast.loading(`Syncing ${selectedCourses.length} course(s)...`)

    try {
      const coursesToSync = selectedCourses.map(url => {
        const course = courses.find(c => c.url === url)
        return {
          url: url,
          subject_area: course?.category || 'Math'
        }
      })

      const response = await api.post('/api/admin/khan-academy/sync-batch', {
        courses: coursesToSync
      })

      toast.dismiss(loadingToast)

      if (response.data.success) {
        toast.success(response.data.message)
        setSelectedCourses([])
        fetchSyncedQuests()
        setActiveTab('synced')
      } else {
        toast.error(response.data.error || 'Sync failed')
      }
    } catch (error) {
      toast.dismiss(loadingToast)
      toast.error(error.response?.data?.error || 'Failed to sync courses')
      console.error(error)
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncCustomUrl = async () => {
    if (!customUrl.trim()) {
      toast.error('Please enter a valid Khan Academy course URL')
      return
    }

    if (!customUrl.includes('khanacademy.org')) {
      toast.error('URL must be from khanacademy.org')
      return
    }

    setSyncing(true)
    const loadingToast = toast.loading('Syncing custom course...')

    try {
      const response = await api.post('/api/admin/khan-academy/sync', {
        course_url: customUrl.trim(),
        subject_area: 'Math'
      })

      toast.dismiss(loadingToast)

      if (response.data.success) {
        toast.success(`Successfully synced: ${response.data.quest_title}`)
        setCustomUrl('')
        fetchSyncedQuests()
        setActiveTab('synced')
      } else {
        toast.error(response.data.error || 'Sync failed')
      }
    } catch (error) {
      toast.dismiss(loadingToast)
      toast.error(error.response?.data?.error || 'Failed to sync custom course')
      console.error(error)
    } finally {
      setSyncing(false)
    }
  }

  const handleDeleteQuest = async (questId, questTitle) => {
    if (!window.confirm(`Are you sure you want to delete "${questTitle}"? This will also delete all associated tasks.`)) {
      return
    }

    try {
      await api.delete(`/api/admin/quests/${questId}`)
      toast.success('Quest deleted successfully')
      fetchSyncedQuests()
    } catch (error) {
      toast.error('Failed to delete quest')
      console.error(error)
    }
  }

  // Group courses by category
  const coursesByCategory = courses.reduce((acc, course) => {
    if (!acc[course.category]) {
      acc[course.category] = []
    }
    acc[course.category].push(course)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading Khan Academy courses...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-500 rounded-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Khan Academy Course Sync</h2>
        <p className="text-purple-100">
          Import Khan Academy courses as Optio course quests. Each course unit becomes a task with 100 XP.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('sync')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'sync'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Sync Courses
          </button>
          <button
            onClick={() => setActiveTab('synced')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'synced'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Synced Quests ({syncedQuests.length})
          </button>
        </nav>
      </div>

      {/* Sync Tab */}
      {activeTab === 'sync' && (
        <div className="space-y-6">
          {/* Custom URL Input */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Sync Custom Course URL</h3>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="https://www.khanacademy.org/math/algebra"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={syncing}
              />
              <button
                onClick={handleSyncCustomUrl}
                disabled={syncing || !customUrl.trim()}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Sync
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Enter any Khan Academy course URL to sync it directly
            </p>
          </div>

          {/* Predefined Courses */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Popular Courses</h3>
              <button
                onClick={handleSelectAll}
                className="text-sm text-purple-600 hover:text-purple-700"
              >
                {selectedCourses.length === courses.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {Object.keys(coursesByCategory).length === 0 && (
              <p className="text-gray-500 text-center py-4">No courses available</p>
            )}

            {Object.entries(coursesByCategory).map(([category, categoryCourses]) => (
              <div key={category} className="mb-6">
                <h4 className="font-semibold text-gray-700 mb-3">{category}</h4>
                <div className="space-y-2">
                  {categoryCourses.map((course) => (
                    <label
                      key={course.url}
                      className="flex items-center p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCourses.includes(course.url)}
                        onChange={() => handleSelectCourse(course.url)}
                        disabled={syncing}
                        className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                      />
                      <span className="ml-3 text-sm font-medium text-gray-900">
                        {course.title}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {selectedCourses.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={handleSyncSelected}
                  disabled={syncing}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-lg hover:from-purple-700 hover:to-pink-600 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed transition-all font-semibold"
                >
                  {syncing ? 'Syncing...' : `Sync ${selectedCourses.length} Selected Course${selectedCourses.length > 1 ? 's' : ''}`}
                </button>
                <p className="mt-2 text-sm text-gray-500 text-center">
                  This may take 1-2 minutes per course
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Synced Quests Tab */}
      {activeTab === 'synced' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {syncedQuests.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 mb-4">No Khan Academy courses synced yet</p>
              <button
                onClick={() => setActiveTab('sync')}
                className="text-purple-600 hover:text-purple-700 font-medium"
              >
                Sync your first course →
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quest Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tasks
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Synced Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {syncedQuests.map((quest) => (
                    <tr key={quest.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {quest.image_url && (
                            <img
                              src={quest.image_url}
                              alt={quest.title}
                              className="h-10 w-10 rounded-lg object-cover mr-3"
                            />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {quest.title}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{quest.tasks_count} tasks</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-500">
                          {new Date(quest.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          quest.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {quest.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDeleteQuest(quest.id, quest.title)}
                          className="text-red-600 hover:text-red-900 ml-4"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AdminKhanAcademySync
