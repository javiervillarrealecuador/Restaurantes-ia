const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Simple .env.local parser to avoid needing dotenv dependency
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

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const menuData = [
  { categoria: 'Postres', nombre: 'Quesillo & Miel', descripcion: '', precio: 1.50 },
  { categoria: 'Postres', nombre: 'Morocho', descripcion: '', precio: 2.00 },
  { categoria: 'Postres', nombre: 'Piña al Grill', descripcion: 'Piña caramelizada a la parrilla, servida con crema chantilly y helado de la casa.', precio: 2.50 },
  { categoria: 'Bebidas', nombre: 'Jarra de Limonada', descripcion: '', precio: 4.00 },
  { categoria: 'Bebidas', nombre: '1/2 Jarra de Limonada', descripcion: '', precio: 2.00 },
  { categoria: 'Bebidas', nombre: 'Jarra de Naranja', descripcion: '', precio: 5.00 },
  { categoria: 'Bebidas', nombre: 'Jarra de Tamarindo', descripcion: '', precio: 5.00 },
  { categoria: 'Bebidas', nombre: 'Jarra de Maracuyá', descripcion: '', precio: 5.00 },
  { categoria: 'Bebidas', nombre: 'Jarra de Mora', descripcion: '', precio: 5.00 },
  { categoria: 'Bebidas', nombre: '1/2 Jarra de Naranja', descripcion: '', precio: 3.00 },
  { categoria: 'Bebidas', nombre: '1/2 Jarra de Tamarindo', descripcion: '', precio: 3.00 },
  { categoria: 'Bebidas', nombre: '1/2 Jarra de Maracuyá', descripcion: '', precio: 3.00 },
  { categoria: 'Bebidas', nombre: '1/2 Jarra de Mora', descripcion: '', precio: 3.00 },
  { categoria: 'Bebidas', nombre: 'Gaseosa 300 ml', descripcion: '', precio: 1.00 },
  { categoria: 'Bebidas', nombre: 'Gaseosa 1.35 L', descripcion: '', precio: 2.50 },
  { categoria: 'Bebidas', nombre: 'Cerveza Club', descripcion: '', precio: 4.00 },
  { categoria: 'Bebidas', nombre: 'Cerveza Pilsener', descripcion: '', precio: 3.50 },
  { categoria: 'A la Olla', nombre: 'Caldo de Gallina', descripcion: 'Caldo tradicional, acompañado de 1/8 de gallina y papa cocinada.', precio: 4.50 },
  { categoria: 'A la Olla', nombre: 'Sancocho de Gallina', descripcion: 'Sopa espesa con 1/8 de gallina, choclo tierno, yuca, plátano verde cocido, acompañada de arroz y aguacate fresco.', precio: 5.00 },
  { categoria: 'A la Olla', nombre: 'Consomé Caldo de Gallina', descripcion: '', precio: 2.50 },
  { categoria: 'A la Olla', nombre: 'Consomé Sancocho de Gallina', descripcion: '', precio: 2.50 },
  { categoria: 'A fuego lento', nombre: 'Pollo Ahumado', descripcion: '1/4 de pollo ahumado, papas a la francesa y ensalada fresca.', precio: 5.00 },
  { categoria: 'A fuego lento', nombre: 'Gallina Asada', descripcion: 'Jugosa porción de 1/8 de gallina asada al carbón, servido con mote, papa cocinada y ensalada fresca.', precio: 6.00 },
  { categoria: 'A fuego lento', nombre: 'Carne Ahumada', descripcion: 'Filete de cerdo ahumado a la parrilla, servido con mote, papa cocinada y ensalada fresca.', precio: 6.00 },
  { categoria: 'A fuego lento', nombre: 'Costilla al Barril', descripcion: 'Costilla de cerdo al barril, acompañada de papas a elección (francesas o cocinadas), chorizo y ensalada fresca.', precio: 8.00 },
  { categoria: 'A fuego lento', nombre: 'Bandeja Raízes', descripcion: 'Costilla al barril, 1/4 de pollo ahumado, chorizo, papas, choclo, habas, mellocos cocinados, queso y ensalada fresca.', precio: 15.00 },
  { categoria: 'Extras', nombre: 'Mellocos', descripcion: '', precio: 1.50 },
  { categoria: 'Extras', nombre: 'Habas', descripcion: '', precio: 1.50 },
  { categoria: 'Extras', nombre: 'Mix (Melloco y habas)', descripcion: '', precio: 1.50 },
  { categoria: 'Extras', nombre: 'Choclo & Queso', descripcion: '', precio: 2.00 },
  { categoria: 'Raízes', nombre: 'Fritada', descripcion: 'Carne de cerdo acompañada de mote, papa cocinada, maduro frito y tostado.', precio: 5.00 },
  { categoria: 'Raízes', nombre: 'Tortilla Fritada Raízes', descripcion: 'Crujientes tortillas de papa rellenas de queso, carne de cerdo y ensalada fresca.', precio: 6.00 },
  { categoria: 'Raízes', nombre: 'Combo Fritada', descripcion: 'Carne de cerdo, acompañada de papa, choclo, habas, mellocos cocinados, queso y tostado.', precio: 7.00 },
  { categoria: 'Kids', nombre: 'Salchipapa', descripcion: 'Papas fritas crocantes con salchichas, salsas al gusto.', precio: 2.50 }
];

async function run() {
  const { data: restaurants, error: restError } = await supabase.from('restaurants').select('id, name');
  if (restError) { console.error('Error fetching restaurants', restError); return; }
  
  const targetRestaurantId = '7d8cce18-ff5a-4538-b467-83d276bc58f7';
  let restaurant = restaurants.find(r => r.id === targetRestaurantId);
  if (!restaurant) { console.error('No restaurant found in DB'); return; }

  console.log('Using restaurant:', restaurant.name, '(', restaurant.id, ')');

  const { data: existingCategories } = await supabase.from('menu_categories').select('*').eq('restaurant_id', restaurant.id);
  const categoriesMap = {};
  if (existingCategories) {
    existingCategories.forEach(c => categoriesMap[c.name] = c.id);
  }

  for (const item of menuData) {
    let catId = categoriesMap[item.categoria];
    if (!catId) {
      console.log('Creating category:', item.categoria);
      const { data: newCat, error: catError } = await supabase
        .from('menu_categories')
        .insert({ restaurant_id: restaurant.id, name: item.categoria, is_active: true })
        .select()
        .single();
      
      if (catError) {
        console.error('Error creating category:', item.categoria, catError);
        continue;
      }
      catId = newCat.id;
      categoriesMap[item.categoria] = catId;
    }

    // Check if item already exists to avoid duplicates
    const { data: existingItems } = await supabase
      .from('menu_items')
      .select('id')
      .eq('category_id', catId)
      .eq('name', item.nombre);

    if (existingItems && existingItems.length > 0) {
      console.log('Item already exists (skipping):', item.nombre);
      continue;
    }

    console.log('Inserting item:', item.nombre);
    const { error: itemError } = await supabase
      .from('menu_items')
      .insert({
        category_id: catId,
        name: item.nombre,
        description: item.descripcion,
        price: item.precio,
        is_available: true
      });
      
    if (itemError) {
      console.error('Error inserting item', item.nombre, itemError);
    }
  }
  console.log('\n✅ Import completed successfully!');
}

run();
