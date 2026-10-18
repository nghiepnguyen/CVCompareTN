import 'dotenv/config';
import { GetBucketCorsCommand, GetBucketLifecycleConfigurationCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSupabaseAdmin } from '../_server-lib/payment/supabaseAdmin.js';
import { bucket, r2Client } from '../_server-lib/storage/r2.js';

const db = getSupabaseAdmin();
const report: Record<string, unknown> = {};
for (const table of ['saved_cvs', 'candidate_cvs']) {
  const result = await db.from(table).select('id,storage_provider,storage_status', { count: 'exact', head: true });
  report[table] = { migrationReady: !result.error, count: result.count, status: result.status, errorCode: result.error?.code };
}
for (const name of ['cv-files', 'cv-analyze-tmp']) {
  const result = await db.storage.getBucket(name);
  report[name] = { reachable: !result.error, public: result.data?.public, fileSizeLimit: result.data?.file_size_limit };
}
const configured = ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_TEMP_BUCKET','R2_CV_BUCKET','STORAGE_CLEANUP_SECRET'].every(k => process.env[k]?.trim());
report.r2Configured = configured;
if (configured) {
  for (const kind of ['temp', 'saved'] as const) {
    const Bucket = bucket(kind); const options = { abortSignal: AbortSignal.timeout(10000) };
    const checks: Record<string, unknown> = {};
    try {
      await r2Client().send(new HeadBucketCommand({ Bucket }), options);
      checks.reachable = true;
    } catch (err) {
      checks.reachable = false;
      checks.error = err instanceof Error ? err.name : 'unknown';
    }
    for (const [name, command] of [
      ['cors', new GetBucketCorsCommand({ Bucket })],
      ['lifecycle', new GetBucketLifecycleConfigurationCommand({ Bucket })],
    ] as const) {
      try {
        const result = await r2Client().send(command, { abortSignal: AbortSignal.timeout(10000) });
        const rules = 'CORSRules' in result ? result.CORSRules : 'Rules' in result ? result.Rules : [];
        checks[name] = { inspectable: true, ruleCount: Array.isArray(rules) ? rules.length : 0 };
      } catch (err) {
        checks[name] = { inspectable: false, error: err instanceof Error ? err.name : 'unknown' };
      }
    }
    report[`r2_${kind}`] = checks;
  }
}
console.log(JSON.stringify(report, null, 2));
