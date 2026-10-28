import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { MachineKnowledgePage } from './features/knowledge/MachineKnowledgePage';
import { ProcedureCreatePage } from './features/knowledge/ProcedureCreatePage';
import { LandingPage } from './features/landing/LandingPage';
import { MachineDiaryLibraryPage, MachineDiaryPage } from './features/knowledge/MachineDiaryLibraryPage';

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
            {/* Marketing landing page */}
            <Route path="/" element={<LandingPage />} />

            {/* Public Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/403" element={<ForbiddenPage />} />

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
              <Route path="machines" element={<ProtectedRoute requiredAnyPermission={['knowledge.view_published', 'machine.manage']}><MachinesPage /></ProtectedRoute>} />
              <Route path="knowledge" element={<ProtectedRoute requiredAnyPermission={['knowledge.view_published', 'knowledge.create', 'knowledge.approve']}><MachineDiaryLibraryPage /></ProtectedRoute>} />
              <Route path="knowledge/machine/:machineId" element={<ProtectedRoute requiredAnyPermission={['knowledge.view_published', 'knowledge.create', 'knowledge.approve']}><MachineDiaryPage /></ProtectedRoute>} />
              {/* Keep the existing SOP listing and draft workflow available. */}
              <Route path="procedures/library" element={<ProtectedRoute requiredAnyPermission={['knowledge.view_published', 'knowledge.create', 'knowledge.approve']}><LibraryPage /></ProtectedRoute>} />
              <Route path="knowledge-assets" element={<ProtectedRoute requiredAnyPermission={['knowledge.view_published', 'knowledge.create', 'knowledge.approve']}><MachineKnowledgePage /></ProtectedRoute>} />
              <Route path="procedures/new" element={<ProtectedRoute requiredPermission="procedure.create"><ProcedureCreatePage /></ProtectedRoute>} />
              <Route path="knowledge/new" element={<ProtectedRoute requiredPermission="knowledge.create"><KnowledgeEditorPage /></ProtectedRoute>} />
              <Route path="knowledge/:id" element={<ProtectedRoute requiredAnyPermission={['knowledge.view_published', 'knowledge.create', 'knowledge.approve']}><KnowledgeEditorPage /></ProtectedRoute>} />
              <Route path="reviews" element={<ProtectedRoute requiredPermission="knowledge.approve"><ReviewsPage /></ProtectedRoute>} />
              <Route path="guided-workflows" element={<ProtectedRoute requiredPermission="procedure.execute"><GuidedWorkflowsPage /></ProtectedRoute>} />
              <Route path="sound-analysis" element={<ProtectedRoute requiredPermission="audio.analyze"><SoundAnalysisPage /></ProtectedRoute>} />
              <Route path="voice-capture" element={<ProtectedRoute requiredPermission="knowledge.create"><VoiceToKnowledgePage /></ProtectedRoute>} />
              <Route path="voice" element={<ProtectedRoute requiredPermission="knowledge.create"><VoiceToKnowledgePage /></ProtectedRoute>} />
              <Route path="voice-to-knowledge" element={<ProtectedRoute requiredPermission="knowledge.create"><VoiceToKnowledgePage /></ProtectedRoute>} />
              <Route path="learning" element={<ProtectedRoute requiredAnyPermission={['procedure.execute', 'learning.manage']}><LearningPortalPage /></ProtectedRoute>} />

              {/* AI Knowledge Assistant (Module 02) */}
              <Route path="assistant" element={<ProtectedRoute requiredPermission="assistant.use"><AssistantPage /></ProtectedRoute>} />

              <Route
                path="troubleshooting"
                element={<ProtectedRoute requiredPermission="troubleshoot.use"><TroubleshootingPage /></ProtectedRoute>}
              />
              <Route
                path="knowledge-graph"
                element={<ProtectedRoute requiredPermission="knowledge.view_published"><ModulePlaceholderPage moduleKeyOverride="knowledge-graph" /></ProtectedRoute>}
              />
              <Route
                path="failure-simulator"
                element={<ProtectedRoute requiredPermission="simulation.attempt"><FailureSimulatorPage /></ProtectedRoute>}
              />
              <Route
                path="skill-verification"
                element={<ProtectedRoute requiredPermission="procedure.execute"><ModulePlaceholderPage moduleKeyOverride="skill-verification" /></ProtectedRoute>}
              />
              <Route
                path="synchronized-simulation"
                element={<ProtectedRoute requiredPermission="simulation.attempt"><ModulePlaceholderPage moduleKeyOverride="synchronized-simulation" /></ProtectedRoute>}
              />
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};
