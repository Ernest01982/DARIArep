import React from 'react';
import { FolderSync as Sync, Wifi, WifiOff, Check, AlertCircle } from 'lucide-react';
import { syncUp, syncDown, isNetworkOnline } from '../services/sync';
import { getPendingMutationsCount } from '../services/offline';
import toast from 'react-hot-toast';
import { REP_ID } from '../config';

export function SyncButton() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [isOnline, setIsOnline] = React.useState(isNetworkOnline());

  React.useEffect(() => {
    const updatePendingCount = async () => {
      const count = await getPendingMutationsCount();
      setPendingCount(count);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000); // Update every 5 seconds

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSync = async () => {
    if (!isOnline) {
      toast.error('Cannot sync while offline', {
        icon: <AlertCircle className="w-4 h-4" />
      });
      return;
    }

    setIsLoading(true);
    try {
      await syncUp();
      await syncDown(REP_ID);
      const count = await getPendingMutationsCount();
      setPendingCount(count);
      toast.success('Sync completed successfully', {
        icon: <Check className="w-4 h-4" />
      });
    } catch (error) {
      console.error('Sync failed:', error);
      toast.error('Sync failed. Please try again.', {
        icon: <AlertCircle className="w-4 h-4" />
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center space-x-3">
      {/* Network Status Indicator */}
      <div className="flex items-center space-x-1">
        {isOnline ? (
          <Wifi size={16} className="text-green-600" />
        ) : (
          <WifiOff size={16} className="text-red-600" />
        )}
        <span className={`text-xs ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Sync Button */}
      <button
        onClick={handleSync}
        disabled={!isOnline || isLoading}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors relative min-w-[120px] ${
          !isOnline || isLoading
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : pendingCount === 0
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        } focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          pendingCount === 0 ? 'focus:ring-green-500' : 'focus:ring-blue-500'
        }`}
        aria-label={`Sync data. ${pendingCount} items pending.`}
      >
        {pendingCount === 0 && !isLoading ? (
          <Check size={16} />
        ) : (
          <Sync size={16} className={isLoading ? 'animate-spin' : ''} />
        )}
        <span>
          {isLoading 
            ? 'Syncing...' 
            : pendingCount === 0 
            ? 'Synced' 
            : `${pendingCount} pending`
          }
        </span>
        
        {/* Pending Mutations Badge */}
        {pendingCount > 0 && !isLoading && (
          <span 
            className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center"
            aria-label={`${pendingCount} pending mutations`}
          >
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </button>
    </div>
  );
}