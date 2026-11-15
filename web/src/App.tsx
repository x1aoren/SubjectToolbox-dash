import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, CatalogProvider, ThemeProvider, ToastProvider, useAuth } from './lib/app-context'
import { ConsoleLayout } from './components/console-layout'
import { BrandLoader, NoPermission } from './components/shell-bits'
import { LoginPage } from './pages/login'
import { DashboardPage } from './pages/dashboard'
import { DevicesPage } from './pages/devices'
import { DeviceDetailPage } from './pages/device-detail'
import { ToolsPage } from './pages/tools'
import { ErrorsPage } from './pages/errors'
import { EventsPage } from './pages/events'
import { FeedbackPage } from './pages/feedback'
import { ControlOverviewPage } from './pages/control'
import { ControlToolsPage } from './pages/control-tools'
import { ControlAnnouncementsPage } from './pages/control-announcements'
import { ControlReleasePage } from './pages/control-release'
import { ControlHistoryPage } from './pages/control-history'
import { TeamPage } from './pages/team'
import { RolesPage } from './pages/roles'
import { AuditPage } from './pages/audit'
import { SettingsPage } from './pages/settings'
import { IntegrationPage } from './pages/integration'
import { DataPage } from './pages/data'
import { NotFoundPage } from './pages/not-found'

function RequireAuth(): React.JSX.Element {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <BrandLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

function RequirePermission({
  permission,
  children,
}: {
  permission: string
  children: React.JSX.Element
}): React.JSX.Element {
  const { can } = useAuth()
  if (!can(permission)) return <NoPermission />
  return children
}

export function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <CatalogProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<ConsoleLayout />}>
                  <Route
                    index
                    element={
                      <RequirePermission permission="dashboard.view">
                        <DashboardPage />
                      </RequirePermission>
                    }
                  />
                  <Route path="telemetry">
                    <Route
                      path="devices"
                      element={
                        <RequirePermission permission="telemetry.view">
                          <DevicesPage />
                        </RequirePermission>
                      }
                    />
                    <Route
                      path="devices/:sn"
                      element={
                        <RequirePermission permission="telemetry.view">
                          <DeviceDetailPage />
                        </RequirePermission>
                      }
                    />
                    <Route
                      path="tools"
                      element={
                        <RequirePermission permission="telemetry.view">
                          <ToolsPage />
                        </RequirePermission>
                      }
                    />
                    <Route
                      path="errors"
                      element={
                        <RequirePermission permission="telemetry.view">
                          <ErrorsPage />
                        </RequirePermission>
                      }
                    />
                    <Route
                      path="events"
                      element={
                        <RequirePermission permission="telemetry.view">
                          <EventsPage />
                        </RequirePermission>
                      }
                    />
                  </Route>
                  <Route path="control">
                    <Route
                      index
                      element={
                        <RequirePermission permission="config.view">
                          <ControlOverviewPage />
                        </RequirePermission>
                      }
                    />
                    <Route
                      path="tools"
                      element={
                        <RequirePermission permission="config.view">
                          <ControlToolsPage />
                        </RequirePermission>
                      }
                    />
                    <Route
                      path="announcements"
                      element={
                        <RequirePermission permission="config.view">
                          <ControlAnnouncementsPage />
                        </RequirePermission>
                      }
                    />
                    <Route
                      path="release"
                      element={
                        <RequirePermission permission="config.view">
                          <ControlReleasePage />
                        </RequirePermission>
                      }
                    />
                    <Route
                      path="history"
                      element={
                        <RequirePermission permission="config.view">
                          <ControlHistoryPage />
                        </RequirePermission>
                      }
                    />
                  </Route>
                  <Route
                    path="feedback"
                    element={
                      <RequirePermission permission="feedback.view">
                        <FeedbackPage />
                      </RequirePermission>
                    }
                  />
                  <Route path="team">
                    <Route
                      index
                      element={
                        <RequirePermission permission="users.view">
                          <TeamPage />
                        </RequirePermission>
                      }
                    />
                    <Route
                      path="roles"
                      element={
                        <RequirePermission permission="users.view">
                          <RolesPage />
                        </RequirePermission>
                      }
                    />
                    <Route
                      path="audit"
                      element={
                        <RequirePermission permission="audit.view">
                          <AuditPage />
                        </RequirePermission>
                      }
                    />
                  </Route>
                  <Route path="settings" element={<SettingsPage />} />
                  <Route
                    path="data"
                    element={
                      <RequirePermission permission="settings.manage">
                        <DataPage />
                      </RequirePermission>
                    }
                  />
                  <Route path="integration" element={<IntegrationPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Route>
            </Routes>
          </CatalogProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
