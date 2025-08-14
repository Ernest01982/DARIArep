import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  User, 
  Clock, 
  Package,
  ShoppingCart,
  FileText,
  Calendar,
  Plus,
  Eye,
  X,
  Check,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { withOfflineFallback, isNetworkOnline } from '../services/sync';
import { supabase } from '../services/supabase';
import { offlineStorage, enqueueMutation, ActiveVisit } from '../services/offline';
import { currencyZAR, formatDate, formatDateTime } from '../utils/format';
import { REP_ID } from '../config';
import { v4 as uuidv4 } from 'uuid';
import { OrderForm } from '../components/OrderForm';

interface Visit {
  id: string;
  visit_date: string;
  check_in_time: string;
  check_out_time?: string;
  notes?: string;
}

interface Client {
  id: string;
  name: string;
  contact_email?: string;
  contact_phone?: string;
  location?: string;
}

interface ClientProduct {
  id: string;
  product_id: string;
  listed: boolean;
  first_seen_at?: string;
  is_new_listing: boolean;
  products: {
    name: string;
    sku?: string;
  };
}

interface Product {
  id: string;
  name: string;
  sku?: string;
  price: number;
}

interface Order {
  id: string;
  order_date: string;
  total_amount?: number;
}

interface VisitClientData {
  client: Client | null;
  activeVisit: ActiveVisit | null;
  previousVisits: Visit[];
  clientProducts: ClientProduct[];
  availableProducts: Product[];
  loaded: boolean;
  error: boolean;
}

