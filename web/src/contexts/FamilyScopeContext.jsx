import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './AuthContext'
import { useFamilyChildren } from '../hooks/api/useFamilyChildren'
import { queryKeys } from '../utils/queryKeys'
import { userHasRole } from '../utils/userRoles'

/**
 * Family scope: which child a parent is currently working as themselves FOR.
 *
 * A parent picks a child on the Family dashboard and the child's own pages --
 * dashboard, quests, quest detail, journal, portfolio, classes -- render
 * pointed at that child. Every read adds `?student_id=` and every write
 * carries `student_id`; the backend's @student_scope verifies the guardian
 * and swaps whose rows the route touches (backend/utils/guardian_scope.py).
 * The parent stays signed in as themselves: no token swap, no page reload,
 * and the rows a parent writes name the parent.
 *
 * This replaced the "act as" session on 2026-09-15 (its context, restore
 * service and banners were deleted the same week). That mechanism minted the
 * child's credentials for the parent's tab and forced a full reload to flush
 * the query cache; it also admitted only managed under-13 profiles, which is
 * how a parent came to be told she could not help her 12-year-old because he
 * had an email address.
 *
 * Rules:
 *  - Scope is entered ONLY by the user (or a legacy-route redirect). It is
 *    never auto-selected, so an org admin or advisor who is also a parent
 *    keeps their own pages until they pick a child.
 *  - The selection is remembered per parent in localStorage and restored
 *    only while that child is still in the family.
 *  - Changing scope invalidates every "whose rows" query so nothing from the
 *    previous child survives the switch.
 */

const FamilyScopeContext = createContext(null)

const storageKey = (userId) => `optio.familyScope.${userId}`

function readStored(userId) {
  if (!userId) return null
  try {
    return localStorage.getItem(storageKey(userId)) || null
  } catch {
    return null
  }
}

function writeStored(userId, childId) {
  if (!userId) return
  try {
    if (childId) localStorage.setItem(storageKey(userId), childId)
    else localStorage.removeItem(storageKey(userId))
  } catch {
    // storage unavailable (private mode, quota) -- the selection just does
    // not survive a reload
  }
}

/**
 * Does this account have anyone to be a guardian FOR?
 *
 * The ONE predicate for "is this a parent" in the web chrome. Sidebar,
 * PrivateRoute, TopNavbar and the registration gate all read it; until
 * 2026-09-15 each carried its own copy, and PrivateRoute's omitted org_roles,
 * so an iCreate parent (role='org_managed', org_roles=['parent']) passed the
 * parent routes only because effectiveRole happened to say 'parent' too.
 */
export function userHasFamily(user) {
  if (!user) return false
  return Boolean(
    user.has_dependents || user.has_linked_students ||
    userHasRole(user, 'parent'),
  )
}

/**
 * Roles that give a person a learning-app surface of their OWN: a student
 * has their own quests, an advisor and an org admin have their teaching home,
 * a superadmin has everything. A campus coordinator does not: their work is
 * on the SIS console, so in this app they are a guardian and nothing else.
 */
const OWN_SURFACE_ROLES = ['student', 'advisor', 'org_admin', 'superadmin']

/**
 * Must this person work through a child on the student surfaces?
 *
 * True for a parent, a parent who is also an observer, and a parent who is
 * also a campus coordinator (four of iCreate's coordinators enrol their own
 * children). False for a student, and for a teacher or org admin who is also
 * a parent -- they have their own copy of every student page and pick a
 * child from the ProfileSwitcher when they want the child's.
 *
 * This is what PrivateRoute's requireFamilyScope asks. It used to ask
 * `effectiveRole === 'parent'`, which took org_roles[0]; a coordinator-parent
 * was 'campus_coordinator' first, skipped the guard, and opened a quest link
 * as herself (tickets 94f42ce7 / 96ca40f3, 2026-09-15).
 */
export function worksThroughFamily(user) {
  if (!userHasFamily(user)) return false
  return !OWN_SURFACE_ROLES.some((role) => userHasRole(user, role))
}

export const FamilyScopeProvider = ({ children }) => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const hasFamily = userHasFamily(user)
  const { data: familyChildren = [], isLoading } = useFamilyChildren({ enabled: hasFamily && !!user?.id })

  const [selectedChildId, setSelectedChildId] = useState(() => readStored(user?.id))

  // A new signed-in user (login, logout, masquerade) gets their own stored
  // selection, never the previous account's.
  useEffect(() => {
    setSelectedChildId(readStored(user?.id))
  }, [user?.id])

  // Drop a remembered child who is no longer in the family (removed, or a
  // stale value from another account on this browser).
  useEffect(() => {
    if (isLoading || !selectedChildId) return
    if (!familyChildren.some((c) => c.id === selectedChildId)) {
      setSelectedChildId(null)
      writeStored(user?.id, null)
    }
  }, [familyChildren, isLoading, selectedChildId, user?.id])

  const enterScope = useCallback((childId) => {
    if (!childId || childId === selectedChildId) return
    setSelectedChildId(childId)
    writeStored(user?.id, childId)
    queryKeys.invalidateScoped(queryClient)
  }, [queryClient, selectedChildId, user?.id])

  const exitScope = useCallback(() => {
    if (!selectedChildId) return
    setSelectedChildId(null)
    writeStored(user?.id, null)
    queryKeys.invalidateScoped(queryClient)
  }, [queryClient, selectedChildId, user?.id])

  const selectedChild = useMemo(
    () => familyChildren.find((c) => c.id === selectedChildId) || null,
    [familyChildren, selectedChildId],
  )

  const value = useMemo(() => ({
    hasFamily,
    children: familyChildren,
    isLoading: hasFamily && isLoading,
    selectedChild,
    selectedChildId: selectedChild ? selectedChild.id : null,
    isScoped: !!selectedChild,
    enterScope,
    exitScope,
  }), [hasFamily, familyChildren, isLoading, selectedChild, enterScope, exitScope])

  return (
    <FamilyScopeContext.Provider value={value}>
      {children}
    </FamilyScopeContext.Provider>
  )
}

FamilyScopeProvider.propTypes = {
  children: PropTypes.node,
}

const NO_SCOPE = {
  hasFamily: false,
  children: [],
  isLoading: false,
  selectedChild: null,
  selectedChildId: null,
  isScoped: false,
  enterScope: () => {},
  exitScope: () => {},
}

/**
 * Safe outside the provider (public pages, isolated component tests): an
 * unscoped, familyless answer, so a page that merely asks "am I in scope"
 * does not need the whole app around it.
 */
export const useFamilyScope = () => useContext(FamilyScopeContext) || NO_SCOPE

export default FamilyScopeContext
