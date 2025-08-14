import { REP_ID } from '../config';
import { supabase } from './supabase';
import { offlineStorage, enqueueMutation, dequeueMutation, markMutationSynced, removeSyncedMutations } from './offline';
import type { 
  Client, 
  Product, 
  ClientProduct, 
  Budget, 
  RepTask, 
  ClientFollowup,
  MutationQueueItem 
} from './offline';

// Network status
let isOnline = navigator.onLine;

// Network event listeners
window.addEventListener('online', async () => {
  isOnline = true;
  console.log('Network connection restored');
  try {
    await syncUp();
    await syncDown(getCurrentRepId());
  } catch (error) {
    console.error('Auto-sync failed:', error);
  }
});

window.addEventListener('offline', () => {
  isOnline = false;
  console.log('Network connection lost');
});

function getCurrentRepId(): string {
  return REP_ID;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  // Previous month
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  
  // Next month
  const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
  const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
  
  const startDate = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
  const endDate = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01`;
  
  return { startDate, endDate };
}

export async function syncDown(repId: string): Promise<void> {
  if (!isOnline) {
    throw new Error('Cannot sync while offline');
  }

  try {
    console.log('Starting sync down...');

    // Fetch clients (active and inactive)
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('*')
      .in('status', ['active', 'inactive']);

    if (clientsError) throw clientsError;
    await offlineStorage.setClients(clients as Client[]);

    // Fetch products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*');

    if (productsError) throw productsError;
    await offlineStorage.setProducts(products as Product[]);

    // Fetch client_products
    const { data: clientProducts, error: clientProductsError } = await supabase
      .from('client_products')
      .select('*');

    if (clientProductsError) throw clientProductsError;
    await offlineStorage.setClientProducts(clientProducts as ClientProduct[]);

    // Fetch budgets for current month
    const currentMonth = parseInt(getCurrentMonth());
    const { data: budgets, error: budgetsError } = await supabase
      .from('budgets')
      .select('*')
      .eq('rep_id', repId)
      .eq('month', currentMonth);

    if (budgetsError) throw budgetsError;
    await offlineStorage.setBudgets(budgets as Budget[]);

    // Fetch rep_tasks for current month +/- 1 month
    const { startDate, endDate } = getDateRange();
    const { data: repTasks, error: repTasksError } = await supabase
      .from('rep_tasks')
      .select('*')
      .eq('rep_id', repId)
      .gte('end_date', startDate)
      .lt('end_date', endDate);

    if (repTasksError) throw repTasksError;
    await offlineStorage.setRepTasks(repTasks as RepTask[]);

    // Fetch client_followups view snapshot
    const { data: clientFollowups, error: followupsError } = await supabase
      .from('client_followups')
      .select('*');

    if (followupsError) throw followupsError;
    await offlineStorage.setClientFollowups(clientFollowups as ClientFollowup[]);

    console.log('Sync down completed successfully');
  } catch (error) {
    console.error('Sync down failed:', error);
    throw error;
  }
}

export async function syncUp(): Promise<void> {
  if (!isOnline) {
    throw new Error('Cannot sync while offline');
  }

  try {
    console.log('Starting sync up...');
    
    let mutation: MutationQueueItem | null;
    let processedCount = 0;
    
    // Process mutations in FIFO order
    while ((mutation = await dequeueMutation()) !== null) {
      try {
        await processMutation(mutation);
        await markMutationSynced(mutation.id);
        processedCount++;
      } catch (error) {
        console.error(`Failed to sync mutation ${mutation.id}:`, error);
        // Re-queue the mutation for retry
        await enqueueMutation({
          table: mutation.table,
          operation: mutation.operation,
          payload: mutation.payload,
          key: mutation.key
        });
        throw error;
      }
    }

    // Clean up synced mutations
    await removeSyncedMutations();
    
    console.log(`Sync up completed: ${processedCount} mutations processed`);
  } catch (error) {
    console.error('Sync up failed:', error);
    throw error;
  }
}

async function processMutation(mutation: MutationQueueItem): Promise<void> {
  const { table, operation, payload, key } = mutation;

  switch (operation) {
    case 'insert':
      const { error: insertError } = await supabase
        .from(table)
        .insert(payload);
      if (insertError) {
        // If duplicate key error, treat as success (idempotency)
        if (insertError.code === '23505') {
          console.log(`Duplicate key for ${table}, treating as success`);
          return;
        }
        throw insertError;
      }
      break;

    case 'update':
      if (!key) throw new Error('Update operation requires a key');
      const { error: updateError } = await supabase
        .from(table)
        .update(payload)
        .eq('id', key);
      if (updateError) throw updateError;
      break;

    case 'upsert':
      const { error: upsertError } = await supabase
        .from(table)
        .upsert(payload);
      if (upsertError) throw upsertError;
      break;

    case 'delete':
      if (!key) throw new Error('Delete operation requires a key');
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .eq('id', key);
      if (deleteError) throw deleteError;
      break;

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

export function isNetworkOnline(): boolean {
  return isOnline;
}

// Helper function to perform data operations with offline fallback
export async function withOfflineFallback<T>(
  supabaseOperation: () => Promise<T>,
  offlineOperation: () => Promise<T>,
  fallbackValue: T
): Promise<T> {
  if (!isOnline) {
    try {
      return await offlineOperation();
    } catch (error) {
      console.warn('Offline operation failed:', error);
      return fallbackValue;
    }
  }

  try {
    return await supabaseOperation();
  } catch (error) {
    console.warn('Supabase operation failed, falling back to offline:', error);
    try {
      return await offlineOperation();
    } catch (offlineError) {
      console.warn('Offline fallback failed:', offlineError);
      return fallbackValue;
    }
  }
}