import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { AuthPage } from './pages/AuthPage'
import { HomePage } from './pages/HomePage'
import { MessagesPage } from './pages/MessagesPage'
import { ProfilePage } from './pages/ProfilePage'
import { SearchPage } from './pages/SearchPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { SettingsPage } from './pages/SettingsPage'
import { AIPage } from './pages/AIPage'
import { PostPage } from './pages/PostPage'
import { StoryViewer } from './components/stories/StoryViewer'
import { Sidebar } from './components/layout/Sidebar'
import { MobileNav } from './components/layout/MobileNav'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { EditProfilePage } from './pages/EditProfilePage'
import { CreatePostPage } from './pages/CreatePostPage'
import { ReelsPage } from './pages/ReelsPage'
import { NotFoundPage } from './pages/NotFoundPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    )
  }
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-7xl gap-6 px-3 py-4 md:px-6 lg:px-8">
        <Sidebar />
        <main className="flex-1">{children}</main>
      </div>
      <MobileNav />
    </div>
  )
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout>
                <HomePage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reels"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ReelsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <AppLayout>
                <MessagesPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/messages/:id"
          element={
            <ProtectedRoute>
              <AppLayout>
                <MessagesPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProfilePage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/:username"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProfilePage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/edit-profile"
          element={
            <ProtectedRoute>
              <AppLayout>
                <EditProfilePage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/post/new"
          element={
            <ProtectedRoute>
              <AppLayout>
                <CreatePostPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/post/:id"
          element={
            <ProtectedRoute>
              <AppLayout>
                <PostPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/search"
          element={
            <ProtectedRoute>
              <AppLayout>
                <SearchPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/search/:query"
          element={
            <ProtectedRoute>
              <AppLayout>
                <SearchPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <AppLayout>
                <NotificationsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <AppLayout>
                <SettingsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai"
          element={
            <ProtectedRoute>
              <AppLayout>
                <AIPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <NotFoundPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
      <StoryViewer />
    </>
  )
}
