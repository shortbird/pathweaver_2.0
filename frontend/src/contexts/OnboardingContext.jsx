/**
 * OnboardingContext
 *
 * Manages the first-course guided walkthrough state.
 * Triggers when a user enters a course homepage and has not completed the tutorial.
 * Persists step progress to localStorage across refreshes.
 * Calls API to set tutorial_completed_at on completion.
 */

import { createContext, useContext, useState, useCallback } from 'react'
import api from '../services/api'

const OnboardingContext = createContext()

export const useOnboarding = () => {
  const context = useContext(OnboardingContext)
  if (!context) {
    return {
      isActive: false,
      currentStep: 0,
      startOnboarding: () => {},
      nextStep: () => {},
      prevStep: () => {},
      skipOnboarding: () => {},
      completeOnboarding: () => {},
    }
  }
  return context
}

const STORAGE_KEY = 'optio-onboarding-step'
const TOTAL_STEPS = 9

export const OnboardingProvider = ({ children }) => {
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? parseInt(saved, 10) : 0
  })

  const finishOnboarding = useCallback(async () => {
    setIsActive(false)
    localStorage.removeItem(STORAGE_KEY)
    try {
      await api.patch('/api/auth/tutorial-completed', {})
    } catch (err) {
      console.warn('Failed to mark tutorial completed:', err)
    }
  }, [])

  const startOnboarding = useCallback(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    const step = saved ? parseInt(saved, 10) : 0
    setCurrentStep(step)
    setIsActive(true)
  }, [])

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      const next = prev + 1
      if (next >= TOTAL_STEPS) {
        finishOnboarding()
        return prev
      }
      localStorage.setItem(STORAGE_KEY, next.toString())
      return next
    })
  }, [finishOnboarding])

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => {
      const next = Math.max(0, prev - 1)
      localStorage.setItem(STORAGE_KEY, next.toString())
      return next
    })
  }, [])

  const skipOnboarding = useCallback(() => {
    finishOnboarding()
  }, [finishOnboarding])

  const completeOnboarding = useCallback(() => {
    finishOnboarding()
  }, [finishOnboarding])

  return (
    <OnboardingContext.Provider
      value={{
        isActive,
        currentStep,
        totalSteps: TOTAL_STEPS,
        startOnboarding,
        nextStep,
        prevStep,
        skipOnboarding,
        completeOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  )
}

export default OnboardingContext
