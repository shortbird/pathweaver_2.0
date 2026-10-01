import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getPendingOffer } from '../../utils/pendingOffer'

/**
 * Sends a newly signed-in visitor back to the class link they opened first.
 * Renders nothing. The offer page itself clears the saved slug once the class
 * is claimed or refused, so this cannot loop.
 */
export default function PendingOfferRedirect() {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthenticated || !user) return
    const slug = getPendingOffer()
    if (!slug || location.pathname.startsWith('/offer/')) return
    navigate(`/offer/${encodeURIComponent(slug)}`, { replace: true })
  }, [isAuthenticated, user, location.pathname, navigate])

  return null
}
