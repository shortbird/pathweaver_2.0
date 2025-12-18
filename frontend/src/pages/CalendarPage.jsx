import React, { useState, useEffect, lazy, Suspense } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useCalendar, useCalendarPreferences, useUpdatePreferences } from '../hooks/api/useCalendar'
import ViewToggle from '../components/calendar/ViewToggle'
import WhatDoIDoNext from '../components/calendar/WhatDoIDoNext'
import ScheduleSidebar from '../components/calendar/ScheduleSidebar'

// Lazy load heavy calendar components (FullCalendar library is 175KB)
const CalendarView = lazy(() => import('../components/calendar/CalendarView'))
const ListView = lazy(() => import('../components/calendar/ListView'))

// Loading spinner component
const LoadingFallback = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
  </div>
)

const CalendarPage = () => {
  const { user } = useAuth()
  const { data: calendarData, isLoading: calendarLoading } = useCalendar(user?.id)
  const { data: preferences } = useCalendarPreferences(user?.id)
  const updatePreferences = useUpdatePreferences()

  const [viewMode, setViewMode] = useState('calendar')
  const [selectedPillarFilter, setSelectedPillarFilter] = useState(null)

  // Initialize view mode from preferences
  useEffect(() => {
    if (preferences) {
      setViewMode(preferences.view_mode || 'calendar')
      setSelectedPillarFilter(preferences.default_pillar_filter)
    }
  }, [preferences])

  // Handle view toggle
  const handleViewChange = (newView) => {
    setViewMode(newView)
    updatePreferences.mutate({
      userId: user?.id,
      viewMode: newView,
      defaultPillarFilter: selectedPillarFilter
    })
  }

  // Handle pillar filter change
  const handlePillarFilterChange = (pillar) => {
    setSelectedPillarFilter(pillar)
    updatePreferences.mutate({
      userId: user?.id,
      viewMode,
      defaultPillarFilter: pillar
    })
  }

  if (calendarLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Your Learning Calendar
          </h1>
          <p className="text-gray-600 mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Find your learning rhythm
          </p>
        </div>
        <ViewToggle currentView={viewMode} onChange={handleViewChange} />
      </div>

      {/* What Do I Do Next? Component */}
      <WhatDoIDoNext
        userId={user?.id}
        selectedPillar={selectedPillarFilter}
        onPillarChange={handlePillarFilterChange}
      />

      {/* Main Calendar Area */}
      <div className="flex gap-6 mt-8">
        {/* Calendar/List View */}
        <div className="flex-1 min-w-0">
          <Suspense fallback={<LoadingFallback />}>
            {viewMode === 'calendar' ? (
              <CalendarView
                data={calendarData}
                userId={user?.id}
                selectedPillar={selectedPillarFilter}
              />
            ) : (
              <ListView
                data={calendarData}
                userId={user?.id}
                selectedPillar={selectedPillarFilter}
              />
            )}
          </Suspense>
        </div>

        {/* Unscheduled Items Sidebar */}
        <div className="w-80 flex-shrink-0 hidden xl:block">
          <ScheduleSidebar
            userId={user?.id}
            calendarData={calendarData}
            selectedPillar={selectedPillarFilter}
          />
        </div>
      </div>
    </div>
  )
}

export default CalendarPage
