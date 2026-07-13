import { supabaseAdmin } from '@/lib/supabase-admin';

export async function startCronRun(cronName: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('cron_runs')
    .insert({ cron_name: cronName, status: 'running' })
    .select('id')
    .single();
  if (error) throw new Error(`cron_runs insert: ${error.message}`);
  return data.id;
}

export async function finishCronRun(
  runId: string,
  result: { itemsProcessed: number; status?: 'success' | 'error'; errorMessage?: string }
) {
  const now = new Date().toISOString();
  // Fetch started_at to compute duration
  const { data: run } = await supabaseAdmin
    .from('cron_runs')
    .select('started_at')
    .eq('id', runId)
    .single();
  const startedAt = run?.started_at ? new Date(run.started_at).getTime() : Date.now();
  const durationMs = Date.now() - startedAt;

  await supabaseAdmin
    .from('cron_runs')
    .update({
      finished_at: now,
      duration_ms: durationMs,
      items_processed: result.itemsProcessed,
      status: result.status || 'success',
      error_message: result.errorMessage || null,
    })
    .eq('id', runId);
}
