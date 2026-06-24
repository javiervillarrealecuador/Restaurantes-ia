export async function sendWhatsAppMessage(to: string, text: string, phoneId: string, customToken?: string) {
  const token = customToken || process.env.WHATSAPP_ACCESS_TOKEN;

  console.log(`--- SIMULATED OUTGOING WHATSAPP TO ${to} ---`);
  console.log(text);
  console.log('---------------------------------------------');

  if (!token || token.startsWith('EAAG_reemplazar') || to === '593987654322') {
    console.log('Meta WhatsApp credentials are not configured, test tokens, or simulator number used. Skipping actual API request.');
    return;
  }

  // Meta WhatsApp API has a limit of 4096 characters per message.
  // We split messages longer than 4000 characters into multiple parts.
  const MAX_LENGTH = 4000;
  const chunks = [];
  
  if (text.length <= MAX_LENGTH) {
    chunks.push(text);
  } else {
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_LENGTH) {
        chunks.push(remaining);
        break;
      }
      
      // Try to split at a newline to avoid breaking words/sentences
      let splitIndex = remaining.lastIndexOf('\n', MAX_LENGTH);
      if (splitIndex === -1) {
        splitIndex = MAX_LENGTH;
      }
      
      chunks.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex).trimStart();
    }
  }

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
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
            text: { body: chunk },
          }),
        }
      );

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`Error response from Meta WhatsApp API (chunk ${index + 1}/${chunks.length}): ${response.status} - ${errBody}`);
        throw new Error(`Meta API Error: ${errBody}`);
      } else {
        console.log(`Successfully dispatched WhatsApp notification via Meta API (chunk ${index + 1}/${chunks.length}).`);
      }
    } catch (error: any) {
      console.error(`Failed to send WhatsApp message through Meta API (chunk ${index + 1}/${chunks.length}):`, error);
      throw error;
    }
  }
}

// Helper to send "typing..." state to the WhatsApp customer
export async function sendWhatsAppTypingIndicator(phoneId: string, messageId: string, customToken?: string) {
  const token = customToken || process.env.WHATSAPP_ACCESS_TOKEN;

  console.log(`--- SENDING TYPING INDICATOR FOR MESSAGE ${messageId} ---`);

  if (!token || token.startsWith('EAAG_reemplazar')) {
    console.log('Meta WhatsApp credentials are not configured or are test tokens. Skipping typing indicator.');
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
          status: 'read',
          message_id: messageId,
          typing_indicator: {
            type: 'text',
          },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Error response from Meta WhatsApp API (typing indicator): ${response.status} - ${errBody}`);
    } else {
      console.log(`Successfully dispatched WhatsApp typing indicator.`);
    }
  } catch (error: any) {
    console.error(`Failed to send WhatsApp typing indicator:`, error);
  }
}

