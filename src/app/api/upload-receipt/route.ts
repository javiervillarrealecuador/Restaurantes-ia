import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const restaurantId = formData.get('restaurant_id') as string | null;
    const orderId = formData.get('order_id') as string | null;

    if (!file || !restaurantId || !orderId) {
      return NextResponse.json(
        { error: 'file, restaurant_id and order_id are required' },
        { status: 400 }
      );
    }

    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `receipts/${restaurantId}/${orderId}_${Date.now()}.${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabaseAdmin.storage
      .from('receipts')
      .upload(fileName, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Receipt upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload receipt' },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('receipts')
      .getPublicUrl(fileName);

    return NextResponse.json({ url: publicUrlData.publicUrl });
  } catch (err) {
    console.error('Upload receipt error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
