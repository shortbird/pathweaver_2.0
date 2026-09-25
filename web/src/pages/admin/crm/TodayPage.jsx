import React, { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import EmptyState from '../../../components/ui/EmptyState'
import {
  getGmailStatus,
  connectGmail,
  disconnectGmail,
  syncGmail,
  listDueTasks,
  updateTask,
  listClientOrgs,
  setClientOrgs,
} from './crmApi'
import { formatDateTime, formatMetOn } from './crmConstants'
import { useConfirm } from '../../../contexts/ConfirmContext'

const primaryButtonClass =
  'px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]'
const secondaryButtonClass =
  'px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 min-h-[44px]'
const cardClass = 'bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6'

const errorText = (err, fallback) => err?.response?.data?.error || fallback

/** Connect, sync and disconnect the mailbox the CRM reads and sends from. */
const GmailCard = () => {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(null)
  const [params, setParams] = useSearchParams()
  const confirm = useConfirm()

  const load = useCallback(() => {
    getGmailStatus()
      .then((res) => setStatus(res.data))
      .catch((err) => toast.error(errorText(err, 'Could not read the Gmail connection')))
  }, [])

  useEffect(() => {
    load()
    const connected = params.get('gmail_connected')
    const error = params.get('gmail_error')
    if (connected) toast.success(`Gmail connected: ${connected}. Your email will appear within a few minutes.`)
    if (error) toast.error(error)
    if (connected || error) {
      params.delete('gmail_connected')
      params.delete('gmail_error')
      setParams(params, { replace: true })
    }
    // Read the redirect flags once, on arrival.
  }, [])

  const connect = async () => {
    setBusy('connect')
    try {
      const res = await connectGmail()
      window.location.assign(res.data.url)
    } catch (err) {
      toast.error(errorText(err, 'Could not start the Gmail connection'))
      setBusy(null)
    }
  }

  const sync = async () => {
    setBusy('sync')
    try {
      const res = await syncGmail()
      const r = res.data || {}
      toast.success(r.skipped ? `Sync skipped: ${r.skipped}` : `Synced: ${r.stored || 0} new message(s) with contacts`)
      load()
    } catch (err) {
      toast.error(errorText(err, 'Sync failed'))
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    const ok = await confirm({
      title: 'Disconnect Gmail?',
      body: 'The CRM stops reading new email and cannot send until you connect again. Email already synced stays.',
      confirmLabel: 'Disconnect',
      destructive: true,
    })
    if (!ok) return
    setBusy('disconnect')
    try {
      const res = await disconnectGmail()
      setStatus(res.data)
    } catch (err) {
      toast.error(errorText(err, 'Could not disconnect'))
    } finally {
      setBusy(null)
    }
  }

  if (!status) return null

  return (
    <div className={cardClass}>
      <h3 className="text-lg font-bold text-gray-900 mb-1">Gmail</h3>
      {status.connected ? (
        <>
          <p className="text-sm text-gray-600">
            Connected as <span className="font-medium text-gray-900">{status.email}</span>. Last synced{' '}
            {status.last_sync_at ? formatDateTime(status.last_sync_at) : 'not yet'}.
          </p>
          {status.last_error && <p className="mt-2 text-sm text-red-600">{status.last_error}</p>}
          <p className="mt-2 text-xs text-gray-500">
            The CRM reads email with your contacts and can send only when you click Send on a draft.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={sync} disabled={busy !== null} className={secondaryButtonClass}>
              {busy === 'sync' ? 'Syncing...' : 'Sync now'}
            </button>
            <button onClick={connect} disabled={busy !== null} className={secondaryButtonClass}>
              Reconnect
            </button>
            <button
              onClick={disconnect}
              disabled={busy !== null}
              className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg min-h-[44px]"
            >
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            Connect tanner@optioeducation.com so the CRM can see your email with contacts and send the drafts you
            approve.
          </p>
          {!status.configured && (
            <p className="mt-2 text-sm text-amber-700">
              This server has no Gmail OAuth client yet (GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET).
            </p>
          )}
          <button onClick={connect} disabled={!status.configured || busy !== null} className={`mt-3 ${primaryButtonClass}`}>
            {busy === 'connect' ? 'Opening Google...' : 'Connect Gmail'}
          </button>
        </>
      )}
    </div>
  )
}

/** Open to-dos due today or earlier, across every contact. */
const DueTasks = () => {
  const [data, setData] = useState(null)

  const load = useCallback(() => {
    listDueTasks()
      .then((res) => setData(res.data))
      .catch((err) => toast.error(errorText(err, 'Could not load to-dos')))
  }, [])

  useEffect(load, [load])

  const set = async (task, status) => {
    try {
      await updateTask(task.id, { status })
      load()
    } catch (err) {
      toast.error(errorText(err, 'Could not update the to-do'))
    }
  }

  if (!data) return null

  return (
    <div className={cardClass}>
      <h3 className="text-lg font-bold text-gray-900 mb-3">Due today</h3>
      {data.tasks.length === 0 ? (
        <EmptyState plain title="Nothing due" hint="To-dos you add on a contact's file show up here on their due date." />
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.tasks.map((task) => {
            const overdue = task.due_on < data.today
            const link = data.links?.[task.contact_email]
            return (
              <li key={task.id} className="flex items-start gap-3 py-2">
                <input
                  type="checkbox"
                  aria-label={`Done: ${task.title}`}
                  onChange={() => set(task, 'done')}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">{task.title}</p>
                  <p className="text-xs text-gray-500">
                    {link ? (
                      <Link to={link} className="font-medium text-optio-purple hover:underline break-all">
                        {task.contact_email}
                      </Link>
                    ) : (
                      <span className="break-all">{task.contact_email}</span>
                    )}
                    {' · '}
                    <span className={overdue ? 'font-semibold text-red-600' : ''}>
                      {overdue ? `Overdue, was due ${formatMetOn(task.due_on)}` : 'Due today'}
                    </span>
                  </p>
                </div>
                <button onClick={() => set(task, 'dismissed')} className="text-sm text-gray-400 hover:text-gray-700">
                  Dismiss
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Which orgs are microschool clients: their admins rank first in the digest. */
const ClientOrgs = () => {
  const [orgs, setOrgs] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listClientOrgs()
      .then((res) => setOrgs(res.data.orgs))
      .catch((err) => toast.error(errorText(err, 'Could not load organizations')))
  }, [])

  const toggle = async (org) => {
    const next = orgs.map((o) => (o.id === org.id ? { ...o, is_client: !o.is_client } : o))
    setOrgs(next)
    setSaving(true)
    try {
      const res = await setClientOrgs(next.filter((o) => o.is_client).map((o) => o.id))
      setOrgs(res.data.orgs)
    } catch (err) {
      toast.error(errorText(err, 'Could not save'))
      setOrgs(orgs)
    } finally {
      setSaving(false)
    }
  }

  if (!orgs) return null

  return (
    <div className={cardClass}>
      <h3 className="text-lg font-bold text-gray-900 mb-1">Microschool clients</h3>
      <p className="text-sm text-gray-600 mb-3">
        The admins of these organizations are priority contacts, so you stay in regular touch with them.
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {orgs.map((org) => (
          <li key={org.id}>
            <label className="flex items-center gap-2 py-1 text-sm text-gray-800 cursor-pointer">
              <input
                type="checkbox"
                checked={org.is_client}
                disabled={saving}
                onChange={() => toggle(org)}
                className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
              />
              {org.name}
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** /admin/crm/today: what needs doing today, and the assistant's settings. */
const TodayPage = () => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div className="lg:col-span-2 space-y-6">
      <DueTasks />
    </div>
    <div className="space-y-6">
      <GmailCard />
      <ClientOrgs />
    </div>
  </div>
)

export default TodayPage
