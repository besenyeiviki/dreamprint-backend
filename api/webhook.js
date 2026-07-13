// api/webhook.js
//
// Ez a legfontosabb rész: a Stripe MEGHÍVJA ezt az endpointot minden
// alkalommal, amikor történik valami a fizetéssel kapcsolatban.
// Mi csak arra figyelünk, amikor a fizetés SIKERES volt
// ("checkout.session.completed") -- és EKKOR, csakis ekkor, adjuk le
// a rendelést a Printify-nak.
//
// Ez a biztonságos sorrend: előbb fizetés, utána gyártás. Soha nem
// fordítva.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// A webhook-nak a NYERS (raw) kérés-törzsre van szüksége az aláírás
// ellenőrzéséhez, ezért kikapcsoljuk a Vercel alapértelmezett JSON
// feldolgozását ennél az endpointnál.
export const config = {
  api: { bodyParser: false },
};

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (chunk) => chunks.push(chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const sig = req.headers['stripe-signature'];
  const rawBody = await buffer(req);

  let event;
  try {
    // Ez ellenőrzi, hogy a kérés TÉNYLEG a Stripe-tól jött-e, nem valaki
    // más próbálja-e meg meghamisítani.
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook aláírás-ellenőrzés hiba:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      await createPrintifyOrder(session);
    } catch (error) {
      console.error('Printify rendelés-leadás hiba:', error);
      // Fontos: a Stripe-nak akkor is 200-at küldünk vissza, ha a Printify
      // hívás hibázott, különben a Stripe újra és újra megpróbálja küldeni
      // ugyanazt az eseményt. A hibát külön kell figyelnünk (pl. logban),
      // és kézzel orvosolni.
    }
  }

  return res.status(200).json({ received: true });
}

async function createPrintifyOrder(session) {
  const meta = session.metadata;
  const shipping = session.shipping_details;
  const customer = session.customer_details;

  const orderPayload = {
    external_id: session.id,
    line_items: [
      {
        print_provider_id: Number(meta.printProviderId),
        blueprint_id: Number(meta.blueprintId),
        variant_id: Number(meta.variantId),
        quantity: 1,
        print_areas: {
          [meta.printPosition]: [
            {
              type: 'image',
              id: meta.imageId,
              x: Number(meta.imageX),
              y: Number(meta.imageY),
              scale: Number(meta.imageScale),
              angle: 0,
            },
          ],
        },
      },
    ],
    shipping_method: 1,
    send_shipping_notification: true,
    address_to: {
      first_name: shipping?.name?.split(' ')[0] || 'Vásárló',
      last_name: shipping?.name?.split(' ').slice(1).join(' ') || '',
      email: customer?.email || '',
      phone: customer?.phone || '',
      country: shipping?.address?.country || '',
      region: shipping?.address?.state || '',
      address1: shipping?.address?.line1 || '',
      address2: shipping?.address?.line2 || '',
      city: shipping?.address?.city || '',
      zip: shipping?.address?.postal_code || '',
    },
  };

  const response = await fetch(
    `https://api.printify.com/v1/shops/${process.env.PRINTIFY_SHOP_ID}/orders.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PRINTIFY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Printify rendelés hiba: ${JSON.stringify(data)}`);
  }

  console.log('Printify rendelés sikeresen létrehozva:', data.id);
  return data;
}
