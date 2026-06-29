const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load env
const envFile = fs.readFileSync('.env.local', 'utf8');
const envVars = envFile.split('\n').reduce((acc, line) => {
  const [key, ...value] = line.split('=');
  if (key && value.length > 0) acc[key.trim()] = value.join('=').trim();
  return acc;
}, {});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const newItems = [
  { category: 'Postres', name: 'Helado Vaso', description: '', price: 1.00 },
  { category: 'Postres', name: 'Helado choco Bubles', description: '', price: 1.50 },
  { category: 'Postres', name: 'Helado Choco Gum', description: '', price: 1.50 },
  { category: 'Postres', name: 'Helado Copa d’mimos + Pastel', description: '', price: 2.50 },
  { category: 'Postres', name: 'Postre de Fruta Mini fresa', description: '', price: 1.50 },
  { category: 'Postres', name: 'Postre de Fruta Mini durazno', description: '', price: 1.50 },
  { category: 'Postres', name: 'Postre de Fruta Mini Mix fresa y Durazno', description: '', price: 1.50 },
  { category: 'Bebidas', name: 'Horchata', description: '', price: 1.50 },
  { category: 'Bebidas', name: 'Jamaica', description: '', price: 1.50 },
  { category: 'Bebidas', name: 'Agua mineral 500ml', description: '', price: 1.00 },
  { category: 'Bebidas', name: 'Pony Malta 200ml', description: '', price: 0.50 },
  { category: 'Bebidas', name: 'Pony Malta 330ml', description: '', price: 0.75 },
  { category: 'Bebidas', name: 'Gaseosa 300ml', description: '', price: 0.50 }
];

async function addItems() {
  console.log('Buscando restaurante Raízes...');
  const { data: restaurants, error: rErr } = await supabase
    .from('restaurants')
    .select('id')
    .ilike('name', '%Raízes%');
    
  if (rErr || !restaurants || restaurants.length === 0) {
    console.error('Error o no se encontró restaurante Raízes', rErr);
    // If not found by Raizes, maybe use the first restaurant?
    const { data: anyRest } = await supabase.from('restaurants').select('id').limit(1);
    if (!anyRest || anyRest.length === 0) {
      console.log('No restaurants found at all');
      return;
    }
    restaurants.push(anyRest[0]);
  }
  
  const restaurantId = restaurants[0].id;
  console.log('Restaurante ID:', restaurantId);

  // Get categories
  const { data: categories, error: cErr } = await supabase
    .from('menu_categories')
    .select('id, name')
    .eq('restaurant_id', restaurantId);

  let postresCat = categories?.find(c => c.name.toLowerCase() === 'postres');
  let bebidasCat = categories?.find(c => c.name.toLowerCase() === 'bebidas');

  // Create categories if they don't exist
  if (!postresCat) {
    const { data } = await supabase.from('menu_categories').insert({ restaurant_id: restaurantId, name: 'Postres' }).select().single();
    postresCat = data;
  }
  if (!bebidasCat) {
    const { data } = await supabase.from('menu_categories').insert({ restaurant_id: restaurantId, name: 'Bebidas' }).select().single();
    bebidasCat = data;
  }

  const itemsToInsert = newItems.map(item => ({
    category_id: item.category === 'Postres' ? postresCat.id : bebidasCat.id,
    name: item.name,
    description: item.description,
    price: item.price,
    is_available: true
  }));

  const { data, error } = await supabase.from('menu_items').insert(itemsToInsert);
  if (error) {
    console.error('Error insertando items:', error);
  } else {
    console.log('✅ 13 nuevos items agregados correctamente al menú.');
  }
}

addItems();
