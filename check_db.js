const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const envVars = envFile.split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    acc[match[1]] = match[2].trim();
  }
  return acc;
}, {});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: restaurants, error: restError } = await supabase.from('restaurants').select('id, name, slug');
  if (restError) { console.error('Error fetching restaurants', restError); return; }
  
  console.log("=== RESTAURANTS IN DB ===");
  restaurants.forEach(r => {
    console.log(`- ${r.name} (Slug: ${r.slug}, ID: ${r.id})`);
  });

  const { data: categories } = await supabase.from('menu_categories').select('id, name, restaurant_id');
  console.log("\n=== CATEGORIES IN DB ===");
  categories.forEach(c => {
    console.log(`- ${c.name} (RestID: ${c.restaurant_id})`);
  });

  const { data: items } = await supabase.from('menu_items').select('id, name, category_id');
  console.log("\n=== ITEMS IN DB ===");
  console.log(`Total items: ${items.length}`);
}

run();
