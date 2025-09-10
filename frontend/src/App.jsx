import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { DemoProvider } from './contexts/DemoContext'
import ErrorBoundary from './components/ErrorBoundary'
import { warmupBackend } from './utils/retryHelper'

import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import PromoLandingPage from './pages/PromoLandingPage'
import DemoPage from './pages/DemoPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import EmailVerificationPage from './pages/EmailVerificationPage'
import DashboardPage from './pages/DashboardPage'
import TermsOfService from './pages/TermsOfService'
import PrivacyPolicy from './pages/PrivacyPolicy'
import AcceptTermsPage from './pages/AcceptTermsPage'
// V3 Quest Pages
import QuestHubV3 from './pages/QuestHubV3Improved'
import QuestDetailV3 from './pages/QuestDetailV3'
import DiplomaPageV3 from './pages/DiplomaPageV3'
import ProfilePage from './pages/ProfilePage'
import FriendsPage from './pages/FriendsPage'
import SubscriptionPage from './pages/SubscriptionPage'
import SubscriptionSuccess from './pages/SubscriptionSuccess'
import SubscriptionCancel from './pages/SubscriptionCancel'
import AdminPage from './pages/AdminPage'
import PrivateRoute from './components/PrivateRoute'

const queryClient = new QueryClient()

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
              <Route path="portfolio/:slug" element={<DiplomaPageV3 />} />
              <Route path="diploma/:userId" element={<DiplomaPageV3 />} />
              <Route path="subscription/success" element={<SubscriptionSuccess />} />
              <Route path="subscription/cancel" element={<SubscriptionCancel />} />
              
              <Route element={<PrivateRoute />}>
                <Route path="accept-terms" element={<AcceptTermsPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                {/* V3 Quest Routes */}
                <Route path="quests" element={<QuestHubV3 />} />
                <Route path="quests/:id" element={<QuestDetailV3 />} />
                <Route path="diploma" element={<DiplomaPageV3 />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="friends" element={<FriendsPage />} />
                <Route path="subscription" element={<SubscriptionPage />} />
              </Route>
              
              <Route element={<PrivateRoute requiredRole="admin" />}>
                <Route path="admin/*" element={<AdminPage />} />
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