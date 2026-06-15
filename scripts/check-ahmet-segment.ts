import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { computeSegmentIcp } from '../lib/scoring-buckets';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await sb
    .from('leads')
    .select('title, company, score, enrichment_data')
    .eq('id', '00978e13-416c-46e4-8ef7-50b8775dc9c5')
    .single();

  if (error) {
    console.error('ERR:', error);
    return;
  }

  const ed = data.enrichment_data as any;
  console.log('=== AHMET ===');
  console.log('Title:', data.title);
  console.log('Company:', data.company);
  console.log('Score:', data.score);
  console.log('');
  console.log('=== COMPANY (enrichment) ===');
  console.log(JSON.stringify(ed?.company, null, 2));
  console.log('');
  console.log('=== Computed segment (via scoring-buckets) ===');
  const segment = computeSegmentIcp(data.title, ed);
  console.log('->', segment);
}

main().catch(console.error);
