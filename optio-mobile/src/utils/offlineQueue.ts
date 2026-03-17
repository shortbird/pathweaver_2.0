/**
 * Offline Journal Queue - Stores pending journal entries when offline.
 *
 * Uses localStorage on web, AsyncStorage-compatible pattern on native.
 * Entries are synced when connectivity is restored.
 */

import { storage } from './storage';
import api from '../services/api';

const QUEUE_KEY = 'offline_journal_queue';

export interface PendingEntry {
  id: string;
  description: string;
  pillars: string[];
  source_type: string;
  created_at: string;
  status: 'pending' | 'syncing' | 'failed';
}

async function getQueue(): Promise<PendingEntry[]> {
  try {
    const raw = await storage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: PendingEntry[]): Promise<void> {
  await storage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function addToQueue(entry: Omit<PendingEntry, 'id' | 'status' | 'created_at'>): Promise<void> {
  const queue = await getQueue();
  queue.push({
    ...entry,
    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    status: 'pending',
  });
  await saveQueue(queue);
}

export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: PendingEntry[] = [];

  for (const entry of queue) {
    try {
      await api.post('/api/learning-events', {
        description: entry.description,
        pillars: entry.pillars,
        source_type: entry.source_type,
        event_date: entry.created_at,
      });
      synced++;
    } catch {
      entry.status = 'failed';
      remaining.push(entry);
      failed++;
    }
  }

  await saveQueue(remaining);
  return { synced, failed };
}

export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}

export async function clearQueue(): Promise<void> {
  await saveQueue([]);
}

export async function getPendingEntries(): Promise<PendingEntry[]> {
  return getQueue();
}
