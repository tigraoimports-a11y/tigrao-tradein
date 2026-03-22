const STORAGE_KEY = "tigrao_offline_queue";

export interface OfflineVenda {
  payload: Record<string, unknown>;
  savedAt: string; // ISO timestamp
}

/**
 * Add a sale to the offline queue in localStorage.
 */
export function addToQueue(payload: Record<string, unknown>): void {
  const queue = getQueue();
  queue.push({ payload, savedAt: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

/**
 * Get all pending sales from the offline queue.
 */
export function getQueue(): OfflineVenda[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineVenda[];
  } catch {
    return [];
  }
}

/**
 * Clear all pending sales from the offline queue.
 */
export function clearQueue(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Remove a single item from the queue by index.
 */
export function removeFromQueue(index: number): void {
  const queue = getQueue();
  if (index >= 0 && index < queue.length) {
    queue.splice(index, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  }
}

/**
 * Get the count of pending items in the queue.
 */
export function getQueueCount(): number {
  return getQueue().length;
}
