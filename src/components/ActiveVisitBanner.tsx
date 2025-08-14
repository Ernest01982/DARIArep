import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle, X } from 'lucide-react';
import { offlineStorage } from '../services/offline';
import type { ActiveVisit } from '../services/offline';

export function ActiveVisitBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeVisit, setActiveVisit] = useState<ActiveVisit | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const checkActiveVisit = async () => {
      const visit = await offlineStorage.getActiveVisit();
      setActiveVisit(visit);
    };

    checkActiveVisit();
    
    // Check every 30 seconds
    const interval = setInterval(checkActiveVisit, 30000);
    return () => clearInterval(interval);
  }, []);

  // Don't show on visit pages or if dismissed
  if (!activeVisit || 
      isDismissed || 
      location.pathname.startsWith('/visit')) {
    return null;
  }

  const handleResumeVisit = () => {
    navigate(`/visit/client?visit_id=${activeVisit.visit_id}&client_id=${activeVisit.client_id}`);
  };

  return (
    <div className="mb-4 bg-orange-50 border border-orange-200 rounded-lg p-4" role="alert">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-orange-600" />
          <div>
            <h3 className="font-medium text-orange-900">Active Visit in Progress</h3>
            <p className="text-sm text-orange-700">
              You have an ongoing visit. Don't forget to complete it.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleResumeVisit}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          >
            Resume Visit
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 text-orange-400 hover:text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 rounded"
            aria-label="Dismiss banner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}