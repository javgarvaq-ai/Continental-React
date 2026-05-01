import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import PosPage from './pages/PosPage'
import ProtectedRoute from './components/ProtectedRoute'
import WeeklyReportPage from './pages/WeeklyReportPage'
import InventoryPage from './pages/InventoryPage'
import SetupAdminPage from './pages/SetupAdminPage'
import AuthRoute from './components/AuthRoute'
import UsersAdminPage from './pages/UsersAdminPage'
import ProductsAdminPage from './pages/ProductsAdminPage'
import InventoryItemsAdminPage from './pages/InventoryItemsAdminPage'
import RecipeMappingAdminPage from './pages/RecipeMappingAdminPage'
import CategoriesAdminPage from './pages/CategoriesAdminPage'
import MembershipPlansAdminPage from './pages/MembershipPlansAdminPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup-admin" element={<SetupAdminPage />} />

        <Route
          path="/pos"
          element={
            <ProtectedRoute>
              <PosPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/recipe-mappings"
          element={
            <AuthRoute>
              <RecipeMappingAdminPage />
            </AuthRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AuthRoute>
              <UsersAdminPage />
            </AuthRoute>
          }
        />
        <Route
          path="/admin/inventory-items"
          element={
            <AuthRoute>
              <InventoryItemsAdminPage />
            </AuthRoute>
          }
        />
        <Route
          path="/admin/membership-plans"
          element={
            <AuthRoute>
              <MembershipPlansAdminPage />
            </AuthRoute>
          }
        />
        <Route
          path="/admin/categories"
          element={
            <AuthRoute>
              <CategoriesAdminPage />
            </AuthRoute>
          }
        />
        <Route
          path="/admin/products"
          element={
            <AuthRoute>
              <ProductsAdminPage />
            </AuthRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute>
              <InventoryPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/weekly-report"
          element={
            <ProtectedRoute>
              <WeeklyReportPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App