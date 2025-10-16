import React from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import ActivityCard from './ActivityCard'
import ActivityEmptyState from './ActivityEmptyState'

const ActivityFeedTab = ({ activities = [], onAddConnection }) => {
  const navigate = useNavigate()

  const handleViewQuest = (questId) => {
    navigate(`/quests/${questId}`)
  }

  const handleEncourage = (userId) => {
    // TODO: Implement encourage functionality (could be a simple acknowledgment)
    toast.success('Encouragement sent!')
  }

  if (activities.length === 0) {
    return <ActivityEmptyState onAddConnection={onAddConnection} />
  }

  return (
    <section
      role="tabpanel"
      id="activity-panel"
      aria-labelledby="activity-tab"
      className="py-8 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-4xl mx-auto">
        <h2
          className="text-2xl font-bold text-[#3B383C] mb-6 flex items-center gap-2"
          style={{ fontFamily: 'Poppins', fontWeight: 700 }}
        >
          <span role="img" aria-label="Growing plant">
            🌱
          </span>
          Recent Learning Activity
        </h2>

        <div className="space-y-4">
          {activities.map((activity, index) => (
            <ActivityCard
              key={activity.id || index}
              activity={activity}
              onViewQuest={handleViewQuest}
              onEncourage={handleEncourage}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default ActivityFeedTab
