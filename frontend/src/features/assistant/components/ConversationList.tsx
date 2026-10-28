import React, { useState } from 'react';
import { Plus, MessageSquare, Trash2, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import type { Conversation } from '../types';

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  loading: boolean;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => Promise<void>;
  onRefresh?: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeConversationId,
  loading,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRefresh,
}) => {
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      await onDeleteConversation(deleteTargetId);
      setDeleteTargetId(null);
    } catch (err) {
      console.warn('Failed to delete conversation:', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 border-r border-slate-200">
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onNewChat}
          className="flex-1 inline-flex items-center justify-center space-x-2 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-2xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
            title="Refresh conversations list"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <LoadingSpinner size="sm" />
            <span className="text-xs">Loading history...</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="py-12 px-4 text-center text-slate-400 space-y-2">
            <MessageSquare className="w-8 h-8 mx-auto stroke-1" />
            <p className="text-xs font-medium">No past conversations</p>
            <p className="text-[11px] text-slate-400">Questions you ask will be saved here.</p>
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <div
                key={conv.id}
                className={`group relative flex items-center justify-between rounded-lg p-2.5 text-xs transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-100/70 text-blue-900 font-semibold border border-blue-200 shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-200/50 hover:text-slate-900 border border-transparent'
                }`}
                onClick={() => onSelectConversation(conv.id)}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center space-x-1.5">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="truncate block">{conv.title || 'Conversation'}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-1 pl-5">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(conv.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                    {conv.message_count !== undefined && conv.message_count > 0 && (
                      <span>• {conv.message_count} turns</span>
                    )}
                  </div>
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTargetId(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                  title="Delete conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-slate-200 p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start space-x-3">
              <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">Delete Conversation?</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  This conversation and its message history will be removed. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                disabled={deleting}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-2xs transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
