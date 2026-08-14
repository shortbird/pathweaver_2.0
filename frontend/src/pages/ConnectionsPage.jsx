import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'

/**
 * Peer connections — the student's side.
 *
 * Students asked to add each other as friends so they could see each other's
 * work and comment on it. What makes that safe is mostly invisible from here,
 * and deliberately so: the page's job is to make the safe path the obvious one.
 *
 * Two things about the design are load-bearing rather than cosmetic:
 *
 *   1. THERE IS NO SEARCH BOX. You cannot look another student up. You connect
 *      by typing a code they handed you in person, which is why a stranger has
 *      no way to reach a child here. If you find yourself adding a directory or
 *      a "people you may know" list, that is the safety property being removed,
 *      not a feature being added.
 *
 *   2. THE AGE QUESTION IS NEUTRAL AND ASKED FIRST. The DOB prompt does not say
 *      "you must be 13+" above the input — that just tells a ten-year-old which
 *      year to type. It asks for a birthday, and the consequence is explained
 *      after the answer is given. The answer is also one-shot: the backend locks
 *      it, so the copy here promises nothing it can't keep.
 *
 * The entry point is shown to every student who is 13+ OR whose age we don't
 * know yet (state 'needs_dob'). Only a confirmed under-13 sees a dead end, and
 * it is a warm one rather than a validation error.
 *
 * Backed by /api/connections (see backend/services/peer_connection_service.py,
 * which is where the actual rules live).
 */

const STATE_ELIGIBLE = 'eligible'
const STATE_NEEDS_DOB = 'needs_dob'
const STATE_UNDER_13 = 'under_13'
const STATE_NEEDS_PARENT_DOB = 'needs_parent_dob'

function Avatar({ peer }) {
  if (peer?.avatar_url) {
    return <img src={peer.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
  }
  const initial = (peer?.display_name || '?').charAt(0).toUpperCase()
  return (
    <div className="h-10 w-10 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink text-white flex items-center justify-center font-semibold">
      {initial}
    </div>
  )
}

function Section({ title, description, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      {description && <p className="text-sm text-neutral-600 mt-1">{description}</p>}
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  )
}

function PeerRow({ item, children }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3">
      <Avatar peer={item.peer} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-neutral-900 truncate">{item.peer.display_name}</p>
        {item.statusLabel && <p className="text-sm text-neutral-500">{item.statusLabel}</p>}
      </div>
      <div className="flex gap-2 shrink-0">{children}</div>
    </div>
  )
}

