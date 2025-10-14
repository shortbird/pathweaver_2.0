import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { DemoProvider } from './contexts/DemoContext'
import ErrorBoundary from './components/ErrorBoundary'
import { warmupBackend } from './utils/retryHelper'

import Layout from './components/Layout'
import ScrollToTop from './components/ScrollToTop'
import HomePage from './pages/HomePage'
import PromoLandingPage from './pages/PromoLandingPage'
import DemoPage from './pages/DemoPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import EmailVerificationPage from './pages/EmailVerificationPage'
import DashboardPage from './pages/DashboardPage'
import TermsOfService from './pages/TermsOfService'
import PrivacyPolicy from './pages/PrivacyPolicy'
// Quest Pages
import QuestBadgeHub from './pages/QuestBadgeHub'
import QuestDetail from './pages/QuestDetail'
// Badge Pages
import BadgeDetail from './pages/BadgeDetail'
import BadgeProgressPage from './pages/BadgeProgressPage'
import ConstellationPage from './pages/ConstellationPage'
// Credit & Transcript Pages
import CreditTrackerPage from './pages/CreditTrackerPage'
import TranscriptPage from './pages/TranscriptPage'
// Other Pages
import DiplomaPage from './pages/DiplomaPage'
import ProfilePage from './pages/ProfilePage'
import FriendsPage from './pages/FriendsPage'
import CommunicationPage from './pages/CommunicationPage'
import CalendarPage from './pages/CalendarPage'
import SubscriptionPage from './pages/SubscriptionPage'
import SubscriptionSuccess from './pages/SubscriptionSuccess'
import SubscriptionCancel from './pages/SubscriptionCancel'
import AdminPage from './pages/AdminPage'
import AdvisorDashboard from './pages/AdvisorDashboard'
import AdvisorBadgeForm from './pages/AdvisorBadgeForm'
import PrivateRoute from './components/PrivateRoute'

// Configure React Query with proper defaults for data freshness
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // Data is fresh for 30 seconds
      cacheTime: 5 * 60 * 1000, // Cache data for 5 minutes
      refetchOnWindowFocus: true, // Refetch when window regains focus
      refetchOnReconnect: true, // Refetch when reconnecting
      retry: 3, // Retry failed requests 3 times
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    },
    mutations: {
      retry: 2, // Retry mutations twice on failure
    },
  },
})

function App() {
  // Warm up the backend service on app load (helps with Render cold starts)
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    warmupBackend(`${apiUrl}/api`);
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Router>
          <ScrollToTop />
          <AuthProvider>
            <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
                marginTop: '70px',
                marginRight: '20px',
                zIndex: 9999,
              },
            }}
          />
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="promo" element={<PromoLandingPage />} />
              <Route path="demo" element={<DemoProvider><DemoPage /></DemoProvider>} />
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="email-verification" element={<EmailVerificationPage />} />
              <Route path="terms" element={<TermsOfService />} />
              <Route path="privacy" element={<PrivacyPolicy />} />
              <Route path="portfolio/:slug" element={<DiplomaPage />} />
              <Route path="diploma/:userId" element={<DiplomaPage />} />
              <Route path="subscription/success" element={<SubscriptionSuccess />} />
              <Route path="subscription/cancel" element={<SubscriptionCancel />} />
              
              <Route element={<PrivateRoute />}>
                <Route path="dashboard" element={<DashboardPage />} />
                {/* Quest Routes */}
                <Route path="quests" element={<QuestBadgeHub />} />
                <Route path="quests/:id" element={<QuestDetail />} />
                {/* Badge Routes */}
                <Route path="badges" element={<QuestBadgeHub />} />
                <Route path="badges/:badgeId" element={<BadgeDetail />} />
                <Route path="badge-progress" element={<BadgeProgressPage />} />
                <Route path="constellation" element={<ConstellationPage />} />
                {/* Credit & Transcript Routes */}
                <Route path="credits" element={<CreditTrackerPage />} />
                <Route path="transcript" element={<TranscriptPage />} />
                {/* Other Routes */}
                <Route path="diploma" element={<DiplomaPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="friends" element={<FriendsPage />} />
                <Route path="communication" element={<CommunicationPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="subscription" element={<SubscriptionPage />} />
              </Route>
              
              <Route element={<PrivateRoute requiredRole="admin" />}>
                <Route path="admin/*" element={<AdminPage />} />
              </Route>

              <Route element={<PrivateRoute requiredRole="advisor" />}>
                <Route path="advisor" element={<AdvisorDashboard />} />
                <Route path="advisor/badges/create" element={<AdvisorBadgeForm />} />
                <Route path="advisor/badges/:badgeId/edit" element={<AdvisorBadgeForm />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
