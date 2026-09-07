import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useConfirm } from '../../contexts/ConfirmContext'
import { getLearningOrigin } from '../../utils/appSurface'

/**
 * Kiosk devices — provision and manage shared-device codes for the org's
 * classroom kiosk (/kiosk on the web app). Mounted on both settings surfaces
 * (SIS console Settings, and the web app's Organization → Settings tab) for
 * orgs with the kiosk block on (the card explains itself when it is off).
 *
 * The kiosk page lives on the LEARNING host: the SIS console renders its own
 * route tree and has no /kiosk, so the instructions spell out the full URL
 * rather than a path an admin on sis.optioeducation.com would open in place.
 *
 * Every active device shows its code right here, with a Copy button, for as
 * long as it is active. It used to be shown once at provisioning and never
 * again (only a hash was stored), so a lost code meant deactivating the device
 * and pairing the iPad over — Tanner's call on 2026-09-07 was that the org's
 * own admins do not need it hidden from them. Devices provisioned before the
 * code was stored have none to show; the row says so.
 *
 * A device can be limited to one class so a room's iPad lists only that
 * room's students (a school's five-year-olds should not scroll past fifty
 * names). The backend supported it from the start; the picker is the org
 * admin's, not Optio's, since 2026-09-07. Changing it never touches the iPad:
 * the kiosk re-reads its roster on every hand-off and every few minutes.
 *
 * Props: orgId (uuid). Superadmins may manage any org; the orgId is always
 * passed explicitly so the card works in the SIS org-picker context.
 */
const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const ALL_STUDENTS = ''

const KioskDevicesCard = ({ orgId }) => {
  const confirm = useConfirm()
  const [devices, setDevices] = useState([])
  const [classes, setClasses] = useState([])
  const [kioskEnabled, setKioskEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [newClassId, setNewClassId] = useState(ALL_STUDENTS)
  const [creating, setCreating] = useState(false)
  const kioskUrl = `${getLearningOrigin()}/kiosk`

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

  // The org's active classes, for the scope pickers. A school with no classes
  // simply gets no picker: every device lists everyone.
  const loadClasses = useCallback(async () => {
    if (!orgId) return
    try {
      const { data } = await api.get(`/api/organizations/${orgId}/classes`)
      setClasses((data.classes || []).map((c) => ({ id: c.id, name: c.name })))
    } catch {
      setClasses([])
    }
  }, [orgId])

  useEffect(() => { load(); loadClasses() }, [load, loadClasses])

  const createDevice = async () => {
    if (!name.trim()) return toast.error('Give the device a name (e.g. "Room 2 iPad")')
    setCreating(true)
    try {
      await api.post('/api/kiosk/devices', {
        name: name.trim(),
        organization_id: orgId,
        class_id: newClassId || null,
      })
      setName('')
      setNewClassId(ALL_STUDENTS)
      toast.success('Device added — its code is in the list below')
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create device')
    } finally {
      setCreating(false)
    }
  }

  const setScope = async (device, classId) => {
    try {
      await api.patch(`/api/kiosk/devices/${device.id}`, { class_id: classId || null })
      const cls = classes.find((c) => c.id === classId)
      toast.success(cls ? `"${device.name}" now lists ${cls.name}` : `"${device.name}" now lists all students`)
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update device')
    }
  }

  const deactivate = async (device) => {
    if (!(await confirm(`Deactivate "${device.name}"? The kiosk on that device will stop working.`))) return
    try {
      await api.post(`/api/kiosk/devices/${device.id}/deactivate`, {})
      toast.success('Device deactivated')
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to deactivate device')
    }
  }

  const copyCode = async (device) => {
    try {
      await navigator.clipboard.writeText(device.token)
      toast.success(`Code for "${device.name}" copied`)
    } catch {
      toast.error('Could not copy — select the code and copy it manually')
    }
  }

  // Options for a device's picker: the active classes, plus the device's own
  // class if it has since been archived, so the select never shows blank.
  const scopeOptions = (device) => {
    const opts = [...classes]
    if (device.class_id && !opts.some((c) => c.id === device.class_id)) {
      opts.push({ id: device.class_id, name: device.class_name || 'Archived class' })
    }
    return opts
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-neutral-900 mb-1">Kiosk devices</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Shared classroom devices (like a class iPad) where students tap their name and photograph
        their paper work into a quest task. Add a device here, then open{' '}
        <span className="font-mono">{kioskUrl}</span> on the device and paste its code once.
        {classes.length > 0 && ' Limit a device to a class so its name grid shows only that class.'}
      </p>

      {!kioskEnabled && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          The kiosk feature is not enabled for this organization. Contact Optio to turn it on.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-neutral-400 mb-4">Loading devices...</p>
      ) : (
        <div className="space-y-2 mb-4">
          {devices.length === 0 && <p className="text-sm text-neutral-400">No kiosk devices yet.</p>}
          {devices.map((d) => (
            <div key={d.id} className="border border-gray-100 rounded-lg px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    {d.name}
                    {!d.is_active && <span className="ml-2 text-xs text-neutral-400">(deactivated)</span>}
                    {!d.is_active && d.class_name && <span className="ml-2 text-xs text-neutral-400">scope: {d.class_name}</span>}
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
              {d.is_active && (
                <>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs text-neutral-500">Students:</span>
                    {classes.length > 0 ? (
                      <select
                        className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
                        aria-label={`Students on ${d.name}`}
                        value={d.class_id || ALL_STUDENTS}
                        onChange={(e) => setScope(d, e.target.value)}
                      >
                        <option value={ALL_STUDENTS}>All students</option>
                        {scopeOptions(d).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-neutral-700">{d.class_name || 'All students'}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs text-neutral-500">Code:</span>
                    {d.token ? (
                      <>
                        <code
                          className="font-mono text-sm bg-neutral-50 border border-gray-200 rounded px-2 py-1 break-all"
                          aria-label={`Device code for ${d.name}`}
                        >
                          {d.token}
                        </code>
                        <button onClick={() => copyCode(d)} className="text-sm font-medium text-optio-purple hover:underline">
                          Copy
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-neutral-400">
                        not available for devices added before codes were kept — deactivate it and add a new one
                      </span>
                    )}
                  </div>
                </>
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
        {classes.length > 0 && (
          <select
            className={field}
            aria-label="Limit to class"
            value={newClassId}
            onChange={(e) => setNewClassId(e.target.value)}
            disabled={!kioskEnabled}
          >
            <option value={ALL_STUDENTS}>All students</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
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
