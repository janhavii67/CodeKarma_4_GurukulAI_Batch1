import React, { useState } from 'react';
import { KNOWLEDGE_GRAPH_NODES, GRAPH_EDGES } from './demoData';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

const NODE_COLORS: Record<string, string> = {
  machine: '#1976D2',
  procedure: '#059669',
  component: '#d97706',
  knowledge: '#7c3aed',
  expert: '#db2777',
  troubleshoot: '#dc2626',
};
const NODE_BG: Record<string, string> = {
  machine: 'bg-blue-100 dark:bg-blue-900/40 border-blue-400',
  procedure: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-500',
  component: 'bg-amber-100 dark:bg-amber-900/40 border-amber-500',
  knowledge: 'bg-violet-100 dark:bg-violet-900/40 border-violet-500',
  expert: 'bg-pink-100 dark:bg-pink-900/40 border-pink-500',
  troubleshoot: 'bg-red-100 dark:bg-red-900/40 border-red-500',
};

const NODE_INFO: Record<string, string> = {
  n1: 'HAAS VF-2 CNC milling centre. Central machine node linking procedures, components, and knowledge.',
  n2: 'Spindle PM Procedure – approved Rev 4. Expert: J. Patel. Last reviewed 2026-10-20.',
  n3: 'Tool Change SOP – step-by-step procedure approved by quality engineering.',
  n4: 'Coolant system component. Linked to coolant PM and contamination troubleshooting.',
  n5: 'Bearing inspection guide – approved knowledge article with expert notes.',
  n6: 'Senior Manufacturing Engineer J. Patel. 18 approved knowledge contributions.',
  n7: 'Troubleshooting: Vibration during spindle ramp-up. 3 decision-tree steps.',
};

export const KnowledgeGraphSection: React.FC = () => {
  const [selected, setSelected] = useState<string | null>('n1');
  const [scale, setScale] = useState(1);

  const node = selected ? KNOWLEDGE_GRAPH_NODES.find(n => n.id === selected) : null;

  return (
    <section id="knowledge-graph" className="py-24 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">Interactive Knowledge Graph</h2>
          <p className="text-slate-600 dark:text-slate-300 max-w-xl mx-auto">Explore connections between machines, procedures, experts, and knowledge. Click any node to learn more.</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Graph canvas */}
          <div className="flex-1 relative bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <div className="absolute top-3 right-3 flex gap-1 z-10">
              <button onClick={() => setScale(s => Math.min(1.5, s + 0.1))} className="p-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
                <ZoomIn className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
              </button>
              <button onClick={() => setScale(s => Math.max(0.6, s - 0.1))} className="p-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
                <ZoomOut className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
              </button>
              <button onClick={() => { setSelected(null); setScale(1); }} className="p-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
                <RotateCcw className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
              </button>
            </div>

            <div style={{ transform: `scale(${scale})`, transformOrigin: 'center', transition: 'transform 0.3s' }}>
              <svg viewBox="0 0 100 100" className="w-full aspect-square">
                {/* Edges */}
                {GRAPH_EDGES.map(([a, b]) => {
                  const na = KNOWLEDGE_GRAPH_NODES.find(n => n.id === a)!;
                  const nb = KNOWLEDGE_GRAPH_NODES.find(n => n.id === b)!;
                  const isSelected = selected === a || selected === b;
                  return (
                    <line key={`${a}-${b}`}
                      x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                      stroke={isSelected ? '#1976D2' : '#cbd5e1'}
                      strokeWidth={isSelected ? 0.8 : 0.4}
                      strokeDasharray={isSelected ? 'none' : '2,2'}
                      className="transition-all"
                    />
                  );
                })}
                {/* Nodes */}
                {KNOWLEDGE_GRAPH_NODES.map(n => {
                  const col = NODE_COLORS[n.type] || '#6b7280';
                  const isActive = selected === n.id;
                  return (
                    <g key={n.id} onClick={() => setSelected(n.id === selected ? null : n.id)} style={{ cursor: 'pointer' }}>
                      <circle cx={n.x} cy={n.y} r={isActive ? 6 : 4} fill={col} opacity={isActive ? 1 : 0.7} className="transition-all" />
                      {isActive && <circle cx={n.x} cy={n.y} r={9} fill="none" stroke={col} strokeWidth="0.6" opacity={0.4} />}
                      <text x={n.x} y={n.y + 8} textAnchor="middle" fontSize="2.2" fill="#64748b" className="pointer-events-none select-none">
                        {n.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Info panel */}
          <div className="lg:w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 min-h-[200px]">
            {node ? (
              <>
                <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-semibold mb-3 ${NODE_BG[node.type]}`}>
                  <div className="w-2 h-2 rounded-full" style={{ background: NODE_COLORS[node.type] }} />
                  {node.type.charAt(0).toUpperCase() + node.type.slice(1)}
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">{node.label}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{NODE_INFO[node.id]}</p>
              </>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-8 text-center">Click a node to explore.</p>
            )}

            {/* Legend */}
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
              {Object.entries(NODE_COLORS).map(([type, col]) => (
                <div key={type} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col }} />
                  <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

