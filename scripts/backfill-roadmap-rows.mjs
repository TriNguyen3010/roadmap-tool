import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

try {
  const { data, error } = await supabase.rpc('backfill_normalized_roadmaps');

  if (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }

  console.log('Normalized roadmap backfill completed.');
  console.log(JSON.stringify(data, null, 2));
} catch (error) {
  console.error('Unexpected backfill error:', error);
  process.exit(1);
}
