import React, { useState, useEffect } from 'react';

interface Prediction {
  cameraId: number;
  model: string;
  timestamp: string;
  result: any;
}

interface PredictionLogProps {
  predictions: Prediction[];
  isExpanded: boolean;
  onToggle: () => void;
}

const PredictionLog: React.FC<PredictionLogProps> = ({ predictions, isExpanded, onToggle }) => {
  const [displayedPredictions, setDisplayedPredictions] = useState<Prediction[]>([]);

  useEffect(() => {
    const newPredictions = predictions.filter(
      (pred) => !displayedPredictions.some(
        (displayed) =>
          displayed.cameraId === pred.cameraId &&
          displayed.model === pred.model &&
          displayed.timestamp === pred.timestamp
      )
    );

    if (newPredictions.length > 0) {
      setDisplayedPredictions(prev => [...newPredictions, ...prev].slice(0, 50));
    }
  }, [predictions]);

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getResultSummary = (result: any): string => {
    if (!result) return 'No result';

    if (result.detections && Array.isArray(result.detections)) {
      const detectionCount = result.detections.length;
      if (detectionCount === 0) return 'No detections';
      return `${detectionCount} detection${detectionCount !== 1 ? 's' : ''}`;
    }

    if (result.prediction) return result.prediction;
    if (result.class) return result.class;
    if (result.label) return result.label;

    return 'Processing...';
  };

  const getResultColor = (result: any): string => {
    const summary = getResultSummary(result);
    if (summary.includes('No detections') || summary.includes('No result')) {
      return 'text-green-600';
    }
    if (summary.includes('detection')) {
      return 'text-red-600';
    }
    return 'text-blue-600';
  };

  const recentPredictions = displayedPredictions.slice(0, 3);

  return (
    <div className="fixed bottom-4 right-4">
      <div
        className={`bg-white rounded-lg shadow-lg transition-all duration-300 ${
          isExpanded ? 'w-96 h-96' : 'w-80 h-32'
        }`}
      >
        <div
          className="flex items-center justify-between p-4 border-b cursor-pointer hover:bg-gray-50"
          onClick={onToggle}
        >
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="font-medium text-gray-900">Predictions</span>
            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">
              {displayedPredictions.length}
            </span>
          </div>
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        <div className={`overflow-hidden ${isExpanded ? 'h-80' : 'h-20'}`}>
          {!isExpanded && (
            <div className="p-3 space-y-2">
              {recentPredictions.slice(0, 2).map((prediction, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-500">Cam {prediction.cameraId + 1}</span>
                    <span className="text-gray-400">|</span>
                    <span className="font-medium text-gray-700">{prediction.model}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`font-medium ${getResultColor(prediction.result)}`}>
                      {getResultSummary(prediction.result)}
                    </span>
                    <span className="text-gray-400 text-xs">
                      {formatTimestamp(prediction.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isExpanded && (
            <div className="p-4 h-full overflow-y-auto">
              <div className="space-y-3">
                {displayedPredictions.map((prediction, index) => (
                  <div key={index} className="border-l-4 border-blue-200 pl-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">
                          Camera {prediction.cameraId + 1}
                        </span>
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                          {prediction.model}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(prediction.timestamp)}
                      </span>
                    </div>
                    <div className={`text-sm font-medium ${getResultColor(prediction.result)}`}>
                      {getResultSummary(prediction.result)}
                    </div>
                    {prediction.result?.detections && prediction.result.detections.length > 0 && (
                      <div className="mt-1 text-xs text-gray-600">
                        <div className="max-h-12 overflow-y-auto">
                          {prediction.result.detections.map((detection: any, detIndex: number) => (
                            <div key={detIndex} className="flex justify-between">
                              <span>{detection.class || detection.label || 'Detection'}</span>
                              <span>{((detection.confidence || detection.score) * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {displayedPredictions.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p>No predictions yet</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PredictionLog;