export function VisitClient() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const visitId = searchParams.get('visit_id');
  const clientId = searchParams.get('client_id');

  const [data, setData] = useState<VisitClientData>({
    client: null,
    activeVisit: null,
    previousVisits: [],
    clientProducts: [],
    availableProducts: [],
    loaded: false,
    error: false
  });

  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [visitOrders, setVisitOrders] = useState<Order[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [visitNotes, setVisitNotes] = useState('');
  const [followUpForm, setFollowUpForm] = useState({
    title: '',
    description: '',
    date: '',
    time: ''
  });
  const [, setIsLoading] = useState(false);
  const [isEndingVisit, setIsEndingVisit] = useState(false);
  const [isDelisting, setIsDelisting] = useState(false);

  // Load visit data
  useEffect(() => {
    if (!visitId || !clientId) {
      navigate('/visit');
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      try {
        const timeout = setTimeout(() => {
          if (isMounted) {
            setData(prev => ({ ...prev, loaded: true, error: false }));
          }
        }, 8000);

        const [client, activeVisit, previousVisits, clientProducts, allProducts] = await Promise.all([
          // Client
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('clients')
                .select('*')
                .eq('id', clientId)
                .single();
              if (error) throw error;
              return data;
            },
            async () => {
              const clients = await offlineStorage.getClients();
              return clients.find(c => c.id === clientId) || null;
            },
            null
          ),

          // Active visit
          offlineStorage.getActiveVisit(),

          // Previous 5 visits
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('visits')
                .select('*')
                .eq('client_id', clientId)
                .neq('id', visitId)
                .order('visit_date', { ascending: false })
                .limit(5);
              if (error) throw error;
              return data || [];
            },
            async () => {
              const visits = await offlineStorage.getVisits();
              return visits
                .filter(v => v.client_id === clientId && v.id !== visitId)
                .sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())
                .slice(0, 5);
            },
            []
          ),

          // Client products
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('client_products')
                .select(`
                  *,
                  products (
                    name,
                    sku
                  )
                `)
                .eq('client_id', clientId)
                .eq('listed', true);
              if (error) throw error;
              return data || [];
            },
            async () => {
              const clientProducts = await offlineStorage.getClientProducts();
              const products = await offlineStorage.getProducts();
              return clientProducts
                .filter(cp => cp.client_id === clientId && cp.listed)
                .map(cp => ({
                  ...cp,
                  products: products.find(p => p.id === cp.product_id) || { name: 'Unknown', sku: '' }
                }));
            },
            []
          ),

          // All products
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
          )
        ]);

        clearTimeout(timeout);

        if (isMounted) {
          setData({
            client,
            activeVisit,
            previousVisits,
            clientProducts,
            availableProducts: allProducts,
            loaded: true,
            error: false
          });

          setVisitNotes(activeVisit?.notes || '');
        }
      } catch (error) {
        console.error('Failed to load visit data:', error);
        if (isMounted) {
          setData(prev => ({ ...prev, loaded: true, error: true }));
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [visitId, clientId, navigate]);

  const handleVisitClick = async (visit: Visit) => {
    setSelectedVisit(visit);
    
    try {
      const orders = await withOfflineFallback(
        async () => {
          const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('visit_id', visit.id);
          if (error) throw error;
          return data || [];
        },
        async () => {
          const orders = await offlineStorage.getOrders();
          return orders.filter(o => o.visit_id === visit.id);
        },
        []
      );
      
      setVisitOrders(orders);
    } catch (error) {
      console.error('Failed to load visit orders:', error);
      setVisitOrders([]);
    }
  };

  const handleListProducts = async () => {
    if (selectedProducts.length === 0) {
      toast.error('Please select at least one product');
      return;
    }

    setIsLoading(true);
    try {
      const now = new Date().toISOString();
      
      for (const productId of selectedProducts) {
        const clientProduct = {
          id: uuidv4(),
          client_id: clientId!,
          product_id: productId,
          listed: true,
          first_seen_at: now,
          is_new_listing: true,
          last_updated: now
        };

        const visitSku = {
          id: uuidv4(),
          visit_id: visitId!,
          product_id: productId,
          client_id: clientId!,
          seen_at: now
        };

        if (isNetworkOnline()) {
          await Promise.all([
            supabase.from('client_products').upsert(clientProduct),
            supabase.from('visit_skus').insert(visitSku)
          ]);
        } else {
          await Promise.all([
            enqueueMutation({
              table: 'client_products',
              operation: 'upsert',
              payload: clientProduct
            }),
            enqueueMutation({
              table: 'visit_skus',
              operation: 'insert',
              payload: visitSku
            })
          ]);
        }
      }

      toast.success(`${selectedProducts.length} product(s) listed successfully`);
      setShowProductModal(false);
      setSelectedProducts([]);
      
      // Refresh client products
      window.location.reload();
    } catch (error) {
      console.error('Failed to list products:', error);
      toast.error('Failed to list products');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNotesUpdate = async () => {
    if (!visitId) return;

    try {
      const updateData = { notes: visitNotes };

      if (isNetworkOnline()) {
        const { error } = await supabase
          .from('visits')
          .update(updateData)
          .eq('id', visitId);
        if (error) throw error;
      } else {
        await enqueueMutation({
          table: 'visits',
          operation: 'update',
          payload: updateData,
          key: visitId
        });
      }

      toast.success('Notes updated');
    } catch (error) {
      console.error('Failed to update notes:', error);
      toast.error('Failed to update notes');
    }
  };

  const handleAddFollowUp = async () => {
    if (!followUpForm.title || !followUpForm.date || !followUpForm.time) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    try {
      const startDate = `${followUpForm.date}T${followUpForm.time}:00`;
      const endDate = new Date(new Date(startDate).getTime() + 60 * 60 * 1000).toISOString();

      const task = {
        id: uuidv4(),
        rep_id: REP_ID,
        title: followUpForm.title,
        description: followUpForm.description,
        start_date: startDate,
        end_date: endDate,
        status: 'assigned',
        created_at: new Date().toISOString()
      };

      if (isNetworkOnline()) {
        const { error } = await supabase.from('rep_tasks').insert(task);
        if (error) throw error;
      } else {
        await enqueueMutation({
          table: 'rep_tasks',
          operation: 'insert',
          payload: task
        });
      }

      toast.success('Follow-up task created');
      setShowFollowUpModal(false);
      setFollowUpForm({ title: '', description: '', date: '', time: '' });
    } catch (error) {
      console.error('Failed to create follow-up:', error);
      toast.error('Failed to create follow-up');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOrderSaved = () => {
    toast.success('Order created successfully!');
    setShowOrderForm(false);
    // Optionally refresh data or update UI
  };

  const handleEndVisit = async () => {
    if (!visitId || !clientId) {
      toast.error('Missing client or visit information');
      return;
    }

    setIsEndingVisit(true);
    try {
      const checkOutTime = new Date().toISOString();
      const today = new Date().toISOString().split('T')[0];
      
      if (isNetworkOnline()) {
        await Promise.all([
          supabase
            .from('visits')
            .update({ check_out_time: checkOutTime })
            .eq('id', visitId),
          supabase
            .from('clients')
            .update({ last_visit_date: today })
            .eq('id', clientId)
        ]);
      } else {
        await Promise.all([
          enqueueMutation({
            table: 'visits',
            operation: 'update',
            payload: { check_out_time: checkOutTime },
            key: visitId
          }),
          enqueueMutation({
            table: 'clients',
            operation: 'update',
            payload: { last_visit_date: today },
            key: clientId
          })
        ]);
      }

      await offlineStorage.setActiveVisit(null);
      toast.success('Visit ended successfully');
      navigate('/');
    } catch (error) {
      console.error('Failed to end visit:', error);
      toast.error('Failed to end visit');
    } finally {
      setIsEndingVisit(false);
    }
  };

  const handleDelistProduct = async (clientProductId: string, productName: string) => {
    if (!confirm(`Are you sure you want to delist "${productName}"? This will mark it as no longer available at this client.`)) {
      return;
    }

    setIsDelisting(true);
    try {
      const now = new Date().toISOString();
      
      // Update client_products to mark as delisted
      const updateData = {
        listed: false,
        last_updated: now
      };

      if (isNetworkOnline()) {
        const { error } = await supabase
          .from('client_products')
          .update(updateData)
          .eq('id', clientProductId);
        if (error) throw error;
      } else {
        await enqueueMutation({
          table: 'client_products',
          operation: 'update',
          payload: updateData,
          key: clientProductId
        });
      }

      toast.success(`${productName} has been delisted`);
      
      // Update local state to remove the product from the list
      setData(prev => ({
        ...prev,
        clientProducts: prev.clientProducts.filter(cp => cp.id !== clientProductId)
      }));
      
    } catch (error) {
      console.error('Failed to delist product:', error);
      toast.error('Failed to delist product');
    } finally {
      setIsDelisting(false);
    }
  };

  const generateCalendarLink = () => {
    if (!followUpForm.title || !followUpForm.date || !followUpForm.time) return '#';
    
    const startDateTime = new Date(`${followUpForm.date}T${followUpForm.time}:00`);
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
    
    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };
    
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: followUpForm.title,
      details: followUpForm.description,
      dates: `${formatDate(startDateTime)}/${formatDate(endDateTime)}`
    });
    
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  const unlistedProducts = data.availableProducts.filter(product => 
    !data.clientProducts.some(cp => cp.product_id === product.id)
  );

  if (!data.loaded) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-gray-200 rounded"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!data.client) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Client Not Found</h2>
        <p className="text-gray-600 mb-4">The requested client could not be found.</p>
        <button
          onClick={() => navigate('/visit')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Back to Visit Start
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <User className="w-6 h-6 mr-2 text-blue-600" />
            {data.client.name}
          </h1>
          <p className="text-gray-600 mt-1">Active visit in progress</p>
        </div>
        <button
          onClick={handleEndVisit}
          disabled={!data.activeVisit || isEndingVisit || !clientId}
          className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isEndingVisit ? 'Ending Visit...' : 'End Visit'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Previous Visits */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Clock className="w-5 h-5 mr-2 text-purple-600" />
            Previous Visits
          </h3>
          <div className="space-y-3">
            {data.previousVisits.length > 0 ? (
              data.previousVisits.map((visit) => (
                <div
                  key={visit.id}
                  onClick={() => handleVisitClick(visit)}
                  className="p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900">{formatDate(visit.visit_date)}</p>
                      <p className="text-sm text-gray-600">
                        {visit.check_in_time && formatDateTime(visit.check_in_time)}
                      </p>
                      {visit.notes && (
                        <p className="text-sm text-gray-500 mt-1 truncate">
                          {visit.notes.substring(0, 50)}...
                        </p>
                      )}
                    </div>
                    <Eye className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No previous visits</p>
            )}
          </div>
        </div>

        {/* Listed Products */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Package className="w-5 h-5 mr-2 text-green-600" />
              Listed Products
            </h3>
            <button
              onClick={() => setShowProductModal(true)}
              className="flex items-center space-x-2 px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>List New</span>
            </button>
          </div>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {data.clientProducts.length > 0 ? (
              data.clientProducts.map((cp) => (
                <div key={cp.id} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg group">
                  <div>
                    <p className="font-medium text-gray-900">{cp.products.name}</p>
                    {cp.products.sku && (
                      <p className="text-sm text-gray-600">SKU: {cp.products.sku}</p>
                    )}
                    {cp.first_seen_at && (
                      <p className="text-xs text-gray-500">First seen: {formatDate(cp.first_seen_at)}</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {cp.is_new_listing && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        New
                      </span>
                    )}
                    <button
                      onClick={() => handleDelistProduct(cp.id, cp.products.name)}
                      disabled={isDelisting}
                      className="opacity-0 group-hover:opacity-100 p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-all duration-200 disabled:opacity-50"
                      title="Delist product"
                      aria-label={`Delist ${cp.products.name}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No products listed yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Order Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <ShoppingCart className="w-5 h-5 mr-2 text-blue-600" />
            Create Order
          </h3>
          <button
            onClick={() => setShowOrderForm(!showOrderForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {showOrderForm ? 'Cancel' : 'New Order'}
          </button>
        </div>
        {showOrderForm && (
          <div className="border-t pt-4">
            <OrderForm
              clientId={clientId!}
              visitId={visitId}
              onSaved={handleOrderSaved}
            />
          </div>
        )}
      </div>

      {/* Notes & Follow-up */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <FileText className="w-5 h-5 mr-2 text-orange-600" />
          Notes & Follow-up
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Visit Notes
            </label>
            <textarea
              value={visitNotes}
              onChange={(e) => setVisitNotes(e.target.value)}
              onBlur={handleNotesUpdate}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add notes about this visit..."
            />
          </div>
          <button
            onClick={() => setShowFollowUpModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
          >
            <Calendar className="w-4 h-4" />
            <span>Add Follow-up</span>
          </button>
        </div>
      </div>

      {/* Visit Details Modal */}
      {selectedVisit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  Visit Details - {formatDate(selectedVisit.visit_date)}
                </h2>
                <button
                  onClick={() => setSelectedVisit(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              {selectedVisit.notes && (
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedVisit.notes}</p>
                </div>
              )}
              
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Orders from this visit</h3>
                {visitOrders.length > 0 ? (
                  <div className="space-y-2">
                    {visitOrders.map((order) => (
                      <div key={order.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">#{order.id.slice(0, 8)}</p>
                          <p className="text-sm text-gray-600">{formatDate(order.order_date)}</p>
                        </div>
                        <p className="font-semibold">{currencyZAR(order.total_amount || 0)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No orders from this visit</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* List Products Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">List New Products</h2>
                <button
                  onClick={() => setShowProductModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
                {unlistedProducts.map((product) => (
                  <div
                    key={product.id}
                    className={`p-3 border rounded-lg cursor-pointer ${
                      selectedProducts.includes(product.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      setSelectedProducts(prev =>
                        prev.includes(product.id)
                          ? prev.filter(id => id !== product.id)
                          : [...prev, product.id]
                      );
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{product.name}</p>
                        {product.sku && (
                          <p className="text-sm text-gray-600">SKU: {product.sku}</p>
                        )}
                        <p className="text-sm text-gray-600">{currencyZAR(product.price)}</p>
                      </div>
                      {selectedProducts.includes(product.id) && (
                        <Check className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowProductModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleListProducts}
                  disabled={selectedProducts.length === 0}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  List {selectedProducts.length} Product(s)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Follow-up Modal */}
      {showFollowUpModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Add Follow-up Task</h2>
                <button
                  onClick={() => setShowFollowUpModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={followUpForm.title}
                    onChange={(e) => setFollowUpForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Follow-up task title"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={followUpForm.description}
                    onChange={(e) => setFollowUpForm(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Task description"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date *
                    </label>
                    <input
                      type="date"
                      value={followUpForm.date}
                      onChange={(e) => setFollowUpForm(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Time *
                    </label>
                    <input
                      type="time"
                      value={followUpForm.time}
                      onChange={(e) => setFollowUpForm(prev => ({ ...prev, time: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                
                {followUpForm.title && followUpForm.date && followUpForm.time && (
                  <div>
                    <a
                      href={generateCalendarLink()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-2 text-blue-600 hover:text-blue-700 text-sm"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Add to Google Calendar</span>
                    </a>
                  </div>
                )}
              </div>
              
              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setShowFollowUpModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddFollowUp}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}