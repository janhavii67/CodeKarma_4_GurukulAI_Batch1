import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen, Sparkles } from 'lucide-react';

interface MedicalHeroBannerProps {
  onCreateClick?: () => void;
}

export const MedicalHeroBanner: React.FC<MedicalHeroBannerProps> = ({ onCreateClick }) => {
  const navigate = useNavigate();

  const handleCreate = () => {
    if (onCreateClick) {
      onCreateClick();
    } else {
      navigate('/app/knowledge/new');
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-white via-[#F0F7FF] to-[#E5F1FC] border border-[#DCE8F5] shadow-sm mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between min-h-[220px]">
        {/* Left Content Area */}
        <div className="flex-1 p-6 sm:p-8 lg:p-10 space-y-4 z-10">
          {/* Eyebrow Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EFF7FF] border border-[#BCD7F5] shadow-xs text-xs font-semibold text-[#1473E6] uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-[#1473E6]" />
            <span>Capture • Share • Preserve</span>
          </div>

          {/* Heading */}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#12345A] tracking-tight leading-tight">
            Capture Medical Equipment Knowledge
          </h1>

          {/* Description */}
          <p className="text-sm sm:text-base text-[#536780] max-w-xl leading-relaxed">
            Document verified procedures for safe, consistent equipment operation.
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button
              id="hero-create-btn"
              onClick={handleCreate}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1473E6] hover:bg-[#1060C4] text-white font-medium text-sm shadow-sm transition-all duration-150 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#1473E6]/40"
            >
              <Plus className="w-4 h-4" />
              <span>Create Procedure</span>
            </button>

            <button
              id="hero-library-btn"
              onClick={() => navigate('/app/knowledge')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white hover:bg-[#F7FAFE] text-[#1473E6] border border-[#BCD7F5] font-medium text-sm shadow-xs transition-all duration-150 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#1473E6]/30"
            >
              <BookOpen className="w-4 h-4" />
              <span>View Knowledge Library</span>
            </button>
          </div>
        </div>

        {/* Right Laboratory Professional Hero Image */}
        <div className="lg:w-[48%] h-56 sm:h-64 lg:h-full lg:self-stretch relative overflow-hidden flex items-center justify-end">
          <div className="absolute inset-0 bg-gradient-to-r from-white via-transparent to-transparent lg:from-[#F0F7FF]/90 lg:to-transparent z-1 pointer-events-none" />
          <img
            src="/assets/lab_hero_banner.jpg"
            alt="Laboratory technician operating automated medical diagnostic equipment"
            className="w-full h-full object-cover object-center lg:object-right select-none"
            loading="eager"
          />
        </div>
      </div>
    </div>
  );
};
