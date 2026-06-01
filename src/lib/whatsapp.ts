// Helper to simulate or execute Meta WhatsApp Business Cloud API messages
export async function sendWhatsAppMessage(to: string, text: string, phoneId: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  console.log(`--- SIMULATED OUTGOING WHATSAPP TO ${to} ---`);
  console.log(text);
  console.log('---------------------------------------------');

  if (!token || token.startsWith('EAAG_reemplazar')) {
    console.log('Meta WhatsApp credentials are not configured or are test tokens. Skipping actual API request.');
    return;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Error response from Meta WhatsApp API: ${response.status} - ${errBody}`);
    } else {
      console.log('Successfully dispatched WhatsApp notification via Meta API.');
    }
  } catch (error) {
    console.error('Failed to send WhatsApp message through Meta API:', error);
  }
}
