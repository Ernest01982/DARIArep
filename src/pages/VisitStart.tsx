import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, MapPin, User, Phone, Clock, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { withOfflineFallback, isNetworkOnline } from '../services/sync';
import { supabase } from '../services/supabase';
import { offlineStorage, enqueueMutation } from '../services/offline';
import type { Client, ActiveVisit } from '../services/offline';
import { REP_ID } from '../config';

interface AddClientForm {
  name: string;
  location: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
}

export function VisitStart() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activeVisit, setActiveVisit] = useState<ActiveVisit | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingVisit, setIsStartingVisit] = useState(false);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [addClientForm, setAddClientForm] = useState<AddClientForm>({
    name: '',
    location: '',
    contact_name: '',
    contact_email: '',
    contact_phone: ''
  });

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load clients and active visit
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const [clientsData, activeVisitData] = await Promise.all([
          withOfflineFallback(
            async () => {
              const { data, error } = await supabase
                .from('clients')
                .select('*')
                .eq('status', 'active')
                .order('name');
              if (error) throw error;
              return data as Client[];
            },
            async () => {
              const allClients = await offlineStorage.getClients();
              return allClients.filter(c => c.status === 'active');
            },
            []
          ),
          offlineStorage.getActiveVisit()
        ]);

        if (isMounted) {
          setClients(clientsData);
          setActiveVisit(activeVisitData);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
        if (isMounted) {
          setIsLoading(false);
          toast.error('Failed to load clients');
        }
      }
    };

    const timeout = setTimeout(() => {
      if (isMounted && isLoading) {
        setIsLoading(false);
      }
    }, 8000);

    loadData();

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [isLoading]);

  // Filter clients based on search
  const filteredClients = useMemo(() => {
    if (!debouncedSearch) return clients;
    
    const searchLower = debouncedSearch.toLowerCase();
    return clients.filter(client => 
      client.name.toLowerCase().includes(searchLower) ||
      (client.address && client.address.toLowerCase().includes(searchLower))
    );
  }, [clients, debouncedSearch]);

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const errors: Record<string, string> = {};
    if (!addClientForm.name.trim()) {
      errors.name = 'Client name is required';
    }
    if (addClientForm.contact_email && !/\S+@\S+\.\S+/.test(addClientForm.contact_email)) {
      errors.contact_email = 'Please enter a valid email address';
    }
    
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsAddingClient(true);
    try {
      const newClient: Client = {
        id: uuidv4(),
        name: addClientForm.name.trim(),
        email: addClientForm.contact_email.trim() || undefined,
        phone: addClientForm.contact_phone.trim() || undefined,
        address: addClientForm.location.trim() || undefined,
        status: 'active',
        created_at: new Date().toISOString()
      };

      if (isNetworkOnline()) {
        const { error } = await supabase
          .from('clients')
          .insert(newClient);
        
        if (error) throw error;
        toast.success('Client added successfully');
      } else {
        await enqueueMutation({
          table: 'clients',
          operation: 'insert',
          payload: newClient
        });
        toast.success('Client added (will sync when online)');
      }

      // Update local state
      setClients(prev => [...prev, newClient]);
      setSelectedClient(newClient);
      setShowAddModal(false);
      setAddClientForm({
        name: '',
        location: '',
        contact_name: '',
        contact_email: '',
        contact_phone: ''
      });
      setFormErrors({});

    } catch (error) {
      console.error('Failed to add client:', error);
      toast.error('Failed to add client');
    } finally {
      setIsAddingClient(false);
    }
  };

  const handleStartVisit = async () => {
    if (!selectedClient) {
      toast.error('Please select a client');
      return;
    }

    if (activeVisit) {
      toast.error('Please end your current visit before starting a new one');
      return;
    }

    setIsStartingVisit(true);

    try {
      const visitId = uuidv4();
      const now = new Date().toISOString();
      
      const newVisit = {
        id: visitId,
        rep_id: REP_ID,
        client_id: selectedClient.id,
        visit_date: now.split('T')[0],
        check_in_time: now,
        notes: null,
        created_at: now,
        updated_at: now
      };

      const newActiveVisit: ActiveVisit = {
        visit_id: visitId,
        client_id: selectedClient.id,
        start_time: now,
        notes: undefined
      };

      if (isNetworkOnline()) {
        const { error } = await supabase
          .from('visits')
          .insert(newVisit);
        
        if (error) throw error;
        toast.success('Visit started successfully');
      } else {
        await enqueueMutation({
          table: 'visits',
          operation: 'insert',
          payload: newVisit
        });
        toast.success('Visit started (will sync when online)');
      }

      // Store active visit
      await offlineStorage.setActiveVisit(newActiveVisit);
      setActiveVisit(newActiveVisit);

      // Navigate to visit client page
      navigate(`/visit/client?visit_id=${visitId}&client_id=${selectedClient.id}`);

    } catch (error) {
      console.error('Failed to start visit:', error);
      toast.error('Failed to start visit');
    } finally {
      setIsStartingVisit(false);
    }
  };

  const handleResumeVisit = () => {
    if (activeVisit) {
      navigate(`/visit/client?visit_id=${activeVisit.visit_id}&client_id=${activeVisit.client_id}`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Start Visit</h1>
          <p className="text-gray-600 mt-1">Select a client to begin your visit</p>
        </div>

        <div className="animate-pulse space-y-4">
          <div className="w-full h-10 bg-gray-200 rounded-lg"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Start Visit</h1>
        <p className="text-gray-600 mt-1">Select a client to begin your visit</p>
      </div>

      {/* Active Visit Warning */}
      {activeVisit && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            <div className="flex-1">
              <h3 className="font-medium text-orange-900">Visit in Progress</h3>
              <p className="text-sm text-orange-700">
                You have an active visit. Complete or resume it before starting a new one.
              </p>
            </div>
            <button
              onClick={handleResumeVisit}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            >
              Resume Visit
            </button>
          </div>
        </div>
      )}

      {/* Client Search and Add Client */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <input
              type="text"
              placeholder="Search clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Search clients"
            />
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            
            {/* Dropdown */}
            {(searchTerm || !selectedClient) && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredClients.length > 0 ? (
                  filteredClients.map(client => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => {
                        setSelectedClient(client);
                        setSearchTerm('');
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium text-gray-900">{client.name}</div>
                      {client.address && (
                        <div className="text-sm text-gray-600">{client.address}</div>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-gray-500">
                    {searchTerm ? 'No clients found' : 'Start typing to search clients'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
        >
          <Plus className="w-5 h-5" />
          <span>Add Client</span>
        </button>
      </div>

      {/* Selected Client Display */}
      {selectedClient && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <User className="w-5 h-5 text-blue-600 mt-1" />
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-blue-900">{selectedClient.name}</h3>
              {selectedClient.address && (
                <div className="flex items-center space-x-1 mt-1">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <p className="text-sm text-blue-700">{selectedClient.address}</p>
                </div>
              )}
              {selectedClient.phone && (
                <div className="flex items-center space-x-1 mt-1">
                  <Phone className="w-4 h-4 text-blue-600" />
                  <p className="text-sm text-blue-700">{selectedClient.phone}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No clients message */}
      {clients.length === 0 && (
        <div className="text-center py-12">
          <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No active clients</h3>
          <p className="text-gray-600 mb-4">Add your first client to get started</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Plus className="w-5 h-5" />
            <span>Add Client</span>
          </button>
        </div>
      )}

      {/* Start Visit Button */}
      {selectedClient && !activeVisit && (
        <div className="flex justify-end">
          <button
            onClick={handleStartVisit}
            disabled={isStartingVisit}
            className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Clock className="w-5 h-5" />
            <span>{isStartingVisit ? 'Starting Visit...' : 'Start Visit'}</span>
          </button>
        </div>
      )}

      {/* Add Client Modal */}
      {showAddModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-client-title"
        >
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 id="add-client-title" className="text-xl font-bold text-gray-900 mb-4">Add New Client</h2>
            
            <form onSubmit={handleAddClient} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Name *
                </label>
                <input
                  type="text"
                  required
                  value={addClientForm.name}
                  onChange={(e) => setAddClientForm(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    formErrors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Enter client name"
                  aria-describedby={formErrors.name ? 'name-error' : undefined}
                />
                {formErrors.name && (
                  <p id="name-error" className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={addClientForm.location}
                  onChange={(e) => setAddClientForm(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter location/address"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={addClientForm.contact_name}
                  onChange={(e) => setAddClientForm(prev => ({ ...prev, contact_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter contact person name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={addClientForm.contact_email}
                  onChange={(e) => setAddClientForm(prev => ({ ...prev, contact_email: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    formErrors.contact_email ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Enter email address"
                  aria-describedby={formErrors.contact_email ? 'email-error' : undefined}
                />
                {formErrors.contact_email && (
                  <p id="email-error" className="mt-1 text-sm text-red-600">{formErrors.contact_email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={addClientForm.contact_phone}
                  onChange={(e) => setAddClientForm(prev => ({ ...prev, contact_phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter phone number"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingClient}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {isAddingClient ? 'Adding...' : 'Add Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}