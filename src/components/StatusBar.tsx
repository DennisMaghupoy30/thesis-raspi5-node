import React from 'react';

interface Status {
  cameras: number;
  models: string[];
  currentModel: string | null;
  totalPredictions: number;
  uptime: number;
}

interface StatusBarProps {
  status: Status | null;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
}

const StatusBar: React.FC<StatusBarProps> = ({ status, onToggleFullscreen, isFullscreen }) => {
  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <h1 className="text-xl font-bold text-gray-900">VertiPlant Monitor</h1>

          {status && (
            <>
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-gray-600">
                  {status.cameras} Camera{status.cameras !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="text-sm text-gray-600">
                Current Model: <span className="font-medium text-blue-600">{status.currentModel || 'None'}</span>
              </div>

              <div className="text-sm text-gray-600">
                Predictions: <span className="font-medium">{status.totalPredictions}</span>
              </div>

              <div className="text-sm text-gray-600">
                Uptime: <span className="font-mono font-medium">{formatUptime(status.uptime)}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {status?.models && status.models.length > 0 && (
            <div className="text-sm text-gray-600">
              Models: {status.models.join(', ')}
            </div>
          )}

          <button
            onClick={onToggleFullscreen}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;