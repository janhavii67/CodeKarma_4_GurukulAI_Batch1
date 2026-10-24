import { ModuleConfig } from '../../types/module';

export const MODULE_CONFIGS: Record<string, ModuleConfig> = {
  machines: {
    id: '00-M',
    name: 'Manufacturing Machine Assets',
    shortName: 'Machines',
    route: '/app/machines',
    phase: 1,
    hackathonRole: 'Build',
    status: 'Planned',
    summary:
      'Central machine registry contextualizing industrial equipment (CNC Lathes, Milling Machines, Industrial Robots).',
    requiredPermission: 'machine.manage',
    workflowDiagram: `flowchart LR
  A[Register Machine Asset] --> B[Store Make, Model, Code]
  B --> C[Link Knowledge Items & Audio Baselines]
  C --> D[Active Equipment Operational Context]`,
    featuresPlanned: [
      'Machine asset code & serial number tracking',
      'Machine category categorization (Turning, Milling, Additive, Robotics)',
      'Association with baseline acoustic sound fingerprints',
      'Contextual filtering for SOPs and troubleshooting manuals',
    ],
    invariants: [
      'Zero hardware actuation interfaces (air-gapped from CNC controllers)',
      'Only users with machine.manage permission can register or edit machines',
    ],
  },
  knowledge: {
    id: '01',
    name: 'Expert Knowledge Capture',
    shortName: 'Capture SOP',
    route: '/app/knowledge',
    phase: 2,
    hackathonRole: 'Build',
    status: 'Planned',
    summary:
      'Structured step-by-step Standard Operating Procedure authoring tool with tools, safety warnings, and stop conditions.',
    requiredPermission: 'knowledge.create',
    workflowDiagram: `flowchart TD
  Draft[Author Creates Draft] --> Steps[Add Ordered Steps & Tools]
  Steps --> Save[Save Draft in Postgres JSONB]
  Save --> Submit[Submit for Peer Review]`,
    featuresPlanned: [
      'Step reordering, tool requirements, and PPE hazard warnings',
      'Expected outcome and emergency stop-condition specifications',
      'Draft version autosave & diff comparison against published revisions',
      'Attaching machine diagrams, schematics, and reference PDFs',
    ],
    invariants: [
      'Authors can only edit their own drafts in draft or changes_requested states',
      'Published versions are immutable snapshots; edits spawn new draft versions',
    ],
  },
  reviews: {
    id: '06',
    name: 'Knowledge Validation & Versioning',
    shortName: 'Review Queue',
    route: '/app/reviews',
    phase: 2,
    hackathonRole: 'Build',
    status: 'Planned',
    summary:
      'Strict two-person rule peer review governance queue ensuring authoritative industrial validation before publishing.',
    requiredPermission: 'knowledge.approve',
    workflowDiagram: `flowchart LR
  Queue[Review Queue] --> Inspect[Inspect Steps & Media]
  Inspect --> Decision{Peer Decision}
  Decision -->|Approve| Publish[Atomic Publish & supersedes old version]
  Decision -->|Request Changes| Revision[Revert to Author]
  Decision -->|Reject| Archival[Mark Rejected]`,
    featuresPlanned: [
      'Peer review queue filtering out drafts authored by the current reviewer',
      'Granular step-by-step annotation comments and change requests',
      'Atomic publishing transaction with single live version pointer update',
      'Emergency version withdrawal with instant chunk retrieval deactivation',
    ],
    invariants: [
      'Anti-Self-Approval: Authors strictly forbidden from approving their own SOPs (HTTP 403 self_review_forbidden)',
      'Two concurrent approvals result in exactly one winner and one HTTP 409 conflict',
    ],
  },
  'voice-capture': {
    id: '04',
    name: 'Voice-to-Knowledge Pipeline',
    shortName: 'Voice Capture',
    route: '/app/voice-capture',
    phase: 3,
    hackathonRole: 'Build ("wow")',
    status: 'Planned',
    summary:
      'In-browser audio capture and asynchronous transcription converting informal factory narration into verified structured SOPs.',
    requiredPermission: 'knowledge.create',
    workflowDiagram: `flowchart TD
  Record[Audio Narration Recorded] --> FFmpeg[16kHz Mono WAV Normalization]
  FFmpeg --> Whisper[Whisper Transcription]
  Whisper --> Segments[Time-Coded Segment Storage]
  Segments --> LLM[Claude Structured Output via Tool Calling]
  LLM --> Flag[needs_review Flagging on Gaps]`,
    featuresPlanned: [
      'Browser audio capture with real-time waveform visualizer',
      'Asynchronous job tracking with HTTP 202 and polling status',
      'Time-coded transcript editor synchronized with audio playback',
      'Constrained LLM extraction of steps, tools, and missing parameter flags',
    ],
    invariants: [
      'AI drafts are tagged origin: ai_draft and require expert edit (ai_draft_edited) before review submission',
      'Missing machine parameters or tolerances are never fabricated; explicitly marked needs_review: true',
    ],
  },
  assistant: {
    id: '02',
    name: 'AI Knowledge Assistant',
    shortName: 'AI Assistant',
    route: '/app/assistant',
    phase: 3,
    hackathonRole: 'Build',
    status: 'Planned',
    summary:
      'Grounded industrial RAG assistant retrieving strictly from approved, published knowledge with mandatory citation cards.',
    requiredPermission: 'assistant.use',
    workflowDiagram: `flowchart TD
  Query[Trainee Asks Procedure] --> FTS[Full-Text Search on Published Active Chunks]
  FTS --> Score{Top Score >= Threshold?}
  Score -->|No| Refuse[Refusal: 'No approved source found' + Escalation]
  Score -->|Yes| Claude[Claude Generates Grounded Answer]
  Claude --> Validate[Verify Citation IDs Match Retrieved Set]
  Validate --> Return[Answer + Clickable Source Cards]`,
    featuresPlanned: [
      'Natural language technical query interface for workshop operators',
      'PostgreSQL tsvector full-text search with GIN index ranking',
      'Strict source citation verification with step-order and version tracking',
      'No-source refusal fallback preventing hallucinated advice on dangerous machinery',
    ],
    invariants: [
      'Retrieval restricted strictly to published active chunks of current_published_version_id',
      'Server validates citation aliases; hallucinated citations trigger automatic refusal',
    ],
  },
  'guided-workflows': {
    id: '03',
    name: 'Guided Workflows',
    shortName: 'Guided Workflows',
    route: '/app/guided-workflows',
    phase: 3,
    hackathonRole: 'Placeholder',
    status: 'Planned',
    summary:
      'Step-by-step procedural execution with mandatory safety sign-offs and checkpoint confirmation gates.',
    workflowDiagram: `flowchart LR
  Start[Begin SOP] --> Step1[Action Step + PPE Check]
  Step1 --> Checkpoint{Mandatory Checkpoint?}
  Checkpoint -->|Yes| Signoff[Operator Signoff Gate]
  Signoff --> Step2[Next Step]
  Step2 --> Finish[Log Completion Timestamp]`,
    featuresPlanned: [
      'Linear procedural step progression with interactive checkboxes',
      'Safety gate stops requiring explicit operator confirmation before spindle startup',
      'Audio read-aloud option for hands-free workshop operation',
      'Step completion duration telemetry and digital signature audit log',
    ],
    invariants: [
      'Mandatory checkpoints cannot be bypassed or checked in advance',
      'Workflows execute strictly against published version snapshots',
    ],
  },
  troubleshooting: {
    id: '05',
    name: 'Troubleshooting Decision Trees',
    shortName: 'Troubleshooting',
    route: '/app/troubleshooting',
    phase: 4,
    hackathonRole: 'Placeholder',
    status: 'Planned',
    summary:
      'Symptom-based root cause diagnosis trees for factory operators addressing machine alarms and visual defects.',
    workflowDiagram: `flowchart TD
  Symptom[Operator Selects Symptom] --> Node1[Check Air Pressure >= 6 bar]
  Node1 -->|Below| Cause1[Fault: Regulator Valve Leak]
  Node1 -->|OK| Node2[Inspect Sensor Alignment]
  Node2 --> Remediation[Remediation SOP Action]`,
    featuresPlanned: [
      'Interactive decision tree visualizer with question-and-answer nodes',
      'Alarm code quick search (e.g. FANUC 1001 SPINDLE OVERHEAT)',
      'Direct link from root-cause diagnosis to corresponding repair SOP',
      'Operator feedback on diagnostic accuracy',
    ],
    invariants: [
      'Decision trees are deterministic DAGs with verified human engineering approval',
      'Dangerous diagnostic procedures must lead with safety lockout/tagout steps',
    ],
  },
  'sound-analysis': {
    id: '07',
    name: 'Machine Sound Analysis',
    shortName: 'Sound Analysis',
    route: '/app/sound-analysis',
    phase: 5,
    hackathonRole: 'Placeholder',
    status: 'Planned',
    summary:
      'Acoustic anomaly detection comparing recorded machinery audio against expert-verified baseline recordings.',
    workflowDiagram: `flowchart LR
  Audio[Record Bearing/Motor Sound] --> Pre[Quality Check: SNR & Clipping]
  Pre --> Extract[Extract MFCCs & Spectral Features]
  Extract --> Compare[Cosine Distance vs Approved Reference Library]
  Compare --> Report[Similarity % + Disclaimer: Not a Mechanical Diagnosis]`,
    featuresPlanned: [
      'Acoustic signal SNR (Signal-to-Noise Ratio) quality validation',
      'Mel-Frequency Cepstral Coefficients (MFCC) feature extraction',
      'Audio waveform & spectrogram visualization using WaveSurfer',
      'Cosine similarity matching against approved mechanical fault recordings',
    ],
    invariants: [
      'Always displays explicit disclaimer: similarity match, NOT a confirmed mechanical diagnosis',
      'Low SNR recordings (< 12 dB) or severe clipping are automatically rejected',
    ],
  },
  'knowledge-graph': {
    id: '08',
    name: 'Manufacturing Knowledge Graph',
    shortName: 'Knowledge Graph',
    route: '/app/knowledge-graph',
    phase: 5,
    hackathonRole: 'Placeholder',
    status: 'Planned',
    summary:
      'Relational equipment ontology visualizing interconnections between machine components, failure modes, and procedures.',
    workflowDiagram: `flowchart LR
  Machine[CNC Lathe] --> Component[Hydraulic Chuck]
  Component --> Failure[Jaw Misalignment]
  Failure --> Solution[SOP #12: Chuck Jaw Trueing]`,
    featuresPlanned: [
      'Interactive node-edge graph visualization of shop floor assets',
      'Recursive query traversal linking symptoms to mechanical components',
      'Visual impact analysis when equipment undergoes revision or retrofit',
      'Exportable equipment lineage and dependency matrices',
    ],
    invariants: [
      'Derived strictly from approved relational database schemas with recursive CTE queries',
    ],
  },
  'failure-simulator': {
    id: '09',
    name: 'Failure Scenario Simulator',
    shortName: 'Failure Simulator',
    route: '/app/failure-simulator',
    phase: 4,
    hackathonRole: 'Placeholder',
    status: 'Planned',
    summary:
      'Interactive risk-free training assessment evaluating trainee emergency response to unexpected industrial anomalies.',
    workflowDiagram: `flowchart TD
  Scenario[Scenario: Coolant Pump Failure at 3000 RPM] --> Options[Trainee Chooses Emergency Action]
  Options --> Choice{Action Selected}
  Choice -->|Immediate E-Stop| Success[Safety Maintained · 100/100]
  Choice -->|Open Enclosure Door| Hazard[Critical Safety Violation · Fail]`,
    featuresPlanned: [
      'Branching emergency response simulations under time pressure',
      'Safety-critical hazard scoring distinct from technical procedural scores',
      'Detailed debrief review highlighting OSHA/factory safety regulations',
      'Historical performance analytics tracking trainee readiness',
    ],
    invariants: [
      'Safety-critical violations result in instant disqualification regardless of speed',
    ],
  },
  'skill-verification': {
    id: '10',
    name: 'Practical Skill Verification',
    shortName: 'Skill Verification',
    route: '/app/skill-verification',
    phase: 6,
    hackathonRole: 'Placeholder',
    status: 'Planned',
    summary:
      'Vision-based procedural adherence evaluation comparing trainee physical execution against expert benchmarks.',
    workflowDiagram: `flowchart LR
  Video[Trainee WebCam Feed] --> Pose[MediaPipe Landmark Extraction]
  Pose --> DTW[Dynamic Time Warping vs Expert Demonstration]
  DTW --> Score[Procedural Adherence Score + Missed Safety Steps]`,
    featuresPlanned: [
      'Computer vision pose estimation tracking hands and tool manipulation',
      'Dynamic Time Warping sequence alignment vs golden expert recordings',
      'Real-time PPE compliance detection (Safety goggles, gloves, ear protection)',
      'Instructor grading rubric and certification issuance',
    ],
    invariants: [
      'Physical adherence scores do not certify equipment operation without human instructor sign-off',
    ],
  },
  'synchronized-simulation': {
    id: '11',
    name: 'Synchronized Simulation',
    shortName: 'Sync Simulation',
    route: '/app/synchronized-simulation',
    phase: 6,
    hackathonRole: 'Placeholder',
    status: 'Planned',
    summary:
      'Dual-synchronized interactive timeline coupling audio/video playback with 2D mechanical simulation and scrolling transcript.',
    workflowDiagram: `flowchart TD
  Audio[Master HTML5 Audio Clock] --> Loop[requestAnimationFrame Sync Engine]
  Loop --> Transcript[Scroll Active Transcript Segment into Center]
  Loop --> Canvas[2D SVG Canvas Simulation Highlights Active Lever]
  Canvas --> Checkpoint{Mandatory Checkpoint?}
  Checkpoint -->|Yes| Pause[Audio.pause & Await User Confirmation]`,
    featuresPlanned: [
      'Master clock synchronization between audio currentTime and interactive SVG visualizer',
      'Clock drift & user scrub recovery (< 150ms resynchronization)',
      'Whitelisted 2D simulation primitives (HIGHLIGHT_COMPONENT, ANIMATE_ROTATION)',
      'Mandatory audio pause gates at safety critical checkpoints',
    ],
    invariants: [
      'Audio pauses automatically at mandatory checkpoints and will not resume until user confirms',
      'Simulation primitives are strictly visual illustrations with no hardware link',
    ],
  },
};
