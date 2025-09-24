import React, { useState, useEffect } from 'react'
import CameraGrid from './components/CameraGrid'
import PredictionLog from './components/PredictionLog'
import StatusBar from './components/StatusBar'

interface Camera {
  id: number;
  device: string;
  streamPort: number;
  streamUrl: string;
}

interface Prediction {
  cameraId: number;
  model: string;
  timestamp: string;
  result: any;
}

interface Status {
  cameras: number;
  models: string[];
  currentModel: string | null;
  totalPredictions: number;
  uptime: number;
}

function App() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fetchData = async () => {
    try {
      const [camerasRes, predictionsRes, statusRes] = await Promise.all([
        fetch('http://localhost:9003/api/cameras'),
        fetch('http://localhost:9003/api/predictions'),
        fetch('http://localhost:9003/api/status')
      ]);

      if (camerasRes.ok) {
        const camerasData = await camerasRes.json();
        setCameras(camerasData);
      }

      if (predictionsRes.ok) {
        const predictionsData = await predictionsRes.json();
        setPredictions(predictionsData);
      }

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 relative">
      <StatusBar
        status={status}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
      />

      <div className="p-4">
        <CameraGrid cameras={cameras} />
      </div>

      <PredictionLog
        predictions={predictions}
        isExpanded={isLogExpanded}
        onToggle={() => setIsLogExpanded(!isLogExpanded)}
      />
    </div>
  )
}

export default App