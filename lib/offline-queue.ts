'use client';
import { get, set, del, keys } from 'idb-keyval';
import imageCompression from 'browser-image-compression';
import { createClient } from './supabase/client';

/** Raport păstrat în IndexedDB până la sincronizare (inclusiv pozele, ca Blob). */
export type QueuedReport = {
  client_uuid: string;
  site_id: string;
  report_date: string;
  hours: number;
  description: string;
  progress: { work_item_id: string; quantity: number; room_label?: string }[];
  materials: { material_id: string; quantity: number; source: 'stoc' | 'santier' | 'cumparat' }[];
  photos: Blob[];
};

const PREFIX = 'report:';

export async function enqueue(r: QueuedReport) {
  // compresie înainte de stocare: ~200–400 KB / poză în loc de 4–8 MB
  const photos = await Promise.all(r.photos.map((p) =>
    imageCompression(p as File, { maxSizeMB: 0.4, maxWidthOrHeight: 1600, useWebWorker: true })));
  await set(PREFIX + r.client_uuid, { ...r, photos });
}

export async function pendingCount() {
  return (await keys()).filter((k) => String(k).startsWith(PREFIX)).length;
}

/** Trimite tot ce e în coadă. Idempotent: serverul ignoră client_uuid deja primite. */
export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  if (!navigator.onLine) return { sent: 0, failed: 0 };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { sent: 0, failed: 0 };

  let sent = 0, failed = 0;
  for (const k of (await keys()).filter((k) => String(k).startsWith(PREFIX))) {
    const r = await get<QueuedReport>(k);
    if (!r) continue;
    try {
      const paths: string[] = [];
      for (const [i, blob] of r.photos.entries()) {
        const path = `${user.id}/${r.client_uuid}/${i}.jpg`;
        const { error } = await supabase.storage.from('report-photos')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (error) throw error;
        paths.push(path);
      }
      const { photos: _, ...payload } = r;
      const { error } = await supabase.rpc('submit_daily_report', { payload: { ...payload, photos: paths } });
      if (error) throw error;
      await del(k);
      sent++;
    } catch (e) {
      console.error('Sincronizare eșuată', e);
      failed++;
    }
  }
  return { sent, failed };
}
