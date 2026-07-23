import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

/**
 * Kiosk devices — provision and manage shared-device tokens for the org's
 * classroom kiosk (/kiosk). Mounted on the SIS Settings page for orgs with
 * feature_flags.kiosk enabled (the card explains itself when the flag is off).
 *
 * Provisioning calls POST /api/kiosk/devices, which returns the plaintext
 * device token exactly ONCE — the admin pastes it into the kiosk device's
 * setup screen at /kiosk. Only a sha256 hash is stored server-side.
 *
 * Props: orgId (uuid). Superadmins may manage any org; the orgId is always
 * passed explicitly so the card works in the SIS org-picker context.
 */
const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const KioskDevicesCard = ({ orgId }) => {
  const [devices, setDevices] = useState([])
  const [kioskEnabled, setKioskEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState(null) // { name, token } — shown once

  const load = useCallback(async () => {
    if (!orgId) return
    try {
      const { data } = await api.get(`/api/kiosk/devices?organization_id=${orgId}`)
      setDevices(data.devices || [])
      setKioskEnabled(data.kiosk_enabled !== false)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load kiosk devices')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { load() }, [load])

  const createDevice = async () => {
    if (!name.trim()) return toast.error('Give the device a name (e.g. "Room 2 iPad")')
    setCreating(true)
    try {
      const { data } = await api.post('/api/kiosk/devices', {
        name: name.trim(),
        organization_id: orgId,
      })
      setNewToken({ name: data.device?.name || name.trim(), token: data.device_token })
      setName('')
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create device')
    } finally {
      setCreating(false)
    }
  }

  const deactivate = async (device) => {
    if (!window.confirm(`Deactivate "${device.name}"? The kiosk on that device will stop working.`)) return
    try {
      await api.post(`/api/kiosk/devices/${device.id}/deactivate`, {})
      toast.success('Device deactivated')
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to deactivate device')
    }
  }

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(newToken.token)
      toast.success('Code copied')
    } catch {
      toast.error('Could not copy — select the code and copy it manually')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-neutral-900 mb-1">Kiosk devices</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Shared classroom devices (like a class iPad) where students tap their name and photograph
        their paper work into a quest task. Provision a device here, then open <span className="font-mono">/kiosk</span> on
        the device and paste its code once.
      </p>

      {!kioskEnabled && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          The kiosk feature is not enabled for this organization. Contact Optio to turn it on.
        </p>
      )}

      {newToken && (
        <div className="border-2 border-optio-purple rounded-xl p-4 mb-4 bg-purple-50">
          <p className="text-sm font-semibold text-neutral-900">
            Device code for "{newToken.name}" — copy it now, it will not be shown again:
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <code className="font-mono text-sm bg-white border border-gray-200 rounded px-2 py-1 break-all">
              {newToken.token}
            </code>
            <button onClick={copyToken} className="text-sm font-medium text-optio-purple hover:underline">Copy</button>
            <button onClick={() => setNewToken(null)} className="text-sm text-neutral-400 hover:underline">Dismiss</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-400 mb-4">Loading devices...</p>
      ) : (
        <div className="space-y-2 mb-4">
          {devices.length === 0 && <p className="text-sm text-neutral-400">No kiosk devices yet.</p>}
          {devices.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {d.name}
                  {!d.is_active && <span className="ml-2 text-xs text-neutral-400">(deactivated)</span>}
                  {d.class_name && <span className="ml-2 text-xs text-neutral-400">scope: {d.class_name}</span>}
                </p>
                <p className="text-xs text-neutral-400">
                  {d.last_used_at ? `Last used ${new Date(d.last_used_at).toLocaleString()}` : 'Never used'}
                </p>
              </div>
              {d.is_active && (
                <button onClick={() => deactivate(d)} className="text-sm text-red-500 hover:underline">
                  Deactivate
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${field} flex-1 min-w-[180px]`}
          placeholder='Device name (e.g. "Room 2 iPad")'
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!kioskEnabled}
        />
        <button
          onClick={createDevice}
          disabled={creating || !kioskEnabled}
          className="px-5 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium hover:opacity-90 disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Add device'}
        </button>
      </div>
    </div>
  )
}

export default KioskDevicesCard
