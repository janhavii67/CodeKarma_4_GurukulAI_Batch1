import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api/client';
import {
  Volume2,
  Activity,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  ShieldAlert,
} from 'lucide-react';

interface AudioReference {
  id: string;
  title: string;
  machine_name?: string;
  duration_seconds: number;
  sample_rate: number;
  fault_label: string;
  is_expert_verified: boolean;
  operating_conditions?: string;
}

interface CandidateScore {
  reference_id: string;
  title: string;
  fault_label: string;
  machine_name?: string;
  similarity_score: number;
  confidence_tier: string;
}

interface AnalysisResult {
  id: string;
  status: string;
  matched_reference_title?: string;
  fault_label?: string;
  machine_name?: string;
  similarity_score?: number;
  reason_code: string;
  message: string;
  requires_expert_review: boolean;
  candidate_matches: CandidateScore[];
  created_at: string;
}

export const SoundAnalysisPage: React.FC = () => {
  const [references, setReferences] = useState<AudioReference[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [selectedScenario, setSelectedScenario] = useState('normal_spindle');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    api
      .get<AudioReference[]>('/audio/references')
      .then((data) => {
        setReferences(data || []);
        setLoadingRefs(false);
      })
      .catch(() => setLoadingRefs(false));
  }, []);

  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await api.post<AnalysisResult>('/audio/analyze', {
        scenario: selectedScenario,
      });
      setResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[#17324D]">Laboratory Acoustic Diagnostic Engine</h1>
            <Badge variant="brand" size="sm">
              Module 07
            </Badge>
          </div>
          <p className="text-xs text-[#5D7188]">
            Calibrated spectral reference matching with strict rejection policies for noise, silence, and unknown equipment acoustics.
          </p>
        </div>
      </div>

      {/* Rejection Policy & Governance Banner */}
      <div className="p-4 rounded-xl bg-[#EAF3FF] border border-[#BCD7F5] flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-[#1976D2] shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs">
          <span className="font-bold text-[#124A78]">Acoustic Governance &amp; Rejection Rules</span>
          <p className="text-[#5D7188] leading-relaxed">
            Cosine similarity is a comparative ranking signal, not a probability of correctness. If acoustic energy is too low (silence)
            or below the acceptance threshold (0.82), the engine reliably rejects the input instead of asserting a false positive.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Analysis Runner */}
        <div className="space-y-4">
          <Card
            title="Acoustic Signal Diagnostic"
            subtitle="Select live recording scenario or upload sample"
          >
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#17324D] mb-1.5 font-bold">Test Acoustic Scenario:</label>
                <select
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                  className="w-full bg-[#F3F8FE] border border-[#DCE6F0] rounded-xl p-2.5 text-[#17324D] text-xs focus:bg-white focus:border-[#1976D2] outline-none"
                >
                  <option value="normal_spindle">Diagnostic Centrifuge Normal Rotor (6,000 RPM)</option>
                  <option value="bearing_whine">Centrifuge Bearing Fluting &amp; High-Pitch Whine</option>
                  <option value="cavitation">Hydraulic Pump Cavitation Sound</option>
                  <option value="silence">Edge Case: Near-Silent Recording (Low RMS)</option>
                  <option value="ambient_noise">Edge Case: Ambient Laboratory Background Noise</option>
                  <option value="speech">Edge Case: Operator Speech / Voice Narration</option>
                  <option value="unknown_anomaly">Edge Case: Unknown Equipment / Unregistered Sound</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-[#F3F8FE] border border-[#DCE6F0] text-[11px] text-[#5D7188]">
                <span className="font-bold text-[#17324D] block mb-1">Feature Extraction Pipeline:</span>
                Normalized Euclidean similarity on Spectral Centroid, Bandwidth, RMS Energy, and Zero-Crossing Rate.
              </div>

              <Button
                variant="primary"
                onClick={handleRunAnalysis}
                disabled={analyzing}
                className="w-full justify-center"
                icon={<Activity className={`w-4 h-4 ${analyzing ? 'animate-spin' : ''}`} />}
              >
                {analyzing ? 'Processing Acoustic Signal...' : 'Run Acoustic Match Evaluation'}
              </Button>
            </div>
          </Card>

          {/* Reference Library Mini-List */}
          <Card title="Stored Reference Baselines" subtitle={`${references.length} verified recordings`}>
            {loadingRefs ? (
              <p className="text-xs text-[#7C8DA1] py-3 text-center">Loading references...</p>
            ) : (
              <div className="space-y-2 text-xs">
                {references.map((r) => (
                  <div
                    key={r.id}
                    className="p-2.5 rounded-xl bg-[#F3F8FE] border border-[#DCE6F0] flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-[#17324D] block">{r.title}</span>
                      <span className="text-[10px] text-[#5D7188]">
                        {r.fault_label} · {r.duration_seconds}s
                      </span>
                    </div>
                    <Badge variant={r.fault_label === 'Normal Operation' ? 'success' : 'warning'} size="sm">
                      {r.fault_label === 'Normal Operation' ? 'Baseline' : 'Fault'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Analysis Result Card */}
        <div className="lg:col-span-2">
          {result ? (
            <Card
              title="Acoustic Match Outcome"
              subtitle={`Diagnostic Job ID: ${result.id.slice(0, 8)}...`}
              badge={
                <Badge
                  variant={
                    result.status === 'MATCHED'
                      ? 'success'
                      : result.status === 'AMBIGUOUS_MATCH'
                      ? 'warning'
                      : 'danger'
                  }
                  size="md"
                  dot
                >
                  {result.status}
                </Badge>
              }
            >
              <div className="space-y-4 text-xs">
                {/* Result Message Box */}
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3 ${
                    result.status === 'MATCHED'
                      ? 'bg-emerald-50 border-emerald-200 text-[#15966A]'
                      : result.status === 'AMBIGUOUS_MATCH'
                      ? 'bg-amber-50 border-amber-200 text-[#D98B13]'
                      : 'bg-rose-50 border-rose-200 text-[#D94848]'
                  }`}
                >
                  {result.status === 'MATCHED' ? (
                    <CheckCircle className="w-5 h-5 text-[#15966A] shrink-0 mt-0.5" />
                  ) : result.status === 'AMBIGUOUS_MATCH' ? (
                    <AlertTriangle className="w-5 h-5 text-[#D98B13] shrink-0 mt-0.5" />
                  ) : (
                    <HelpCircle className="w-5 h-5 text-[#D94848] shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <span className="font-bold text-sm block">Reason Code: {result.reason_code}</span>
                    <p className="leading-relaxed">{result.message}</p>
                  </div>
                </div>

                {/* Score & Machine Metadata */}
                {result.similarity_score !== null && result.similarity_score !== undefined && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#F3F8FE] border border-[#DCE6F0]">
                    <div>
                      <span className="text-[10px] text-[#5D7188] block">Top Match Score:</span>
                      <span className="text-xl font-mono font-bold text-[#17324D]">
                        {result.similarity_score.toFixed(3)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#5D7188] block">Identified Condition:</span>
                      <span className="font-bold text-[#17324D]">{result.fault_label || 'Unidentified'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#5D7188] block">Expert Review:</span>
                      <Badge variant={result.requires_expert_review ? 'warning' : 'neutral'} size="sm">
                        {result.requires_expert_review ? 'Required' : 'Not Required'}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Ranked Reference Candidates Breakdown */}
                {result.candidate_matches && result.candidate_matches.length > 0 && (
                  <div>
                    <h4 className="font-bold text-[#17324D] mb-2">
                      Ranked Reference Candidates ({result.candidate_matches.length}):
                    </h4>
                    <div className="space-y-2">
                      {result.candidate_matches.map((c, i) => (
                        <div
                          key={c.reference_id}
                          className="p-3 rounded-xl bg-white border border-[#DCE6F0] flex items-center justify-between text-xs shadow-xs"
                        >
                          <div className="space-y-0.5">
                            <span className="font-bold text-[#17324D]">
                              #{i + 1} {c.title}
                            </span>
                            <span className="text-[10px] text-[#5D7188] block">
                              Condition: {c.fault_label}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                c.confidence_tier === 'HIGH'
                                  ? 'success'
                                  : c.confidence_tier === 'MODERATE'
                                  ? 'info'
                                  : 'neutral'
                              }
                              size="sm"
                            >
                              {c.confidence_tier}
                            </Badge>
                            <span className="font-mono font-bold text-[#17324D]">
                              {c.similarity_score.toFixed(3)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card>
              <div className="py-20 text-center space-y-2">
                <Volume2 className="w-10 h-10 text-[#7C8DA1] mx-auto" />
                <h3 className="text-sm font-bold text-[#17324D]">Awaiting Signal Input</h3>
                <p className="text-xs text-[#5D7188] max-w-sm mx-auto">
                  Select an acoustic scenario on the left and run the evaluation to inspect calibrated spectral comparison.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
