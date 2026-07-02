import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React, { useEffect, useState } from 'react'
import { MemoryRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { subscribeSurface, switchSurfaceInApp } from './utils/appSurface'

// Regression test for the SIS -> Learning surface switch. Both route trees end
// in a `path="*" -> Navigate to "/"` catch-all, so if the surface state and the
// location update ever commit in separate renders, the foreign tree's catch-all
// hijacks the navigation and the user lands on "/" instead of the requested
// path. Mirrors SurfaceRoutes in App.jsx.

const Probe = ({ label }) => {
  const loc = useLocation()
  return <div>{label}:{loc.pathname}</div>
}

const SisTree = () => (
  <Routes>
    <Route path="/" element={<Probe label="sis-home" />} />
    <Route
      path="users"
      element={
        <>
          <button onClick={() => switchSurfaceInApp('learning', '/dashboard')}>switch</button>
          <Probe label="sis-users" />
        </>
      }
    />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
)

const LearningTree = () => (
  <Routes>
    <Route path="/" element={<Probe label="learn-home" />} />
    <Route path="dashboard" element={<Probe label="learn-dash" />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
)

function SurfaceRoutes() {
  const [surface, setSurface] = useState('sis')
  const navigate = useNavigate()
  useEffect(() => subscribeSurface((target, path) => {
    setSurface(target)
    navigate(path || '/')
  }), [navigate])
  return surface === 'sis' ? <SisTree /> : <LearningTree />
}

describe('surface switch routing', () => {
  it('lands on /dashboard when switching to the learning surface from a SIS subpage', async () => {
    render(
      <MemoryRouter initialEntries={['/users']}>
        <SurfaceRoutes />
      </MemoryRouter>,
    )
    expect(screen.getByText('sis-users:/users')).toBeInTheDocument()

    fireEvent.click(screen.getByText('switch'))

    await waitFor(() => expect(screen.getByText(/^learn-/)).toBeInTheDocument())
    expect(screen.getByText('learn-dash:/dashboard')).toBeInTheDocument()
  })
})
