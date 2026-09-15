import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { QRCodeSVG } from 'qrcode.react'
import * as friends from '../services/friendsAPI'

/**
 * Friends — the student's page.
 *
 * Students asked to add each other as friends so they could see each other's
 * work and cheer it on. What makes that safe is mostly invisible from here,
 * and deliberately so: the page's job is to make the safe path the obvious one.
 *
 * Two things about the design are load-bearing rather than cosmetic:
 *
 *   1. THERE IS NO GLOBAL SEARCH. You cannot look another student up by name.
 *      Discovery is limited to pools the platform vouches for: classmates (you
 *      share an active class and already see them in the class chat), a code
 *      the other student shows you in person or sends as a link, a parent
 *      connecting two families, and (where a school opts in) the school
 *      itself. If you find yourself adding a directory or a "people you may
 *      know" list, that is the safety property being removed, not a feature
 *      being added. A student whose family has not turned Friends on is in no
 *      pool at all, and a code of theirs answers "not valid" exactly as a code
 *      that never existed would.
 *
 *   2. THE AGE QUESTION IS NEUTRAL AND ASKED FIRST. The DOB prompt does not say
 *      "you must be 13+" above the input — that just tells a ten-year-old which
 *      year to type. It asks for a birthday, and the consequence is explained
 *      after the answer is given. The answer is also one-shot: the backend locks
 *      it, so the copy here promises nothing it can't keep.
 *
 * Since 2026-09-16 the gate is the family's Friends policy, not the student's
 * age: a parent turns Friends on per child (Family settings) and the student
 * connects inside the rules the parent chose. When it is off, the page names
 * who could turn it on rather than presenting a dead end. The age screen
 * remains for the one population with nobody to answer for them — a platform
 * student with no parent linked and no date of birth on file.
 *
 * Arrives with ?code= from an invite link (FriendInvitePage stashes it for a
 * signed-out visitor and sends them here after login).
 *
 * Backed by /api/connections (backend/services/peer_connection_service.py and
 * peer_policy_service.py, which is where the actual rules live).
 */

const STATE_ELIGIBLE = 'eligible'
const STATE_NEEDS_DOB = 'needs_dob'
const STATE_FRIENDS_OFF = 'friends_off'
const STATE_MODULE_OFF = 'module_off'

const STATE_LABEL = {
  none: null,
  outgoing: 'Request sent',
  incoming: 'Wants to be your friend',
  awaiting_approval: 'Waiting on a grown-up',
  active: 'Friends',
}

