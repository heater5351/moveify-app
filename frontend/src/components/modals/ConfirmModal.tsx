import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning';
}

export const ConfirmModal = ({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'danger'
}: ConfirmModalProps) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200">
        <div className="p-7">
          <div className="flex items-start gap-5">
            <div className={`flex-shrink-0 rounded-full p-3 ${
              type === 'danger' ? 'bg-red-100' : 'bg-yellow-100'
            }`}>
              <AlertTriangle
                className={`${type === 'danger' ? 'text-red-600' : 'text-yellow-600'}`}
                size={32}
              />
            </div>
            <div className="flex-1">
              <h3 className={`text-xl font-bold mb-3 ${
                type === 'danger' ? 'text-red-900' : 'text-yellow-900'
              }`}>
                {title}
              </h3>
              <p className="text-gray-700 leading-relaxed">{message}</p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-700 flex-shrink-0 hover:bg-gray-100 rounded-lg p-1 transition-colors"
            >
              <X size={22} />
            </button>
          </div>
        </div>
        <div className="border-t-2 border-gray-200 px-6 py-5 flex gap-4 bg-gray-50">
          <button
            onClick={onCancel}
            className="flex-1 px-5 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-white font-semibold transition-all shadow-sm hover:shadow-md"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-5 py-3 rounded-xl font-semibold text-white transition-all shadow-md hover:shadow-lg ${
              type === 'danger'
                ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800'
                : 'bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
