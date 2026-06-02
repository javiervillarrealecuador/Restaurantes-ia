import { NextResponse } from 'next/server';

export async function GET() {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  if (!deepseekKey) {
    return NextResponse.json({ 
      error: 'La variable DEEPSEEK_API_KEY no existe en Vercel. Asegúrate de haberla creado y de haber hecho un Redeploy.' 
    });
  }

  try {
    const url = 'https://api.deepseek.com/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: 'Di hola en JSON: {"mensaje": "hola"}' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ 
        error: `DeepSeek devolvió un error (Código ${response.status}): ${errText}` 
      });
    }

    const resJson = await response.json();
    return NextResponse.json({ 
      exito: true, 
      mensaje: 'DeepSeek respondió correctamente.',
      respuesta: resJson.choices?.[0]?.message?.content 
    });

  } catch (error: any) {
    return NextResponse.json({ error: `Fallo de red: ${error.message}` });
  }
}
