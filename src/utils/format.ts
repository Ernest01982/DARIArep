/**
 * Format a number as South African Rand currency
 */
export function currencyZAR(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format(amount);
}

/**
 * Format a date string to a readable format
 */
export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(dateString));
}

/**
 * Format a date string to include time
 */
export function formatDateTime(dateString: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(dateString));
}

/**
 * Format a number with thousands separators
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-ZA').format(num);
}

/**
 * Format a percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}