function Avatar({ peer }) {
  if (peer?.avatar_url) {
    return <img src={peer.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
  }
  return (
    <div className="h-10 w-10 rounded-full bg-optio-purple/10 text-optio-purple flex items-center justify-center font-semibold">
      {(peer?.display_name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

function Section({ title, description, children }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">{title}</h2>
      {description && <p className="text-sm text-neutral-500 mt-1">{description}</p>}
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

const primaryBtn = 'rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-3 py-1.5 text-sm text-white font-medium disabled:opacity-50'
const secondaryBtn = 'rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50'

export default function ConnectionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [eligibility, setEligibility] = useState(null)
  const [connections, setConnections] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dob, setDob] = useState('')
  const [code, setCode] = useState((searchParams.get('code') || '').toUpperCase())
  const [myCode, setMyCode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState(searchParams.get('code') ? 'code' : 'classmates')
  const [suggestions, setSuggestions] = useState(null)
  const arrivedByLink = !!searchParams.get('code')

  const load = useCallback(async () => {
    try {
      const [elig, conns] = await Promise.all([friends.getEligibility(), friends.getConnections()])
      setEligibility(elig)
      setConnections(conns)
    } catch {
      toast.error('Could not load your friends.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const loadSuggestions = useCallback(async () => {
    try {
      setSuggestions(await friends.getSuggestions())
    } catch {
      setSuggestions({ classmates: [], school: [], school_pool: false })
    }
  }, [])

  useEffect(() => {
    if (eligibility?.state === STATE_ELIGIBLE && tab === 'classmates' && suggestions === null) loadSuggestions()
  }, [eligibility?.state, tab, suggestions, loadSuggestions])

  const run = async (fn, okMessage) => {
    setBusy(true)
    try {
      await fn()
      if (okMessage) toast.success(okMessage)
      await load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const submitDob = async (e) => {
    e.preventDefault()
    if (!dob) return
    setBusy(true)
    try {
      setEligibility(await friends.submitDob(dob))
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save your date of birth.')
    } finally {
      setBusy(false)
    }
  }

  const generateCode = () => run(async () => setMyCode(await friends.issueCode()))

  const submitCode = async (e) => {
    e.preventDefault()
    if (!code.trim()) return
    await run(async () => {
      await friends.requestFriend({ code, source: arrivedByLink ? 'link' : undefined })
      setCode('')
      if (arrivedByLink) setSearchParams({}, { replace: true })
    }, 'Request sent. They need to accept, and their family\'s rules decide the rest.')
  }

  const askClassmate = (s) => run(async () => {
    await friends.requestFriend({ peerId: s.peer.id, source: s.class_names?.length ? 'classmates' : 'school' })
    await loadSuggestions()
  }, `Request sent to ${s.peer.display_name}.`)

  const respond = (id, accept) => run(
    () => friends.respond(id, accept),
    accept ? 'Accepted.' : 'Request declined.',
  )
  const revoke = (id) => run(() => friends.revoke(id), 'Removed.')

  const copyLink = async () => {
    if (!myCode) return
    await navigator.clipboard.writeText(friends.inviteLinkFor(myCode.code))
    toast.success('Link copied. It works for a week.')
  }

  const state = eligibility?.state
  const list = useMemo(() => connections || { active: [], incoming: [], outgoing: [], awaiting_approval: [] }, [connections])

  if (loading) {
    return <div className="max-w-2xl mx-auto p-6 text-neutral-500">Loading...</div>
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-neutral-900">Friends</h1>
      <p className="text-neutral-600 mt-1">
        Be friends with another student to see and cheer on each other&rsquo;s work.
      </p>

      {/* Friends is off for this student. Not a dead end: the reason names
          the adult who can turn it on, because that is the one thing the
          student can act on. */}
      {state === STATE_FRIENDS_OFF && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-5">
          <p className="text-neutral-800">{eligibility.reason}</p>
          <p className="text-sm text-neutral-600 mt-2">
            In the meantime, your parent, guardian, and teachers can already see
            everything you make.
          </p>
        </div>
      )}

      {state === STATE_MODULE_OFF && (
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
            What&rsquo;s your date of birth?
          </label>
          <input
            id="dob"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2"
            required
          />
          <button type="submit" disabled={busy || !dob} className={`mt-3 ${primaryBtn} px-4 py-2`}>
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
          {/* Add a friend: the vetted pools, as tabs. */}
          <div className="mt-6 rounded-lg border border-neutral-200 bg-white">
            <div role="tablist" aria-label="Add a friend" className="flex border-b border-neutral-200">
              {[['classmates', 'Classmates'], ['code', 'Your code'], ['enter', 'Enter a code']].map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`flex-1 px-3 py-2.5 text-sm font-medium ${tab === key ? 'text-optio-purple border-b-2 border-optio-purple' : 'text-neutral-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'classmates' && (
              <div className="p-5">
                {suggestions === null ? (
                  <p className="text-sm text-neutral-500">Loading classmates...</p>
                ) : suggestions.classmates.length === 0 && suggestions.school.length === 0 ? (
                  <p className="text-sm text-neutral-600">
                    No classmates to add right now. Use a code instead.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {suggestions.classmates.map((s) => (
                      <PeerRow key={s.peer.id} item={{ peer: s.peer, statusLabel: STATE_LABEL[s.state] || s.class_names.join(' · ') }}>
                        {s.state === 'none' && (
                          <button onClick={() => askClassmate(s)} disabled={busy} className={primaryBtn}>Ask</button>
                        )}
                      </PeerRow>
                    ))}
                    {suggestions.school.length > 0 && (
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide pt-2">At your school</p>
                    )}
                    {suggestions.school.map((s) => (
                      <PeerRow key={s.peer.id} item={{ peer: s.peer, statusLabel: STATE_LABEL[s.state] }}>
                        {s.state === 'none' && (
                          <button onClick={() => askClassmate(s)} disabled={busy} className={primaryBtn}>Ask</button>
                        )}
                      </PeerRow>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'code' && (
              <div className="p-5 flex flex-col items-center text-center">
                <h2 className="font-semibold text-neutral-900">Your code</h2>
                <p className="text-sm text-neutral-600 mt-1">
                  Show this to a friend in person, or send them the link. It works for a week.
                </p>
                {myCode ? (
                  <>
                    <div className="mt-4 rounded-lg bg-white p-3 border border-neutral-200">
                      <QRCodeSVG value={friends.inviteLinkFor(myCode.code)} size={168} />
                    </div>
                    <p className="mt-3 font-mono text-2xl tracking-widest text-optio-purple" aria-label={`Your code is ${myCode.code}`}>
                      {myCode.code}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={copyLink} className={secondaryBtn}>Copy link</button>
                      <button onClick={generateCode} disabled={busy} className={secondaryBtn}>New code</button>
                    </div>
                  </>
                ) : (
                  <button onClick={generateCode} disabled={busy} className={`mt-4 ${secondaryBtn} border-optio-purple text-optio-purple px-4 py-2 font-medium`}>
                    Get a code
                  </button>
                )}
              </div>
            )}

            {tab === 'enter' && (
              <form onSubmit={submitCode} className="p-5">
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
                <button type="submit" disabled={busy || !code.trim()} className={`mt-3 ${primaryBtn} px-4 py-2`}>
                  Send request
                </button>
              </form>
            )}
          </div>

          <div className="mt-6 rounded-lg bg-neutral-50 border border-neutral-200 p-4">
            <p className="text-sm text-neutral-700">
              Both of you have to say yes. Your families set the rules: some
              parents want to approve each friend first, and yours are told
              whenever you add one. Either of you, or either grown-up, can undo a
              connection at any time.
            </p>
          </div>

          <div className="mt-8">
            {list.incoming.length > 0 && (
              <Section title="Wants to be friends">
                {list.incoming.map((item) => (
                  <PeerRow key={item.id} item={{ ...item, statusLabel: item.source === 'parent' ? 'Sent by their parent' : null }}>
                    <button onClick={() => respond(item.id, true)} disabled={busy} className={primaryBtn}>Accept</button>
                    <button onClick={() => respond(item.id, false)} disabled={busy} className={secondaryBtn}>Decline</button>
                  </PeerRow>
                ))}
              </Section>
            )}

            {list.awaiting_approval.length > 0 && (
              <Section
                title="Waiting on a grown-up"
                description="Both of you said yes. A parent still has to say yes."
              >
                {list.awaiting_approval.map((item) => (
                  <PeerRow key={item.id} item={{ ...item, statusLabel: 'Waiting for approval' }}>
                    <button onClick={() => revoke(item.id)} disabled={busy} className={secondaryBtn}>Cancel</button>
                  </PeerRow>
                ))}
              </Section>
            )}

            {list.outgoing.length > 0 && (
              <Section title="Sent">
                {list.outgoing.map((item) => (
                  <PeerRow key={item.id} item={{ ...item, statusLabel: 'Waiting for them to accept' }}>
                    <button onClick={() => revoke(item.id)} disabled={busy} className={secondaryBtn}>Cancel</button>
                  </PeerRow>
                ))}
              </Section>
            )}

            <Section
              title="Friends"
              description={list.active.length ? null : 'No friends yet. Add a classmate, or share your code.'}
            >
              {list.active.map((item) => (
                <PeerRow key={item.id} item={item}>
                  {item.can_message && (
                    <Link to={friends.messagesLinkFor(item.peer.id)} className={secondaryBtn}>Message</Link>
                  )}
                  <button onClick={() => revoke(item.id)} disabled={busy} className={secondaryBtn}>Remove</button>
                </PeerRow>
              ))}
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
