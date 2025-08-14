import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, Users, Package, FolderSync as Sync } from 'lucide-react';
import { SyncButton } from './SyncButton';
import { ActiveVisitBanner } from './ActiveVisitBanner';

const sidebarItems = [
  { path: '/', icon: Home, label: 'Dashboard' },
  { path: '/visit', icon: Users, label: 'Visit' },
  { path: '/order', icon: Package, label: 'Order' },
];

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Rep Dashboard</h1>
          <SyncButton />
        </div>
      </header>

      <div className="flex">
        {/* Left Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-73px)]" role="navigation" aria-label="Main navigation">
          <nav className="p-4 space-y-2">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          <ActiveVisitBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}