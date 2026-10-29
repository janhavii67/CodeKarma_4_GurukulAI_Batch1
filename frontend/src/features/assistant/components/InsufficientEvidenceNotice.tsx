import React from 'react';
import { AlertCircle, UserCheck, ShieldAlert } from 'lucide-react';

interface InsufficientEvidenceNoticeProps {
  onAskExpert?: () => void;
}

export const InsufficientEvidenceNotice: React.FC<InsufficientEvidenceNoticeProps> = ({ onAskExpert }) => {
  return (
    <div className="mt-3 p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 space-y-3">
      <div className="flex items-start space-x-3">
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 text-amber-700 mt-0.5">
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-amber-900">No approved source found</h4>
          <p className="text-xs text-amber-800 leading-relaxed">
            No approved source matched this question. For machine-specific guidance, the knowledge base needs
            a reviewed source linked to the identified machine, such as its manufacturer manual or approved SOP
            with model, revision, and page references. Unverified settings, protocols, troubleshooting, and
            repair steps are not generated.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-amber-200/60 text-xs">
        <span className="text-amber-700 font-medium flex items-center">
          <AlertCircle className="w-3.5 h-3.5 mr-1" />
          Escalate to certified line supervisor
        </span>
        <button
          type="button"
          onClick={onAskExpert}
          disabled={!onAskExpert}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-2xs disabled:opacity-75 disabled:cursor-not-allowed"
          title={onAskExpert ? 'Connect with senior supervisor' : 'Expert dispatch feature is scheduled for future rollout'}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>{onAskExpert ? 'Ask an Expert' : 'Ask an Expert (Planned)'}</span>
        </button>
      </div>
    </div>
  );
};