export default function ConnectionsPage() {
  const [eligibility, setEligibility] = useState(null)
  const [connections, setConnections] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dob, setDob] = useState('')
  const [code, setCode] = useState('')
  const [myCode, setMyCode] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [elig, conns] = await Promise.all([
        api.get('/api/connections/eligibility'),
        api.get('/api/connections'),
      ])
      setEligibility(elig.data?.data || elig.data)
      setConnections(conns.data?.data || conns.data)
    } catch {
      toast.error('Could not load your connections.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const submitDob = async (e) => {
    e.preventDefault()
    if (!dob) return
    setBusy(true)
    try {
      const res = await api.post('/api/connections/age-check', { date_of_birth: dob })
      setEligibility(res.data?.data || res.data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save your date of birth.')
    } finally {
      setBusy(false)
    }
  }

  const generateCode = async () => {
    setBusy(true)
    try {
      const res = await api.post('/api/connections/code', {})
      setMyCode(res.data?.data || res.data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not create a code.')
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (e) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    try {
      await api.post('/api/connections/request', { code: code.trim().toUpperCase() })
      setCode('')
      toast.success('Request sent. They need to accept, then both your grown-ups approve.')
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not send that request.')
    } finally {
      setBusy(false)
    }
  }

  const respond = async (id, accept) => {
    setBusy(true)
    try {
      await api.post(`/api/connections/${id}/respond`, { accept })
      toast.success(accept ? 'Sent to your grown-ups for approval.' : 'Request declined.')
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not respond.')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id) => {
    setBusy(true)
    try {
      await api.post(`/api/connections/${id}/revoke`, {})
      toast.success('Connection removed.')
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not remove that connection.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto p-6 text-neutral-500">Loading...</div>
  }

  const state = eligibility?.state

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-neutral-900">Connections</h1>
      <p className="text-neutral-600 mt-1">
        Connect with another student to see and comment on each other's work.
      </p>

      {/* Confirmed under 13. A dead end, but an explanation rather than an
          error — they did nothing wrong by being ten. */}
      {state === STATE_UNDER_13 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-5">
          <p className="text-neutral-800">{eligibility.reason}</p>
          <p className="text-sm text-neutral-600 mt-2">
            In the meantime, your parent, guardian, and teachers can already see
            everything you make.
          </p>
        </div>
      )}

      {state === STATE_NEEDS_PARENT_DOB && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-5">
          <p className="text-neutral-800">{eligibility.reason}</p>
        </div>
      )}

      {/* The age screen. Note the ordering of the copy: the question comes
          first, and the 13+ rule is explained under the button rather than
          above the input. Leading with the rule turns the field into a
          multiple-choice question with one obviously correct answer. */}
      {state === STATE_NEEDS_DOB && (
        <form onSubmit={submitDob} className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
          <label htmlFor="dob" className="block font-medium text-neutral-900">
            What's your date of birth?
          </label>
          <input
            id="dob"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2"
            required
          />
          <button
            type="submit"
            disabled={busy || !dob}
            className="mt-3 rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-white font-medium disabled:opacity-50"
          >
            Continue
          </button>
          <p className="text-sm text-neutral-500 mt-3">
            You can only answer this once, so check it before you continue. Ask a
            parent, guardian, or your school if you need it changed later.
          </p>
        </form>
      )}

      {state === STATE_ELIGIBLE && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-neutral-200 bg-white p-5">
              <h2 className="font-semibold text-neutral-900">Your code</h2>
              <p className="text-sm text-neutral-600 mt-1">
                Show this to someone in person. It expires in a week.
              </p>
              {myCode ? (
                <p className="mt-3 font-mono text-2xl tracking-widest text-optio-purple">
                  {myCode.code}
                </p>
              ) : (
                <button
                  onClick={generateCode}
                  disabled={busy}
                  className="mt-3 rounded-md border border-optio-purple px-4 py-2 text-optio-purple font-medium disabled:opacity-50"
                >
                  Get a code
                </button>
              )}
            </div>

            <form onSubmit={submitCode} className="rounded-lg border border-neutral-200 bg-white p-5">
              <label htmlFor="peer-code" className="block font-semibold text-neutral-900">
                Enter their code
              </label>
              <p className="text-sm text-neutral-600 mt-1">
                Type the code another student gave you.
              </p>
              <input
                id="peer-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="ABCD2345"
                className="mt-3 w-full rounded-md border border-neutral-300 px-3 py-2 font-mono tracking-widest"
              />
              <button
                type="submit"
                disabled={busy || !code.trim()}
                className="mt-3 rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-white font-medium disabled:opacity-50"
              >
                Send request
              </button>
            </form>
          </div>

          <div className="mt-6 rounded-lg bg-neutral-50 border border-neutral-200 p-4">
            <p className="text-sm text-neutral-700">
              Both of you have to say yes, and then both of your parents or
              guardians approve it. Either of you, or either grown-up, can undo a
              connection at any time.
            </p>
          </div>

          <div className="mt-8">
            {connections?.incoming?.length > 0 && (
              <Section title="Requests for you">
                {connections.incoming.map((item) => (
                  <PeerRow key={item.id} item={item}>
                    <button
                      onClick={() => respond(item.id, true)}
                      disabled={busy}
                      className="rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-3 py-1.5 text-sm text-white font-medium disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respond(item.id, false)}
                      disabled={busy}
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </PeerRow>
                ))}
              </Section>
            )}

            {connections?.awaiting_approval?.length > 0 && (
              <Section
                title="Waiting on grown-ups"
                description="Both of you said yes. Now each of your parents or guardians needs to approve."
              >
                {connections.awaiting_approval.map((item) => (
                  <PeerRow key={item.id} item={{ ...item, statusLabel: 'Waiting for approval' }}>
                    <button
                      onClick={() => revoke(item.id)}
                      disabled={busy}
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </PeerRow>
                ))}
              </Section>
            )}

            {connections?.outgoing?.length > 0 && (
              <Section title="Requests you sent">
                {connections.outgoing.map((item) => (
                  <PeerRow key={item.id} item={{ ...item, statusLabel: 'Waiting for them to accept' }}>
                    <button
                      onClick={() => revoke(item.id)}
                      disabled={busy}
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </PeerRow>
                ))}
              </Section>
            )}

            <Section
              title="Connected"
              description={connections?.active?.length ? null : 'No connections yet.'}
            >
              {connections?.active?.map((item) => (
                <PeerRow key={item.id} item={item}>
                  <button
                    onClick={() => revoke(item.id)}
                    disabled={busy}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </PeerRow>
              ))}
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
