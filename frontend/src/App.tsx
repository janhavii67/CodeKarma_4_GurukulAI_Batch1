import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ModulePlaceholderPage } from './features/placeholders/ModulePlaceholderPage';
import { LibraryPage } from './features/knowledge-capture/LibraryPage';
import { KnowledgeEditorPage } from './features/knowledge-capture/KnowledgeEditorPage';
import { ForbiddenPage } from './features/errors/ForbiddenPage';
import { NotFoundPage } from './features/errors/NotFoundPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/403" element={<ForbiddenPage />} />

            {/* Root redirect */}
            <Route path="/" element={<Navigate to="/app" replace />} />

            {/* Protected App Routes */}
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route
                path="machines"
                element={<ModulePlaceholderPage moduleKeyOverride="machines" />}
              />
              <Route path="knowledge">
                <Route index element={<LibraryPage />} />
                <Route path=":id" element={<KnowledgeEditorPage />} />
              </Route>
              <Route
                path="reviews"
                element={<ModulePlaceholderPage moduleKeyOverride="reviews" />}
              />
              <Route
                path="voice-capture"
                element={<ModulePlaceholderPage moduleKeyOverride="voice-capture" />}
              />
              <Route
                path="assistant"
                element={<ModulePlaceholderPage moduleKeyOverride="assistant" />}
              />
              <Route
                path="guided-workflows"
                element={<ModulePlaceholderPage moduleKeyOverride="guided-workflows" />}
              />
              <Route
                path="troubleshooting"
                element={<ModulePlaceholderPage moduleKeyOverride="troubleshooting" />}
              />
              <Route
                path="sound-analysis"
                element={<ModulePlaceholderPage moduleKeyOverride="sound-analysis" />}
              />
              <Route
                path="knowledge-graph"
                element={<ModulePlaceholderPage moduleKeyOverride="knowledge-graph" />}
              />
              <Route
                path="failure-simulator"
                element={<ModulePlaceholderPage moduleKeyOverride="failure-simulator" />}
              />
              <Route
                path="skill-verification"
                element={<ModulePlaceholderPage moduleKeyOverride="skill-verification" />}
              />
              <Route
                path="synchronized-simulation"
                element={<ModulePlaceholderPage moduleKeyOverride="synchronized-simulation" />}
              />
            </Route>

            {/* 404 Route */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};
