import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ImagesPage from './pages/ImagesPage'
import AnnotatorPage from './pages/AnnotatorPage'
import ReviewPage from './pages/ReviewPage'
import DatasetsPage from './pages/DatasetsPage'
import ModelsPage from './pages/ModelsPage'
import ManufacturersPage from './pages/ManufacturersPage'
import UsersPage from './pages/UsersPage'

function PrivateRoute({ children, roles }) {
  const { user, token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ style: { background:'#1f2937', color:'#f3f4f6', border:'1px solid #374151' } }} />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="images" element={<ImagesPage />} />
          <Route path="images/:id/annotate" element={<AnnotatorPage />} />
          <Route path="review" element={<PrivateRoute roles={['admin','reviewer']}><ReviewPage /></PrivateRoute>} />
          <Route path="datasets" element={<PrivateRoute roles={['admin','reviewer']}><DatasetsPage /></PrivateRoute>} />
          <Route path="models" element={<PrivateRoute roles={['admin']}><ModelsPage /></PrivateRoute>} />
          <Route path="manufacturers" element={<PrivateRoute roles={['admin']}><ManufacturersPage /></PrivateRoute>} />
          <Route path="users" element={<PrivateRoute roles={['admin']}><UsersPage /></PrivateRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
