import { supabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';

const ALERT_THRESHOLD_MS = 270000;
const ADMIN_EMAIL = 'issayamiyoussouf@gmail.com';

async function sendCronAlert(cronName: string, durationMs: number) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const seconds = (durationMs / 1000).toFixed(1);
    await resend.emails.send({
      from: 'Woorri Alerts <no-reply@woorri.com>',
      to: ADMIN_EMAIL,
      subject: `\u26a0\ufe0f Cron ${cronName} slow: ${seconds}s`,
      html: `<p>Le cron <strong>${cronName}</strong> a pris <strong>${seconds}s</strong> (seuil: ${ALERT_THRESHOLD_MS / 1000}s).</p><p>Pensez \u00e0 optimiser ou passer au plan Pro (300s).</p>`,
    });
  } catch (e) {
    console.error('Cron alert email failed:', e);
  }
}

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
  const { data: run } = await supabaseAdmin
    .from('cron_runs')
    .select('started_at, cron_name')
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

  if (durationMs > ALERT_THRESHOLD_MS && (result.status || 'success') !== 'error') {
    const cronName = run?.cron_name || 'unknown';
    const { data: recent } = await supabaseAdmin
      .from('cron_runs')
      .select('id')
      .eq('cron_name', cronName)
      .gt('duration_ms', ALERT_THRESHOLD_MS)
      .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(3);
    if (!recent || recent.length <= 1) {
      await sendCronAlert(cronName, durationMs);
    }
  }
}
