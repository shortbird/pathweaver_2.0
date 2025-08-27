import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'

import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
// V3 Quest Pages
import QuestHubV3 from './pages/QuestHubV3'
import QuestDetailV3 from './pages/QuestDetailV3'
import DiplomaPageV3 from './pages/DiplomaPageV3'
// Legacy pages (to be removed)
import QuestsPage from './pages/QuestsPage'
import QuestDetailPage from './pages/QuestDetailPage'
import ProfilePage from './pages/ProfilePage'
import FriendsPage from './pages/FriendsPage'
import SubscriptionPage from './pages/SubscriptionPage'
import AdminPage from './pages/AdminPage'
import DiplomaPage from './pages/DiplomaPage'
import PrivateRoute from './components/PrivateRoute'

const queryClient = new QueryClient()

function App() {
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
              },
            }}
          />
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="portfolio/:slug" element={<DiplomaPage />} />
              <Route path="diploma/:userId" element={<DiplomaPageV3 />} />
              
              <Route element={<PrivateRoute />}>
                <Route path="dashboard" element={<DashboardPage />} />
                {/* V3 Quest Routes */}
                <Route path="quests" element={<QuestHubV3 />} />
                <Route path="quests/:id" element={<QuestDetailV3 />} />
                <Route path="diploma" element={<DiplomaPageV3 />} />
                {/* Legacy routes - keeping for now */}
                <Route path="quests-old" element={<QuestsPage />} />
                <Route path="quests-old/:id" element={<QuestDetailPage />} />
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