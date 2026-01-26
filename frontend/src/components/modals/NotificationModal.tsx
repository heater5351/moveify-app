import { CheckCircle, XCircle, X } from 'lucide-react';

interface NotificationModalProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

export const NotificationModal = ({ message, type, onClose }: NotificationModalProps) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200">
        <div className="p-7">
          <div className="flex items-start gap-5">
            <div className={`flex-shrink-0 rounded-full p-3 ${
              type === 'success' ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {type === 'success' ? (
                <CheckCircle className="text-green-600" size={32} />
              ) : (
                <XCircle className="text-red-600" size={32} />
              )}
            </div>
            <div className="flex-1">
              <h3 className={`text-xl font-bold mb-3 ${
                type === 'success' ? 'text-green-900' : 'text-red-900'
              }`}>
                {type === 'success' ? 'Success' : 'Error'}
              </h3>
              <p className="text-gray-700 leading-relaxed">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 flex-shrink-0 hover:bg-gray-100 rounded-lg p-1 transition-colors"
            >
              <X size={22} />
            </button>
          </div>
        </div>
        <div className="border-t-2 border-gray-200 px-6 py-5 bg-gray-50">
          <button
            onClick={onClose}
            className={`w-full py-4 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg ${
              type === 'success'
                ? 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800'
                : 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800'
            }`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
