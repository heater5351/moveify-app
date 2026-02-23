import { CheckCircle, XCircle, X } from 'lucide-react';

interface NotificationModalProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

export const NotificationModal = ({ message, type, onClose }: NotificationModalProps) => {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl ring-1 ring-slate-200">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 rounded-lg p-2.5 ${
              type === 'success' ? 'bg-emerald-50' : 'bg-red-50'
            }`}>
              {type === 'success' ? (
                <CheckCircle className="text-emerald-500" size={22} />
              ) : (
                <XCircle className="text-red-500" size={22} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold font-display text-slate-800 mb-1.5">
                {type === 'success' ? 'Success' : 'Error'}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 flex-shrink-0 hover:bg-slate-100 rounded-lg p-1 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className={`w-full py-2 rounded-lg font-medium transition-colors text-sm text-white ${
              type === 'success'
                ? 'bg-emerald-500 hover:bg-emerald-600'
                : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
