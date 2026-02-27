import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side only client (uses service_role key — never expose to client)
export const supabase = createClient(supabaseUrl, supabaseServiceKey);
