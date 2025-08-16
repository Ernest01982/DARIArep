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
  Download,
  Mail,
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

// --- Interfaces --- //

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

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  price: number;
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

// --- Component --- //

export function VisitClient() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const visitId = searchParams.get('visit_id');
  const clientId = searchParams.get('client_id');

  // --- State Management --- //

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
  const [isLoading, setIsLoading] = useState(false);
  const [isEndingVisit, setIsEndingVisit] = useState(false);
  const [isDelisting, setIsDelisting] = useState(false);

  // --- Data Loading Effect --- //
  
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
            () => offlineStorage.getItem(`client_${clientId}`)
          ),
          // Active Visit
          offlineStorage.getItem(`active_visit_${visitId}`),
          // Previous Visits
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('visits')
                .select('*')
                .eq('client_id', clientId)
                .order('visit_date', { ascending: false });
              if (error) throw error;
              return data;
            },
            () => offlineStorage.getItem(`visits_for_client_${clientId}`)
          ),
          // Client Products
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('client_products')
                .select('*, products(name, sku)')
                .eq('client_id', clientId);
              if (error) throw error;
              return data;
            },
            () => offlineStorage.getItem(`client_products_${clientId}`)
          ),
          // All Products
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase.from('products').select('*');
              if (error) throw error;
              return data;
            },
            () => offlineStorage.getItem('products')
          )
        ]);
        
        clearTimeout(timeout);

        if (isMounted) {
          const clientProductIds = new Set(clientProducts.map(p => p.product_id));
          const availableProducts = allProducts.filter(p => !clientProductIds.has(p.id));
          
          setData({
            client,
            activeVisit,
            previousVisits: previousVisits || [],
            clientProducts: clientProducts || [],
            availableProducts: availableProducts || [],
            loaded: true,
            error: !client
          });
          
          if (activeVisit) {
            setVisitNotes(activeVisit.notes || '');
          }
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

  
  // --- Event Handlers & Functions --- //

  const handleVisitClick = async (visit: Visit) => {
    setSelectedVisit(visit);
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('visit_id', visit.id);
        if (error) throw error;
        setVisitOrders(data || []);
    } catch (error) {
        console.error('Failed to fetch orders for visit:', error);
        setVisitOrders([]);
    }
  };

  const handleUpdateNotes = async () => {
    if (!visitId) return;

    try {
      const payload = { notes: visitNotes };

      if (isNetworkOnline()) {
        const { error } = await supabase
          .from('visits')
          .update(payload)
          .eq('id', visitId);
        if (error) throw error;
      } else {
        await enqueueMutation({
          table: 'visits',
          operation: 'update',
          payload: payload,
          key: visitId
        });
      }

      const activeVisit = await offlineStorage.getItem(`active_visit_${visitId}`);
      if (activeVisit) {
        activeVisit.notes = visitNotes;
        await offlineStorage.setItem(`active_visit_${visitId}`, activeVisit);
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
      await offlineStorage.removeItem(`active_visit_${visitId}`);
      toast.success('Visit ended successfully!');
      navigate('/visit');
    } catch (error) {
      console.error('Failed to end visit:', error);
      toast.error('Failed to end visit. Your data is saved locally.');
    } finally {
      setIsEndingVisit(false);
    }
  };


  // --- Render Logic --- //

  if (!data.loaded) {
    return <div>Loading...</div>; // Or a spinner component
  }

  if (data.error || !data.client) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
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
                        {formatDateTime(visit.check_in_time)} - {visit.check_out_time ? formatDateTime(visit.check_out_time) : 'Ongoing'}
                      </p>
                    </div>
                    <Eye className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No previous visits recorded.</p>
            )}
          </div>
        </div>
        
        {/* Further UI components would go here */}

      </div>
    </div>
  );
}

