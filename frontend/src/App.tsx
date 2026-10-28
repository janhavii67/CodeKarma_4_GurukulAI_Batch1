import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { MachinesPage } from './features/machines/MachinesPage';
import { ReviewsPage } from './features/reviews/ReviewsPage';
import { GuidedWorkflowsPage } from './features/workflows/GuidedWorkflowsPage';
import { SoundAnalysisPage } from './features/audio/SoundAnalysisPage';
import { VoiceToKnowledgePage } from './features/voice/VoiceToKnowledgePage';
import { TroubleshootingPage } from './features/troubleshooting/TroubleshootingPage';
import { LearningPortalPage } from './features/learning/LearningPortalPage';
import { FailureSimulatorPage } from './features/simulations/FailureSimulatorPage';
import { AssistantPage } from './features/assistant/AssistantPage';
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
              <Route path="machines" element={<MachinesPage />} />
              <Route path="knowledge" element={<LibraryPage />} />
              <Route path="knowledge/new" element={<KnowledgeEditorPage />} />
              <Route path="knowledge/:id" element={<KnowledgeEditorPage />} />
              <Route path="reviews" element={<ReviewsPage />} />
              <Route path="guided-workflows" element={<GuidedWorkflowsPage />} />
              <Route path="sound-analysis" element={<SoundAnalysisPage />} />
              <Route path="voice-capture" element={<VoiceToKnowledgePage />} />
              <Route path="voice" element={<VoiceToKnowledgePage />} />
              <Route path="voice-to-knowledge" element={<VoiceToKnowledgePage />} />
              <Route path="learning" element={<LearningPortalPage />} />

              {/* AI Knowledge Assistant (Module 02) */}
              <Route path="assistant" element={<AssistantPage />} />

              {/* Graceful Specifications & Placeholders for Future Expansion Modules */}
              <Route
                path="troubleshooting"
                element={<TroubleshootingPage />}
              />
              <Route
                path="knowledge-graph"
                element={<ModulePlaceholderPage moduleKeyOverride="knowledge-graph" />}
              />
              <Route
                path="failure-simulator"
                element={<FailureSimulatorPage />}
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
