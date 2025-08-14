import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';

// Configure localforage
localforage.config({
  name: 'RepDashboard',
  version: 1.0,
  storeName: 'rep_data',
  description: 'Rep Dashboard offline data storage'
});

// Data types
export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  sku?: string;
  created_at: string;
  updated_at: string;
}

export interface Visit {
  id: string;
  rep_id: string;
  client_id: string;
  start_time: string;
  end_time?: string;
  notes?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  rep_id: string;
  client_id: string;
  visit_id?: string;
  total_amount: number;
  status: 'draft' | 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  order_date: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  updated_at: string;
}

export interface ClientProduct {
  id: string;
  client_id: string;
  product_id: string;
  last_order_date?: string;
  last_order_quantity?: number;
  preferred_quantity?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface RepTask {
  id: string;
  rep_id: string;
  title: string;
  description?: string;
  end_date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  rep_id: string;
  month: string; // YYYY-MM format
  target_amount: number;
  current_amount: number;
  created_at: string;
  updated_at: string;
}

export interface ClientFollowup {
  id: string;
  client_id: string;
  client_name: string;
  rep_id: string;
  last_visit_date?: string;
  last_order_date?: string;
  days_since_last_contact: number;
  follow_up_priority: 'low' | 'medium' | 'high';
  notes?: string;
}

export interface ActiveVisit {
  visit_id: string;
  client_id: string;
  start_time: string;
  notes?: string;
}

export interface MutationQueueItem {
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'upsert' | 'delete';
  payload: any;
  key?: string;
  timestamp: string;
  synced: boolean;
}

// Storage keys
const STORAGE_KEYS = {
  clients: 'clients',
  products: 'products',
  visits: 'visits',
  orders: 'orders',
  order_items: 'order_items',
  client_products: 'client_products',
  rep_tasks: 'rep_tasks',
  budgets: 'budgets',
  client_followups: 'client_followups',
  active_visit: 'active_visit',
  mutation_queue: 'mutation_queue'
} as const;

// Generic storage functions
export async function setData<T>(key: keyof typeof STORAGE_KEYS, data: T[]): Promise<void> {
  await localforage.setItem(STORAGE_KEYS[key], data);
}

export async function getData<T>(key: keyof typeof STORAGE_KEYS): Promise<T[]> {
  const data = await localforage.getItem<T[]>(STORAGE_KEYS[key]);
  return data || [];
}

export async function storageSetActiveVisit(visit: ActiveVisit | null): Promise<void> {
  if (visit) {
    await localforage.setItem(STORAGE_KEYS.active_visit, visit);
  } else {
    await localforage.removeItem(STORAGE_KEYS.active_visit);
  }
}

export async function storageGetActiveVisit(): Promise<ActiveVisit | null> {
  return await localforage.getItem<ActiveVisit>(STORAGE_KEYS.active_visit);
}

// Specific data access functions
export const offlineStorage = {
  // Clients
  async setClients(clients: Client[]): Promise<void> {
    await setData('clients', clients);
  },
  async getClients(): Promise<Client[]> {
    return await getData<Client>('clients');
  },

  // Products
  async setProducts(products: Product[]): Promise<void> {
    await setData('products', products);
  },
  async getProducts(): Promise<Product[]> {
    return await getData<Product>('products');
  },

  // Visits
  async setVisits(visits: Visit[]): Promise<void> {
    await setData('visits', visits);
  },
  async getVisits(): Promise<Visit[]> {
    return await getData<Visit>('visits');
  },

  // Orders
  async setOrders(orders: Order[]): Promise<void> {
    await setData('orders', orders);
  },
  async getOrders(): Promise<Order[]> {
    return await getData<Order>('orders');
  },

  // Order Items
  async setOrderItems(orderItems: OrderItem[]): Promise<void> {
    await setData('order_items', orderItems);
  },
  async getOrderItems(): Promise<OrderItem[]> {
    return await getData<OrderItem>('order_items');
  },

  // Client Products
  async setClientProducts(clientProducts: ClientProduct[]): Promise<void> {
    await setData('client_products', clientProducts);
  },
  async getClientProducts(): Promise<ClientProduct[]> {
    return await getData<ClientProduct>('client_products');
  },

  // Rep Tasks
  async setRepTasks(repTasks: RepTask[]): Promise<void> {
    await setData('rep_tasks', repTasks);
  },
  async getRepTasks(): Promise<RepTask[]> {
    return await getData<RepTask>('rep_tasks');
  },

  // Budgets
  async setBudgets(budgets: Budget[]): Promise<void> {
    await setData('budgets', budgets);
  },
  async getBudgets(): Promise<Budget[]> {
    return await getData<Budget>('budgets');
  },

  // Client Followups
  async setClientFollowups(followups: ClientFollowup[]): Promise<void> {
    await setData('client_followups', followups);
  },
  async getClientFollowups(): Promise<ClientFollowup[]> {
    return await getData<ClientFollowup>('client_followups');
  },

  // Active Visit
  async setActiveVisit(visit: ActiveVisit | null): Promise<void> {
    await storageSetActiveVisit(visit);
  },
  async getActiveVisit(): Promise<ActiveVisit | null> {
    return await storageGetActiveVisit();
  }
};

// Mutation queue functions
export async function enqueueMutation(mutation: Omit<MutationQueueItem, 'id' | 'timestamp' | 'synced'>): Promise<void> {
  const queue = await localforage.getItem<MutationQueueItem[]>(STORAGE_KEYS.mutation_queue) || [];
  
  const queueItem: MutationQueueItem = {
    ...mutation,
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    synced: false
  };
  
  queue.push(queueItem);
  await localforage.setItem(STORAGE_KEYS.mutation_queue, queue);
}

export async function dequeueMutation(): Promise<MutationQueueItem | null> {
  const queue = await localforage.getItem<MutationQueueItem[]>(STORAGE_KEYS.mutation_queue) || [];
  
  if (queue.length === 0) {
    return null;
  }
  
  const item = queue.shift()!;
  await localforage.setItem(STORAGE_KEYS.mutation_queue, queue);
  return item;
}

export async function peekAllMutations(): Promise<MutationQueueItem[]> {
  return await localforage.getItem<MutationQueueItem[]>(STORAGE_KEYS.mutation_queue) || [];
}

export async function markMutationSynced(mutationId: string): Promise<void> {
  const queue = await localforage.getItem<MutationQueueItem[]>(STORAGE_KEYS.mutation_queue) || [];
  const updatedQueue = queue.map(item => 
    item.id === mutationId ? { ...item, synced: true } : item
  );
  await localforage.setItem(STORAGE_KEYS.mutation_queue, updatedQueue);
}

export async function removeSyncedMutations(): Promise<void> {
  const queue = await localforage.getItem<MutationQueueItem[]>(STORAGE_KEYS.mutation_queue) || [];
  const unsyncedQueue = queue.filter(item => !item.synced);
  await localforage.setItem(STORAGE_KEYS.mutation_queue, unsyncedQueue);
}

export async function getPendingMutationsCount(): Promise<number> {
  const queue = await localforage.getItem<MutationQueueItem[]>(STORAGE_KEYS.mutation_queue) || [];
  return queue.filter(item => !item.synced).length;
}