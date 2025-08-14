import React, { useState, useEffect } from 'react';
import { ShoppingCart, Users, Package, DollarSign, Clock, WifiOff, Search } from 'lucide-react';
import { withOfflineFallback } from '../services/sync';
import { supabase } from '../services/supabase';
import { offlineStorage } from '../services/offline';
import { currencyZAR, formatDate } from '../utils/format';
import { OrderForm } from '../components/OrderForm';
import toast from 'react-hot-toast';
import { REP_ID } from '../config';

interface Client {
  id: string;
  name: string;
  location?: string;
  contact_email?: string;
  status: string;
}

interface OrderData {
  orders: any[];
  activeOrders: number;
  totalValue: number;
  pendingOrders: number;
  loaded: boolean;
  error: boolean;
  isOffline: boolean;
}

export function Order() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [data, setData] = useState<OrderData>({
    orders: [],
    activeOrders: 0,
    totalValue: 0,
    pendingOrders: 0,
    loaded: false,
    error: false,
    isOffline: false
  });

  useEffect(() => {
    let isMounted = true;

    const loadOrderData = async () => {
      try {
        const isOffline = !navigator.onLine;
        
        const [orders, clientsData] = await Promise.all([
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('orders')
                .select(`
                  *,
                  clients (
                    id,
                    name
                  )
                `)
                .eq('rep_id', REP_ID)
                .order('order_date', { ascending: false });
              if (error) throw error;
              return data || [];
            },
            async () => {
              return await offlineStorage.getOrders();
            },
            []
          ),
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('clients')
                .select('*');
              if (error) throw error;
              return data || [];
            },
            () => offlineStorage.getClients(),
            []
          )
        ]);

        if (isMounted) {
          setClients(clientsData.filter((c: Client) => c.status === 'active'));
          
          const activeOrders = orders.filter((order: any) => 
            order.rep_id === REP_ID
          ).length;
          
          const pendingOrders = orders.filter((order: any) => 
            order.rep_id === REP_ID && order.status === 'pending'
          ).length;
          
          const totalValue = orders.reduce((sum: number, order: any) => 
            order.rep_id === REP_ID ? sum + (order.total_amount || 0) : sum, 0
          );

          setData({
            orders: orders.filter((o: any) => o.rep_id === REP_ID).slice(0, 10),
            activeOrders,
            totalValue,
            pendingOrders,
            loaded: true,
            error: false,
            isOffline
          });
        }
      } catch (error) {
        console.error('Failed to load order data:', error);
        if (isMounted) {
          setData(prev => ({ ...prev, loaded: true, error: true, isOffline: !navigator.onLine }));
        }
      }
    };

    const timeout = setTimeout(() => {
      if (isMounted && !data.loaded) {
        setData(prev => ({ ...prev, loaded: true, error: false, isOffline: !navigator.onLine }));
      }
    }, 8000);

    loadOrderData();

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [data.loaded]);

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (client.location && client.location.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleOrderSaved = (orderId: string) => {
    toast.success('Order created successfully!');
    setShowOrderForm(false);
    setSelectedClient(null);
    // Refresh order data
    setData(prev => ({ ...prev, loaded: false }));
  };

  const SkeletonRow = () => (
    <tr className="animate-pulse">
      <td className="px-4 py-3">
        <div className="w-16 h-4 bg-gray-200 rounded"></div>
      </td>
      <td className="px-4 py-3">
        <div className="w-32 h-4 bg-gray-200 rounded"></div>
      </td>
      <td className="px-4 py-3">
        <div className="w-20 h-4 bg-gray-200 rounded"></div>
      </td>
      <td className="px-4 py-3">
        <div className="w-16 h-4 bg-gray-200 rounded"></div>
      </td>
      <td className="px-4 py-3">
        <div className="w-24 h-4 bg-gray-200 rounded"></div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Order Management</h1>
            <p className="text-gray-600 mt-1">Create and manage customer orders</p>
          </div>
          {data.loaded && data.isOffline && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm">
              <WifiOff size={16} />
              <span>Offline Mode</span>
            </div>
          )}
        </div>
      </div>

      {/* Client Selection */}
      {!showOrderForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2 text-blue-600" />
            Select Client
          </h3>
          
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search clients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                aria-label="Search clients"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-64 overflow-y-auto">
            {filteredClients.map(client => (
              <div
                key={client.id}
                onClick={() => {
                  setSelectedClient(client);
                  setShowOrderForm(true);
                }}
                className="p-4 border border-gray-200 rounded-lg cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedClient(client);
                    setShowOrderForm(true);
                  }
                }}
                aria-label={`Select ${client.name} for order`}
              >
                <h4 className="font-medium text-gray-900">{client.name}</h4>
                {client.location && (
                  <p className="text-sm text-gray-600 mt-1">{client.location}</p>
                )}
                {client.contact_email && (
                  <p className="text-sm text-gray-500 mt-1">{client.contact_email}</p>
                )}
              </div>
            ))}
          </div>
          
          {filteredClients.length === 0 && (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                {searchTerm ? 'No clients found matching your search' : 'No active clients available'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Order Form */}
      {showOrderForm && selectedClient && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Creating Order for {selectedClient.name}
            </h3>
            <button
              onClick={() => {
                setShowOrderForm(false);
                setSelectedClient(null);
              }}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 rounded"
            >
              Cancel
            </button>
          </div>
          <OrderForm
            clientId={selectedClient.id}
            onSaved={handleOrderSaved}
          />
        </div>
      )}

      {/* Order Summary - only show when not creating order */}
      {!showOrderForm && (
        <>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-3">
            <ShoppingCart className="w-6 h-6 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Active Orders</h3>
          </div>
          {!data.loaded ? (
            <div className="animate-pulse">
              <div className="w-8 h-8 bg-gray-200 rounded mb-2"></div>
              <div className="w-24 h-3 bg-gray-200 rounded"></div>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-900">
                {data.error ? '--' : data.activeOrders.toLocaleString()}
              </div>
              <p className="text-sm text-gray-500">
                {data.error ? 'No data available' : 'Draft, pending, confirmed'}
              </p>
            </>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-3">
            <DollarSign className="w-6 h-6 text-green-600" />
            <h3 className="font-semibold text-gray-900">Total Value</h3>
          </div>
          {!data.loaded ? (
            <div className="animate-pulse">
              <div className="w-12 h-8 bg-gray-200 rounded mb-2"></div>
              <div className="w-20 h-3 bg-gray-200 rounded"></div>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-900">
                {data.error ? '--' : currencyZAR(data.totalValue)}
              </div>
              <p className="text-sm text-gray-500">
                {data.error ? 'No data available' : 'All orders'}
              </p>
            </>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-3">
            <Clock className="w-6 h-6 text-orange-600" />
            <h3 className="font-semibold text-gray-900">Pending</h3>
          </div>
          {!data.loaded ? (
            <div className="animate-pulse">
              <div className="w-8 h-8 bg-gray-200 rounded mb-2"></div>
              <div className="w-28 h-3 bg-gray-200 rounded"></div>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-900">
                {data.error ? '--' : data.pendingOrders.toLocaleString()}
              </div>
              <p className="text-sm text-gray-500">
                {data.error ? 'No data available' : 'Awaiting confirmation'}
              </p>
            </>
          )}
        </div>
      </div>
        </>
      )}

      {/* Recent Orders Table - only show when not creating order */}
      {!showOrderForm && (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Package className="w-5 h-5 mr-2 text-purple-600" />
            Recent Orders
          </h3>
        </div>
        <div className="overflow-x-auto" role="region" aria-label="Recent orders table">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Order ID
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Client
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Items
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {!data.loaded ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : (
                <>
                  {data.orders.length > 0 ? (
                    data.orders.map((order: any) => (
                      <tr key={order.id}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          #{order.id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {order.clients?.name || 'Unknown Client'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {currencyZAR(order.total_amount || 0)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          --
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            order.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                            order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            order.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        {data.error ? 'Unable to load orders' : 'No orders to display'}
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}