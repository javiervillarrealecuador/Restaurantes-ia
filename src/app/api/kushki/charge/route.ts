import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { token, amount, orderId } = await request.json();

    const privateKey = process.env.KUSHKI_PRIVATE_KEY;
    const env = process.env.NEXT_PUBLIC_KUSHKI_ENV || 'uat';
    const baseUrl = env === 'production' 
      ? 'https://api.kushkipagos.com' 
      : 'https://api-uat.kushkipagos.com';

    if (!privateKey) {
      return NextResponse.json({ error: 'Falta la clave privada de Kushki' }, { status: 500 });
    }

    // Petición de cobro (Charge) a Kushki
    const response = await fetch(`${baseUrl}/card/v1/charges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Private-Merchant-Id': privateKey,
      },
      body: JSON.stringify({
        token: token,
        amount: {
          subtotalIva: 0,
          subtotalIva0: amount,
          iva: 0
        },
        metadata: {
          orderId: orderId
        }
      })
    });

    const data = await response.json();

    if (!response.ok || data.status !== 'APPROVED') {
      return NextResponse.json({ 
        error: data.message || 'La transacción no fue aprobada',
        details: data 
      }, { status: 400 });
    }

    // Retornamos la transacción aprobada
    return NextResponse.json({
      success: true,
      ticketNumber: data.ticketNumber,
      transactionId: data.transactionId
    });

  } catch (error: any) {
    console.error('Error en cobro Kushki:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
