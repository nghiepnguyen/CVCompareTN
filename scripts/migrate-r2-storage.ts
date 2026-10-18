import 'dotenv/config';
import { createHash } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSupabaseAdmin } from '../_server-lib/payment/supabaseAdmin.js';
import { bucket, r2Client, readObject } from '../_server-lib/storage/r2.js';
import { checkDb, queueCleanup } from '../_server-lib/storage/handler.js';

const apply = process.argv.includes('--apply');
if (process.argv.includes('--help')) {
  console.log('node --import tsx scripts/migrate-r2-storage.ts [--apply]\nDefault: inventory only. --apply copies and verifies SHA-256, then updates provider; never deletes source.');
} else {
  const db = getSupabaseAdmin();
  let inspected = 0; let copied = 0;
  if (apply) await mkdir('.r2-migration', { recursive: true, mode: 0o700 });
  for (const table of ['saved_cvs', 'candidate_cvs']) {
    // Keyset pagination stays stable while rows leave the Supabase provider set.
    let cursor = '';
    while (true) {
      let query = db.from(table).select('id,file_path,file_size,storage_provider,storage_status').eq('storage_provider', 'supabase').eq('storage_status', 'ready').order('id').limit(100);
      if (cursor) query = query.gt('id', cursor);
      const page = await query; checkDb(page.error);
      if (!page.data?.length) break;
      for (const row of page.data) {
        inspected++; cursor = row.id;
        if (!apply) continue;
        if (!row.file_path || Number(row.file_size) <= 0 || Number(row.file_size) > 50 * 1024 * 1024) throw new Error(`Invalid source metadata: ${table}/${row.id}`);
        // Queue before copy: interrupted runs and concurrent deletion cannot lose the new object.
        await queueCleanup('r2', 'saved', row.file_path, 24 * 3600000);
        const source = await db.storage.from('cv-files').download(row.file_path); checkDb(source.error);
        if (source.data!.size > 50 * 1024 * 1024) throw new Error('Source exceeds migration size limit');
        const bytes = Buffer.from(await source.data!.arrayBuffer());
        if (bytes.length !== Number(row.file_size)) throw new Error(`Source size mismatch: ${table}/${row.id}`);
        const hash = createHash('sha256').update(bytes).digest('hex');
        try {
        await r2Client().send(new PutObjectCommand({ Bucket: bucket('saved'), Key: row.file_path, Body: bytes, IfNoneMatch: '*', ContentType: source.data!.type || 'application/octet-stream' }), { abortSignal: AbortSignal.timeout(45000) });
        } catch (err) {
          if (!(err && typeof err === 'object' && '$metadata' in err && (err.$metadata as { httpStatusCode?: number }).httpStatusCode === 412)) throw err;
          // A resumed copy may already exist; verify it instead of overwriting live data.
        }
        const target = await readObject('saved', row.file_path, 50 * 1024 * 1024);
        if (target.length !== bytes.length || createHash('sha256').update(target).digest('hex') !== hash) throw new Error('R2 copy integrity check failed');
        const changed = await db.from(table).update({ storage_provider: 'r2' }).eq('id', row.id).eq('file_path', row.file_path).eq('storage_provider', 'supabase').eq('storage_status', 'ready').select('id'); checkDb(changed.error);
        if (!changed.data?.length) {
          // A metadata delete/update won the race. The persisted job checks for other live references before deletion.
          await queueCleanup('r2', 'saved', row.file_path);
        } else copied++;
        await appendFile('.r2-migration/manifest.jsonl', JSON.stringify({ table, id: row.id, size: bytes.length, sha256: hash, published: !!changed.data?.length, checkedAt: new Date().toISOString() }) + '\n', { mode: 0o600 });
      }
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'copy-and-verify' : 'inventory', inspected, copied, sourceDeleted: false }));
}
