import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getPendingSchoolSetup } from '../../utils/pendingSchoolSetup'

/**
 * Sends a newly signed-in school operator back to the setup link they opened
 * first. Renders nothing. The setup page clears the saved token once the
 * school is created or the link turns out to be closed, so this cannot loop.
 */
export default function PendingSchoolSetupRedirect() {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthenticated || !user) return
    const token = getPendingSchoolSetup()
    if (!token || location.pathname.startsWith('/start-school/')) return
    navigate(`/start-school/${encodeURIComponent(token)}`, { replace: true })
  }, [isAuthenticated, user, location.pathname, navigate])

  return null
}
