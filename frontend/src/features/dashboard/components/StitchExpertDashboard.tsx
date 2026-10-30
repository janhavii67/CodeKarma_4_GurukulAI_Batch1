import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, AudioLines, BookOpen, Camera, CheckCircle2, CircleHelp, CirclePlay,
  FileText, Mic2, Network, Sparkles, Video,
} from 'lucide-react';
import { DashboardStats } from '../../../types/dashboard';

interface StitchExpertDashboardProps {
  hasPermission: (perm: string) => boolean;
  stats: DashboardStats | null;
  loading: boolean;
  userName: string;
}

const captureCards = [
  { title: 'Video Capture', kind: 'video', icon: Video, image: '/assets/stitch_workshop_record.jpg', description: 'Record machine operations, setup demonstrations and expert techniques.', action: 'Capture Video', href: '/app/knowledge-assets?kind=video' },
  { title: 'Audio Capture', kind: 'audio', icon: Mic2, image: '', description: 'Preserve expert explanations, machine sounds and operational insights.', action: 'Record Audio', href: '/app/knowledge-assets?kind=audio' },
  { title: 'Photo Capture', kind: 'image', icon: Camera, image: '/assets/stitch_spindle_runout.jpg', description: 'Document machine conditions, components and inspection observations.', action: 'Upload Photos', href: '/app/knowledge-assets?kind=image' },
  { title: 'Document Capture', kind: 'document', icon: FileText, image: '/assets/expert_editorial_hero.jpg', description: 'Store manuals, SOPs, maintenance records and reference materials.', action: 'Upload Documents', href: '/app/knowledge-assets?kind=notes' },
] as const;

const valueOrDash = (value: number | undefined, loading: boolean) => loading ? '…' : value == null ? '—' : value.toLocaleString();

export const StitchExpertDashboard: React.FC<StitchExpertDashboardProps> = ({ hasPermission, stats, loading, userName }) => {
  const canCreate = hasPermission('knowledge.create');

  return <div className="expert-dashboard">
    <section className="dashboard-hero" aria-labelledby="dashboard-hero-title">
      <div className="dashboard-hero-copy">
        <div className="dashboard-eyebrow"><Sparkles size={13} /> Industrial knowledge intelligence</div>
        <p className="dashboard-greeting">Welcome to Gurukul AI{userName ? `, ${userName.split(' ')[0]}` : ''}</p>
        <h1 id="dashboard-hero-title">Preserve Experience.<br /><span>Empower the Next Generation.</span></h1>
        <p className="dashboard-hero-description">Capture, organize and share critical industrial knowledge. Build a more connected manufacturing ecosystem where experience moves forward.</p>
        <div className="dashboard-hero-actions">
          {canCreate && <Link to="/app/knowledge-assets?kind=notes" className="dashboard-primary-button">Capture Knowledge <ArrowRight size={16} /></Link>}
          <Link to="/app/knowledge" className="dashboard-secondary-button">Explore Knowledge Library</Link>
        </div>
        <div className="dashboard-trust-row"><span><CheckCircle2 size={16} /> Expert verified knowledge</span><span><Sparkles size={16} /> AI powered workflows</span><span><Network size={16} /> Industrial ready</span></div>
      </div>
      <div className="dashboard-hero-art" role="img" aria-label="Manufacturing expert reviewing a CNC machine">
        <div className="dashboard-live-card"><span className="dashboard-play-icon"><CirclePlay size={26} /></span><span><strong>Expert at work</strong><small>Machine setup · Knowledge capture</small></span></div>
      </div>
    </section>

    <section className="dashboard-capture-section" aria-labelledby="capture-section-title">
      <div className="dashboard-section-heading">
        <span className="dashboard-heading-icon"><Camera size={20} /></span>
        <div><h2 id="capture-section-title">Knowledge Capture</h2><p>Preserve valuable expertise in the format that works best.</p></div>
        {canCreate && <Link className="dashboard-view-all" to="/app/knowledge-assets">View all <ArrowRight size={14} /></Link>}
      </div>
      <div className="dashboard-capture-grid">
        {captureCards.map(({ title, kind, icon: Icon, image, description, action, href }) => {
          const count = kind === 'video' ? stats?.video_assets : kind === 'audio' ? stats?.audio_assets : kind === 'image' ? stats?.image_assets : stats?.document_assets;
          return <article className="capture-card" key={kind}>
            <Link to={href} className={`capture-card-image ${image ? '' : 'capture-audio-art'}`} aria-label={title}>
              {image ? <img src={image} alt="" loading="lazy" /> : <div className="audio-wave-art"><AudioLines size={42} /><span>━━━━ ━━━ ━━━━━ ━━ ━━━━━ ━━━</span></div>}
              <span className="capture-count">{valueOrDash(count, loading)} items</span>
              {kind === 'video' && <span className="capture-play"><CirclePlay size={30} fill="white" /></span>}
            </Link>
            <div className="capture-card-body">
              <div className="capture-card-title"><span><Icon size={17} /></span><h3>{title}</h3></div>
              <p>{description}</p>
              <Link className="capture-card-action" to={href}>{action}<ArrowRight size={14} /></Link>
            </div>
          </article>;
        })}
      </div>
    </section>

    <section className="dashboard-library-focus" aria-label="Knowledge and troubleshooting shortcuts">
      <Link to="/app/knowledge" className="dashboard-library-shortcut">
        <span className="dashboard-library-icon"><BookOpen size={20} /></span>
        <span className="dashboard-library-copy"><h2>Knowledge Library</h2><span>Find approved procedures and machine guidance.</span></span>
        <ArrowRight className="dashboard-library-arrow" size={16} />
      </Link>
      {(hasPermission('troubleshoot.use') || canCreate) && <Link to="/app/troubleshooting" className="dashboard-library-shortcut">
        <span className="dashboard-library-icon"><CircleHelp size={20} /></span>
        <span className="dashboard-library-copy"><h2>Troubleshooting</h2><span>Investigate equipment faults with guided diagnostics.</span></span>
        <ArrowRight className="dashboard-library-arrow" size={16} />
      </Link>}
    </section>
  </div>;
};
