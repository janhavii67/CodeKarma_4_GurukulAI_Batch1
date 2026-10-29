import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const INDUSTRY_CARDS = [
  {
    id: 'healthcare',
    title: 'Healthcare',
    subtitle: 'Better care. Safer outcomes.',
    image: '/assets/landing/healthcare.jpg',
    link: '/machines',
  },
  {
    id: 'manufacturing',
    title: 'Manufacturing',
    subtitle: 'Higher uptime. Greater efficiency.',
    image: '/assets/landing/manufacturing.jpg',
    link: '/machines',
  },
  {
    id: 'research',
    title: 'Research & Labs',
    subtitle: 'More discovery. Faster.',
    image: '/assets/landing/research.jpg',
    link: '/machines',
  },
];

export const IndustriesSection: React.FC = () => (
  <section id="industries" className="py-20 bg-[#f8fafc] border-b border-slate-200/80">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid lg:grid-cols-12 gap-10 items-center">
        {/* Left Column: Heading, Subtitle & Explore Industries button */}
        <div className="lg:col-span-4">
          <p className="text-xs sm:text-sm font-bold tracking-widest uppercase text-[#1677f8] mb-3">
            INDUSTRIES &amp; MEDICAL KNOWLEDGE
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0f172a] tracking-tight mb-4 leading-tight">
            Domain Expertise. Real-World Impact.
          </h2>
          <p className="text-base text-slate-600 leading-relaxed mb-8">
            From critical care to complex machinery, Gurukul AI helps you preserve and apply domain knowledge where it matters most.
          </p>
          <Link
            to="/machines"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full border-2 border-[#1677f8] text-[#1677f8] hover:bg-[#1677f8] hover:text-white font-semibold text-sm transition-all duration-200 shadow-sm"
          >
            <span>Explore Industries</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Right Column: 3 Cards */}
        <div className="lg:col-span-8 grid sm:grid-cols-3 gap-5">
          {INDUSTRY_CARDS.map((card) => (
            <Link
              key={card.id}
              to={card.link}
              className="group flex flex-col rounded-2xl overflow-hidden bg-white border border-slate-200/80 hover:border-[#1677f8]/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              {/* Image */}
              <div className="relative h-44 w-full overflow-hidden bg-slate-900">
                <img
                  src={card.image}
                  alt={card.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>

              {/* Caption */}
              <div className="p-4 flex flex-col justify-between flex-grow">
                <div>
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-[#1677f8] transition-colors mb-1">
                    {card.title}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {card.subtitle}
                  </p>
                </div>
                <div className="mt-3 flex justify-end">
                  <span className="text-[#1677f8] font-bold text-sm group-hover:translate-x-1 transition-transform">
                    →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  </section>
);
