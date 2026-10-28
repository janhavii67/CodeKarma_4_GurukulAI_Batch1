/**
 * Landing-page demo data – clearly illustrative, not connected to any live backend.
 */

export const AI_DEMO_MESSAGES = [
  {
    role: 'user' as const,
    text: 'What is the correct torque specification for the MRI gradient coil mounting bolts on the HAAS VF-2 workholder?',
  },
  {
    role: 'assistant' as const,
    text: 'Based on the approved service procedure (Rev 4, Section 3.2), the gradient coil mounting bolts require **42 N·m ± 2 N·m** using a calibrated torque wrench. Apply in a star pattern to ensure even clamping force. Always verify with the current machine-specific procedure before working on live equipment.',
    sources: [
      { id: 's1', title: 'VF-2 Maintenance Procedure Rev 4', section: '§3.2 Fastener Torque', verified: true },
      { id: 's2', title: 'Gradient Coil Assembly Guide', section: '§5.1 Installation', verified: true },
    ],
  },
];

export const CAPTURE_STEPS = [
  { id: 1, label: 'Upload', description: 'PDF, audio, video, image, or text' },
  { id: 2, label: 'Transcribe', description: 'AI generates structured transcript' },
  { id: 3, label: 'Extract', description: 'Procedures, specs, warnings identified' },
  { id: 4, label: 'Review', description: 'Expert validates and annotates' },
  { id: 5, label: 'Publish', description: 'Approved knowledge enters the library' },
];

export const TROUBLESHOOTING_TREE = {
  symptom: 'Unusual vibration during CNC spindle ramp-up',
  steps: [
    {
      id: 'ts1',
      label: 'Safety first',
      description: '⚠ Stop the machine and lock out / tag out before any inspection.',
      substeps: null,
      references: ['LOTO Procedure LP-001', 'CNC Safety Guide §2.4'],
    },
    {
      id: 'ts2',
      label: 'Check tool holder runout',
      description: 'Measure runout with a dial indicator. Acceptable limit: <0.005 mm TIR.',
      substeps: null,
      references: ['Spindle PM Checklist §3.1'],
    },
    {
      id: 'ts3',
      label: 'Inspect spindle bearings',
      description: 'Listen for abnormal bearing noise. If detected, escalate to certified technician.',
      substeps: null,
      references: ['Bearing Inspection Guide', 'Escalation Policy EP-07'],
    },
  ],
};

export const CAPABILITIES = [
  { id: 'c1', icon: '📖', title: 'Expert Knowledge Capture', desc: 'Structured ingestion from PDFs, audio, video, and expert interviews.' },
  { id: 'c2', icon: '🤖', title: 'AI Knowledge Assistant', desc: 'Source-grounded Q&A from approved knowledge only. Cites its sources.' },
  { id: 'c3', icon: '🗺', title: 'Guided Procedures', desc: 'Step-by-step workflows derived from expert-authored procedures.' },
  { id: 'c4', icon: '🎙', title: 'Voice-to-Knowledge', desc: 'Capture spoken expertise and convert it to structured, reviewable content.' },
  { id: 'c5', icon: '🔊', title: 'Equipment Sound Intelligence', desc: 'Compare machine recordings against verified references. Similarity, not diagnosis.' },
  { id: 'c6', icon: '✅', title: 'Knowledge Validation', desc: 'Full expert review, approval workflow, version history, and audit trail.' },
  { id: 'c7', icon: '🎯', title: 'Practical Skill Verification', desc: 'Compare trainee actions to reference procedures. Identifies deviations for coaching.' },
  { id: 'c8', icon: '🕸', title: 'Knowledge Graph', desc: 'Linked equipment, procedures, and expertise. Explore connections visually.' },
];

export const INDUSTRIES = [
  {
    id: 'med', label: 'Medical Equipment',
    desc: 'Preserve service procedures, calibration knowledge, and compliance documentation for imaging and diagnostic equipment.',
    tags: ['MRI', 'CT Scanner', 'Ultrasound', 'Endoscopy'],
  },
  {
    id: 'mfg', label: 'Precision Manufacturing',
    desc: 'Capture machinist expertise, CNC setup knowledge, QC procedures, and troubleshooting patterns before they walk out the door.',
    tags: ['CNC Milling', 'Lathe', 'CMM', 'EDM'],
  },
  {
    id: 'svc', label: 'Industrial Service Ops',
    desc: 'Standardize field service knowledge, escalation paths, and approved repairs across distributed technician teams.',
    tags: ['HVAC', 'Power Systems', 'Compressors', 'Pumps'],
  },
];

export const HOW_IT_WORKS = [
  { step: 'Capture', icon: '📥', desc: 'Ingest documents, audio, video, and expert conversations.' },
  { step: 'Structure', icon: '🗂', desc: 'AI extracts procedures, specs, warnings, and relationships.' },
  { step: 'Validate', icon: '🛡', desc: 'Domain experts review, annotate, and approve every piece.' },
  { step: 'Apply', icon: '⚡', desc: 'Approved knowledge powers the assistant, procedures, and training.' },
];

export const KNOWLEDGE_GRAPH_NODES = [
  { id: 'n1', x: 50, y: 50, label: 'HAAS VF-2', type: 'machine' },
  { id: 'n2', x: 78, y: 30, label: 'Spindle PM', type: 'procedure' },
  { id: 'n3', x: 78, y: 70, label: 'Tool Change SOP', type: 'procedure' },
  { id: 'n4', x: 22, y: 30, label: 'Coolant System', type: 'component' },
  { id: 'n5', x: 22, y: 70, label: 'Bearing Guide', type: 'knowledge' },
  { id: 'n6', x: 50, y: 14, label: 'Expert: J. Patel', type: 'expert' },
  { id: 'n7', x: 50, y: 86, label: 'Troubleshoot: Vibration', type: 'troubleshoot' },
];

export const GRAPH_EDGES = [
  ['n1', 'n2'], ['n1', 'n3'], ['n1', 'n4'], ['n1', 'n5'],
  ['n2', 'n6'], ['n1', 'n7'], ['n5', 'n7'],
];

