import React from 'react';

interface Camera {
  id: number;
  device: string;
  streamPort: number;
  streamUrl: string;
}

interface CameraGridProps {
  cameras: Camera[];
}

const CameraGrid: React.FC<CameraGridProps> = ({ cameras }) => {
  if (cameras.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-300 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Cameras Detected</h3>
          <p className="text-gray-500">Waiting for camera detection...</p>
        </div>
      </div>
    );
  }

  const getGridClass = (count: number) => {
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    if (count <= 6) return 'grid-cols-3';
    return 'grid-cols-4';
  };

  return (
    <div className={`grid gap-4 ${getGridClass(cameras.length)}`}>
      {cameras.map((camera) => (
        <div key={camera.id} className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gray-800 text-white px-4 py-2">
            <h3 className="text-sm font-medium">Camera {camera.id + 1}</h3>
            <p className="text-xs text-gray-300">{camera.device}</p>
          </div>
          <div className="aspect-video bg-black flex items-center justify-center">
            <img
              src={`http://localhost:${camera.streamPort}/stream`}
              alt={`Camera ${camera.id + 1} stream`}
              className="w-full h-full object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <div className="text-gray-400 text-center hidden">
              <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Stream Loading...</p>
            </div>
          </div>
          <div className="px-4 py-2 bg-gray-50">
            <p className="text-xs text-gray-600">Port: {camera.streamPort}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CameraGrid;