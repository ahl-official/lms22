import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './router/ProtectedRoute'
import Layout from './components/Layout'
import useAuth from './hooks/useAuth'

const Login = lazy(() => import('./pages/auth/Login'))
const AdminOverview = lazy(() => import('./pages/admin/Overview'))
const AdminStudents = lazy(() => import('./pages/admin/Students'))
const AdminTrainers = lazy(() => import('./pages/admin/Trainers'))
const AdminCourses = lazy(() => import('./pages/admin/AllCourses'))
const AdminCategories = lazy(() => import('./pages/admin/Categories'))
const AdminAISettings = lazy(() => import('./pages/admin/AISettings'))
const AdminWhatsApp = lazy(() => import('./pages/admin/Whatsapp'))
const AdminModuleReview = lazy(() => import('./pages/admin/ModuleReview'))
const AdminStudentProgress = lazy(() => import('./pages/admin/StudentProgress'))
const TrainerDashboard = lazy(() => import('./pages/trainer/Dashboard'))
const TrainerCourses = lazy(() => import('./pages/trainer/Courses'))
const TrainerCreateCourse = lazy(() => import('./pages/trainer/CreateCourse'))
const TrainerTrainees = lazy(() => import('./pages/trainer/Trainees'))
const TrainerAnalytics = lazy(() => import('./pages/trainer/Analytics'))
const TrainerRecommendations = lazy(() => import('./pages/trainer/Recommendations'))
const MyCourses = lazy(() => import('./pages/trainee/MyCourses'))
const CourseView = lazy(() => import('./pages/trainee/CourseView'))
const TestResult = lazy(() => import('./pages/trainee/TestResult'))
const VoiceTest = lazy(() => import('./pages/trainee/VoiceTest'))

const Spinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
  </div>
)

function RootRedirect() {
  const { isAuthenticated, primaryRole } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  const role = primaryRole()
  const home = { admin: '/admin', trainer: '/trainer', trainee: '/trainee' }
  return <Navigate to={home[role] || '/login'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><Layout /></ProtectedRoute>}>
            <Route index element={<AdminOverview />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="trainers" element={<AdminTrainers />} />
            <Route path="courses" element={<AdminCourses />} />
            <Route path="progress" element={<AdminStudentProgress />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="ai-settings" element={<AdminAISettings />} />
            <Route path="whatsapp" element={<AdminWhatsApp />} />
            <Route path="users" element={<AdminStudents />} />
            <Route path="module-review" element={<AdminModuleReview />} />
          </Route>

          {/* Trainer */}
          <Route path="/trainer" element={<ProtectedRoute allowedRoles={['trainer']}><Layout /></ProtectedRoute>}>
            <Route index element={<TrainerDashboard />} />
            <Route path="courses" element={<TrainerCourses />} />
            <Route path="courses/new" element={<TrainerCreateCourse />} />
            <Route path="courses/:id/edit" element={<TrainerCreateCourse />} />
            <Route path="trainees" element={<TrainerTrainees />} />
            <Route path="analytics" element={<TrainerAnalytics />} />
            <Route path="recommendations" element={<TrainerRecommendations />} />
          </Route>

          {/* Trainee */}
          <Route path="/trainee" element={<ProtectedRoute allowedRoles={['trainee']}><Layout /></ProtectedRoute>}>
            <Route index element={<MyCourses />} />
            <Route path="courses/:id" element={<CourseView />} />
            <Route path="results/:attemptId" element={<TestResult />} />
          </Route>

          {/* Voice test — fullscreen, outside Layout */}
          <Route path="/voice-test/:courseId" element={
            <ProtectedRoute allowedRoles={['trainee']}>
              <VoiceTest />
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}