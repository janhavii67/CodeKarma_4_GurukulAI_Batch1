import React, { useState } from 'react';
import { ThemeProvider } from './ThemeContext';
import { ScrollProgress } from './ScrollProgress';
import { LandingNav } from './LandingNav';
import { Hero } from './Hero';
import { ProblemSection } from './ProblemSection';
import { HowItWorksSection } from './HowItWorksSection';
import { CapabilitiesSection } from './CapabilitiesSection';
import { DemoSection } from './DemoSection';
import { IndustriesSection } from './IndustriesSection';
import { KnowledgeGraphSection } from './KnowledgeGraphSection';
import { TrustSection } from './TrustSection';
import { StorySection } from './StorySection';
import { FinalCTA } from './FinalCTA';
import { Footer } from './Footer';
import { ContactModal } from './ContactModal';

export const LandingPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <ThemeProvider>
      <div className="min-h-screen font-sans antialiased bg-white dark:bg-slate-950 text-slate-900 dark:text-white transition-colors duration-300">
        <ScrollProgress />
        <LandingNav onCTA={() => setModalOpen(true)} />

        <main>
          <Hero onCTA={() => setModalOpen(true)} />
          <ProblemSection />
          <HowItWorksSection />
          <StorySection />
          <CapabilitiesSection />
          <DemoSection />
          <IndustriesSection />
          <KnowledgeGraphSection />
          <TrustSection />
          <FinalCTA onCTA={() => setModalOpen(true)} />
        </main>

        <Footer onCTA={() => setModalOpen(true)} />
        <ContactModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </div>
    </ThemeProvider>
  );
};

