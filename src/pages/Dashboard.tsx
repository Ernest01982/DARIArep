import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, Package, AlertTriangle, Calendar, Target, WifiOff } from 'lucide-react';
import { withOfflineFallback, isNetworkOnline } from '../services/sync';
import { supabase } from '../services/supabase';
import { offlineStorage } from '../services/offline';
import { currencyZAR, formatNumber } from '../utils/format';
import { REP_ID } from '../config';

interface DashboardMetrics {
  // Visit counters
  visitsToday: number;
  visitsThisWeek: number;
  visitsThisMonth: number;
  dailyMA: number;
  weeklyMA: number;
  monthlyMA: number;
  
  // Orders per visit
  weeklyOrderRate: number;
  monthlyOrderRate: number;
  
  // Top products
  topProducts: Array<{
    product_name: string;
    total_quantity: number;
    total_value: number;
  }>;
  
  // Budget
  totalBudget: number;
  budgetSpent: number;
  budgetRemaining: number;
  
  // Alerts
  clientsNeedingVisit: number;
  clientsNeedingOrder: number;
  upcomingTasks: number;
  
  // Meta
  loaded: boolean;
  error: boolean;
  isOffline: boolean;
}

export function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    visitsToday: 0,
    visitsThisWeek: 0,
    visitsThisMonth: 0,
    dailyMA: 0,
    weeklyMA: 0,
    monthlyMA: 0,
    weeklyOrderRate: 0,
    monthlyOrderRate: 0,
    topProducts: [],
    totalBudget: 0,
    budgetSpent: 0,
    budgetRemaining: 0,
    clientsNeedingVisit: 0,
    clientsNeedingOrder: 0,
    upcomingTasks: 0,
    loaded: false,
    error: false,
    isOffline: false
  });

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const loadDashboardMetrics = async () => {
      const isOffline = !isNetworkOnline();
      
      try {
        // Set 8-second timeout
        timeoutId = setTimeout(() => {
          if (isMounted) {
            setMetrics(prev => ({ 
              ...prev, 
              loaded: true, 
              error: false,
              isOffline 
            }));
          }
        }, 8000);

        // Date calculations
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        
        // Week calculation (ISO week)
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1);
        const weekStart = startOfWeek.toISOString().split('T')[0];
        
        // Month calculation
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthStart = startOfMonth.toISOString().split('T')[0];
        
        // 90 days ago
        const ninetyDaysAgo = new Date(now);
        ninetyDaysAgo.setDate(now.getDate() - 90);
        const ninetyDaysStart = ninetyDaysAgo.toISOString().split('T')[0];
        
        // 12 weeks ago
        const twelveWeeksAgo = new Date(now);
        twelveWeeksAgo.setDate(now.getDate() - (12 * 7));
        const twelveWeeksStart = twelveWeeksAgo.toISOString().split('T')[0];
        
        // 3 months ago
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const threeMonthsStart = threeMonthsAgo.toISOString().split('T')[0];
        
        // Next 7 days
        const nextWeek = new Date(now);
        nextWeek.setDate(now.getDate() + 7);
        const nextWeekEnd = nextWeek.toISOString().split('T')[0];

        // Fetch all data with offline fallback
        const [
          visits,
          orders,
          products,
          budgets,
          repTasks,
          clientFollowups
        ] = await Promise.all([
          // Visits
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('visits')
                .select('*')
                .eq('rep_id', REP_ID)
                .gte('check_in_time', threeMonthsStart);
              if (error) throw error;
              return data || [];
            },
            () => offlineStorage.getVisits(),
            []
          ),
          
          // Orders
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('rep_id', REP_ID)
                .gte('order_date', threeMonthsStart);
              if (error) throw error;
              return data || [];
            },
            () => offlineStorage.getOrders(),
            []
          ),
          
          // Order Items
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('order_items')
                .select('*');
              if (error) throw error;
              return data || [];
            },
            () => offlineStorage.getOrderItems(),
            []
          ),
          
          // Products
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('products')
                .select('*');
              if (error) throw error;
              return data || [];
            },
            () => offlineStorage.getProducts(),
            []
          ),
          
          // Budgets
          withOfflineFallback(
            async () => {
              const currentMonth = parseInt(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`);
              const { data, error } = await supabase
                .from('budgets')
                .select('*')
                .eq('rep_id', REP_ID)
                .eq('month', currentMonth);
              if (error) throw error;
              return data || [];
            },
            () => offlineStorage.getBudgets(),
            []
          ),
          
          // Rep Tasks
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('rep_tasks')
                .select('*')
                .eq('rep_id', REP_ID)
                .in('status', ['pending', 'in_progress'])
                .gte('end_date', today)
                .lte('end_date', nextWeekEnd);
              if (error) throw error;
              return data || [];
            },
            () => offlineStorage.getRepTasks(),
            []
          ),
          
          // Client Followups
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('client_followups')
                .select('*');
              if (error) throw error;
              return data || [];
            },
            () => offlineStorage.getClientFollowups(),
            []
          )
        ]);

        if (!isMounted) return;

        // Calculate visit counters
        const visitsToday = visits.filter((v: any) => 
          v.check_in_time?.startsWith(today)
        ).length;
        
        const visitsThisWeek = visits.filter((v: any) => 
          v.check_in_time >= weekStart
        ).length;
        
        const visitsThisMonth = visits.filter((v: any) => 
          v.check_in_time >= monthStart
        ).length;

        // Calculate moving averages
        const dailyMA = visits.filter((v: any) => 
          v.check_in_time >= ninetyDaysStart
        ).length / 90;
        
        const weeklyMA = visits.filter((v: any) => 
          v.check_in_time >= twelveWeeksStart
        ).length / 12;
        
        const monthlyMA = visits.filter((v: any) => 
          v.check_in_time >= threeMonthsStart
        ).length / 3;

        // Calculate orders per visit rates
        const ordersThisWeek = orders.filter((o: any) => 
          o.order_date >= weekStart
        ).length;
        const ordersThisMonth = orders.filter((o: any) => 
          o.order_date >= monthStart
        ).length;
        
        const weeklyOrderRate = visitsThisWeek > 0 ? ordersThisWeek / visitsThisWeek : 0;
        const monthlyOrderRate = visitsThisMonth > 0 ? ordersThisMonth / visitsThisMonth : 0;

        // Calculate top 5 products
        const currentMonthOrders = orders.filter((o: any) => 
          o.order_date >= monthStart && o.rep_id === REP_ID
        );
        
        // For now, show empty top products since order_items structure needs clarification
        const topProducts: Array<{
          product_name: string;
          total_quantity: number;
          total_value: number;
        }> = [];

        // Calculate budget metrics
        const currentBudget = budgets[0];
        const totalBudget = currentBudget?.target_amount || 0;
        const budgetSpent = currentBudget?.current_amount || 0;
        const budgetRemaining = totalBudget - budgetSpent;

        // Calculate alerts
        const clientsNeedingVisit = clientFollowups.filter((cf: any) => 
          cf.days_since_last_contact >= 30
        ).length;
        
        const clientsNeedingOrder = clientFollowups.filter((cf: any) => {
          if (!cf.last_order_date) return true;
          const daysSinceOrder = Math.floor(
            (now.getTime() - new Date(cf.last_order_date).getTime()) / (1000 * 60 * 60 * 24)
          );
          return daysSinceOrder >= 14;
        }).length;
        
        const upcomingTasks = repTasks.length;

        clearTimeout(timeoutId);
        
        setMetrics({
          visitsToday,
          visitsThisWeek,
          visitsThisMonth,
          dailyMA,
          weeklyMA,
          monthlyMA,
          weeklyOrderRate,
          monthlyOrderRate,
          topProducts,
          totalBudget,
          budgetSpent,
          budgetRemaining,
          clientsNeedingVisit,
          clientsNeedingOrder,
          upcomingTasks,
          loaded: true,
          error: false,
          isOffline
        });

      } catch (error) {
        console.error('Failed to load dashboard metrics:', error);
        clearTimeout(timeoutId);
        if (isMounted) {
          setMetrics(prev => ({ 
            ...prev, 
            loaded: true, 
            error: true,
            isOffline 
          }));
        }
      }
    };

    loadDashboardMetrics();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const SkeletonCard = () => (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="animate-pulse">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-8 h-8 bg-gray-200 rounded"></div>
          <div className="w-24 h-4 bg-gray-200 rounded"></div>
        </div>
        <div className="w-16 h-8 bg-gray-200 rounded mb-2"></div>
        <div className="w-32 h-3 bg-gray-200 rounded"></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Overview of your sales activities</p>
        </div>
        {metrics.loaded && metrics.isOffline && (
          <div className="flex items-center space-x-2 px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm">
            <WifiOff size={16} />
            <span>Offline Data</span>
          </div>
        )}
      </div>

      {/* Visit Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {!metrics.loaded ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <h3 className="font-medium text-gray-900 text-sm">Today</h3>
              </div>
              <div className="text-xl font-bold text-gray-900">{metrics.visitsToday}</div>
              <p className="text-xs text-gray-500">visits</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Calendar className="w-5 h-5 text-green-600" />
                <h3 className="font-medium text-gray-900 text-sm">This Week</h3>
              </div>
              <div className="text-xl font-bold text-gray-900">{metrics.visitsThisWeek}</div>
              <p className="text-xs text-gray-500">visits</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Calendar className="w-5 h-5 text-purple-600" />
                <h3 className="font-medium text-gray-900 text-sm">This Month</h3>
              </div>
              <div className="text-xl font-bold text-gray-900">{metrics.visitsThisMonth}</div>
              <p className="text-xs text-gray-500">visits</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                <h3 className="font-medium text-gray-900 text-sm">Daily MA</h3>
              </div>
              <div className="text-xl font-bold text-gray-900">{metrics.dailyMA.toFixed(1)}</div>
              <p className="text-xs text-gray-500">90-day avg</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="w-5 h-5 text-teal-600" />
                <h3 className="font-medium text-gray-900 text-sm">Weekly MA</h3>
              </div>
              <div className="text-xl font-bold text-gray-900">{metrics.weeklyMA.toFixed(1)}</div>
              <p className="text-xs text-gray-500">12-week avg</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="w-5 h-5 text-orange-600" />
                <h3 className="font-medium text-gray-900 text-sm">Monthly MA</h3>
              </div>
              <div className="text-xl font-bold text-gray-900">{metrics.monthlyMA.toFixed(1)}</div>
              <p className="text-xs text-gray-500">3-month avg</p>
            </div>
          </>
        )}
      </div>

      {/* Orders per Visit & Budget */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {!metrics.loaded ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <BarChart3 className="w-8 h-8 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Weekly Rate</h3>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {metrics.weeklyOrderRate.toFixed(2)}
              </div>
              <p className="text-sm text-gray-500">orders per visit</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <BarChart3 className="w-8 h-8 text-green-600" />
                <h3 className="font-semibold text-gray-900">Monthly Rate</h3>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {metrics.monthlyOrderRate.toFixed(2)}
              </div>
              <p className="text-sm text-gray-500">orders per visit</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Target className="w-8 h-8 text-orange-600" />
                <h3 className="font-semibold text-gray-900">Budget Spent</h3>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {currencyZAR(metrics.budgetSpent)}
              </div>
              <p className="text-sm text-gray-500">
                of {currencyZAR(metrics.totalBudget)}
              </p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Target className="w-8 h-8 text-purple-600" />
                <h3 className="font-semibold text-gray-900">Remaining</h3>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {currencyZAR(metrics.budgetRemaining)}
              </div>
              <p className="text-sm text-gray-500">budget left</p>
            </div>
          </>
        )}
      </div>

      {/* Top Products & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Package className="w-5 h-5 mr-2 text-green-600" />
            Top Products (This Month)
          </h3>
          {!metrics.loaded ? (
            <div className="animate-pulse space-y-3">
              <div className="w-full h-4 bg-gray-200 rounded"></div>
              <div className="w-3/4 h-4 bg-gray-200 rounded"></div>
              <div className="w-1/2 h-4 bg-gray-200 rounded"></div>
            </div>
          ) : (
            <div className="space-y-3">
              {metrics.topProducts.length > 0 ? (
                metrics.topProducts.map((product, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">{product.product_name}</p>
                      <p className="text-sm text-gray-500">Qty: {product.total_quantity.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{currencyZAR(product.total_value)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500">No product sales this month</p>
              )}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
            Alerts & Tasks
          </h3>
          {!metrics.loaded ? (
            <div className="animate-pulse space-y-3">
              <div className="w-full h-4 bg-gray-200 rounded"></div>
              <div className="w-3/4 h-4 bg-gray-200 rounded"></div>
              <div className="w-1/2 h-4 bg-gray-200 rounded"></div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <span className="text-red-800">Clients needing visit (30+ days)</span>
                <span className="font-bold text-red-900">{metrics.clientsNeedingVisit}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                <span className="text-orange-800">Clients needing order (14+ days)</span>
                <span className="font-bold text-orange-900">{metrics.clientsNeedingOrder}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <span className="text-blue-800">Tasks due this week</span>
                <span className="font-bold text-blue-900">{metrics.upcomingTasks}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}