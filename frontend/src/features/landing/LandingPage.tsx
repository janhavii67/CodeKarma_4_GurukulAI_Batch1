import React, { useState } from 'react';
import { ThemeProvider } from './ThemeContext';
import { ScrollProgress } from './ScrollProgress';
import { LandingNav } from './LandingNav';
import { Hero } from './Hero';
import { AdvantageSection } from './AdvantageSection';
import { StatsSection } from './StatsSection';
import { IndustriesSection } from './IndustriesSection';
import { ProblemSection } from './ProblemSection';
import { HowItWorksSection } from './HowItWorksSection';
import { CapabilitiesSection } from './CapabilitiesSection';
import { DemoSection } from './DemoSection';
import { KnowledgeGraphSection } from './KnowledgeGraphSection';
import { TrustSection } from './TrustSection';
import { FinalCTA } from './FinalCTA';
import { Footer } from './Footer';
import { ContactModal } from './ContactModal';

export const LandingPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <ThemeProvider>
      <div className="min-h-screen font-sans antialiased bg-[#070e1b] text-slate-100 selection:bg-[#1677f8] selection:text-white">
        <ScrollProgress />
        <LandingNav onCTA={() => setModalOpen(true)} />

        <main>
          {/* Top Hero Section with High-Tech Photo */}
          <Hero onCTA={() => setModalOpen(true)} />

          {/* The Gurukul AI Advantage - 4 Feature Cards */}
          <AdvantageSection />

          {/* 5 Stats / Metrics Bar */}
          <StatsSection />

          {/* Industries & Medical Knowledge - 3 Cards */}
          <IndustriesSection />

          {/* Detailed In-Depth Anchored Modules */}
          <ProblemSection />
          <HowItWorksSection />
          <CapabilitiesSection />
          <DemoSection />
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
