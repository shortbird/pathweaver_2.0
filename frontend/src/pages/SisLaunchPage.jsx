import { useEffect } from 'react'
import { goToSisSurface } from '../utils/appSurface'

/**
 * SisLaunchPage — post-login hop for SIS-org staff. getPostLoginPath sends
 * teachers here on the learning surface; this immediately forwards them to the
 * SIS console (cross-host in prod, ?app=sis override in dev). On the SIS
 * surface the /sis-launch path never renders this — SisRoutes' catch-all sends
 * it straight to the dashboard.
 */
const SisLaunchPage = () => {
  useEffect(() => { goToSisSurface('/') }, [])
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-neutral-500">Opening your school console…</p>
    </div>
  )
}

export default SisLaunchPage
