/**
 * OEA diploma pathway selection (/hearthwood/student/:studentId/pathway).
 *
 * Reached per-student from the OEA landing page. Shows the three pathways as a
 * comparison and saves the parent's choice. Selection is immediate and
 * reversible (the parent may change it anytime, no approval).
 *
 * Web port of frontend-v2/app/(app)/oea/select-pathway.tsx.
 */
import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { oeaAPI } from '../../services/api'
import PathwayCard from './PathwayCard'

export default function OEASelectPathwayPage() {
  const navigate = useNavigate()
  const { studentId } = useParams()
  const location = useLocation()
  const studentName = location.state?.studentName

  const [pathways, setPathways] = useState([])
  const [selectedKey, setSelectedKey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [pathwaysRes, enrollmentRes] = await Promise.all([
          oeaAPI.pathways(),
          studentId ? oeaAPI.studentEnrollment(studentId) : Promise.resolve(null),
        ])
        if (cancelled) return
        setPathways(pathwaysRes.data?.pathways || [])
        const current = enrollmentRes?.data?.enrollment?.pathway_key
        if (current) setSelectedKey(current)
      } catch (err) {
        if (!cancelled) toast.error(err.response?.data?.error || 'Could not load pathways.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [studentId])

  const handleSelect = async (key) => {
    if (!studentId || saving) return
    setSelectedKey(key)
    setSaving(true)
    try {
      await oeaAPI.selectPathway(studentId, key)
      toast.success('Pathway saved')
      navigate('/hearthwood')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save your pathway choice.')
      setSaving(false)
    }
  }

  const title = studentName ? `Choose ${studentName}'s pathway` : 'Choose a diploma pathway'

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 font-poppins">
      <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
      <p className="text-neutral-500 mt-1">
        All three pathways require 24 credits. You can change this anytime.
      </p>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {pathways.map((p) => (
            <PathwayCard
              key={p.key}
              pathway={p}
              selected={selectedKey === p.key}
              saving={saving}
              onSelect={handleSelect}
            />
          ))}
          <button
            type="button"
            onClick={() => navigate('/hearthwood')}
            disabled={saving}
            className="text-sm text-optio-purple font-medium"
          >
            Back
          </button>
        </div>
      )}
    </div>
  )
}
