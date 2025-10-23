import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import ConnectionCard from './ConnectionCard'
import ConnectionSearch from './ConnectionSearch'
import ConnectionsEmptyState from './ConnectionsEmptyState'

const ConnectionsTab = ({ connections = [], onAddConnection }) => {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')

  // Filter connections based on search query
  const filteredConnections = connections.filter((conn) => {
    if (!searchQuery) return true
    const fullName = `${conn.first_name} ${conn.last_name}`.toLowerCase()
    return fullName.includes(searchQuery.toLowerCase())
  })

  const handleViewJourney = (userId) => {
    navigate(`/diploma/${userId}`)
  }

  const handleTeamUp = (userId) => {
    // TODO: Implement team-up workflow - could navigate to quest selection
    toast.success('Team-up feature coming soon!')
  }

  return (
    <section
      role="tabpanel"
      id="connections-panel"
      aria-labelledby="connections-tab"
      className="py-8 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-6xl mx-auto">
        <ConnectionSearch
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onAddConnection={onAddConnection}
        />

        {connections.length === 0 ? (
          <ConnectionsEmptyState onAddConnection={onAddConnection} />
        ) : filteredConnections.length === 0 ? (
          <div className="text-center py-16">
            <p
              className="text-lg text-neutral-500"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              No connections found matching "{searchQuery}"
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredConnections.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                onViewJourney={handleViewJourney}
                onTeamUp={handleTeamUp}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default ConnectionsTab
