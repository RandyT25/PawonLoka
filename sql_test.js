const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await sb.from('orders').select('created_at, total').eq('status', 'Paid');
  if (error) console.error(error);
  // Group by date
  const groups = {};
  for(const r of data) {
    const d = r.created_at.slice(0, 10);
    groups[d] = (groups[d] || 0) + r.total;
  }
  console.log("SQL Equivalent:", groups);
}
run();
