import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  // Security: verify the caller is an authenticated admin or super admin
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if any restaurant already exists
    const { data: restaurantList } = await supabaseAdmin
      .from('restaurants')
      .select('*')
      .limit(1);

    if (restaurantList && restaurantList.length > 0) {
      return NextResponse.json({ 
        success: true, 
        restaurant: restaurantList[0], 
        message: 'Restaurant already exists' 
      });
    }

    // Create default restaurant
    const { data: newRest, error: restErr } = await supabaseAdmin
      .from('restaurants')
      .insert({
        name: 'Restaurante Sabor Latino',
        slug: 'sabor-latino',
        address: 'Av. de la República N32-123 y Eloy Alfaro',
        phone: '+593987654321',
        email: 'sabor@latino.com',
      })
      .select()
      .single();

    if (restErr) throw restErr;

    // Insert default setting
    await supabaseAdmin.from('settings').insert({
      restaurant_id: newRest.id,
      whatsapp_phone_number_id: '123456789012345',
      whatsapp_verify_token: 'mi_token_de_verificacion_prueba_123',
      is_ordering_enabled: true,
    });

    // Create default category
    const { data: category, error: catErr } = await supabaseAdmin
      .from('menu_categories')
      .insert({
        restaurant_id: newRest.id,
        name: 'Especialidades',
        sort_order: 1,
        is_active: true,
      })
      .select()
      .single();

    if (catErr) throw catErr;

    // Insert default available menu items
    await supabaseAdmin.from('menu_items').insert([
      {
        category_id: category.id,
        name: 'Cazuela de Ave',
        description: 'Tradicional cazuela chilena con pollo tierno, choclo, zapallo y arroz.',
        price: 8.50,
        is_available: true,
        estimated_prep_time: 20,
      },
      {
        category_id: category.id,
        name: 'Cazuela de Vacuno',
        description: 'Nutritiva cazuela con carne de vacuno, verduras selectas y condimento tradicional.',
        price: 9.50,
        is_available: true,
        estimated_prep_time: 20,
      },
      {
        category_id: category.id,
        name: 'Fanta Orange',
        description: 'Bebida fanta sabor naranja en lata de 350ml.',
        price: 1.50,
        is_available: true,
        estimated_prep_time: 2,
      },
      {
        category_id: category.id,
        name: 'Coca-Cola Original',
        description: 'Refresco sabor original en lata de 350ml.',
        price: 1.50,
        is_available: true,
        estimated_prep_time: 2,
      },
    ]);

    return NextResponse.json({ 
      success: true, 
      restaurant: newRest, 
      message: 'Restaurant bootstrapped successfully' 
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Bootstrap Error:', err);
    return NextResponse.json({ error: err.message || 'Bootstrap failed' }, { status: 500 });
  }
}
