// api/create-checkout-session.js
//
// Ez az endpoint indítja el a Stripe fizetést. A weboldal elküldi ide,
// hogy melyik terméket, melyik variánsban, mekkora árban rendelte a
// vásárló, plusz a design adatokat (image_id, pozíció, méret).
//
// Ezeket az adatokat "metadata"-ként rárakjuk a Stripe Checkout Session-re,
// hogy sikeres fizetés után (a webhook.js-ben) tudjuk, PONTOSAN mit kell
// legyártatnunk a Printify-val.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // CORS: ugyanaz, mint az upload-design.js-ben -- enélkül a böngésző
  // blokkolná a kérést, mert a weboldal és a backend külön domain.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Csak POST kérés engedélyezett' });
  }

  try {
    const {
      productName,      // pl. "Egyedi póló - Fehér, M"
      priceHUF,          // az ár forintban, pl. 8990
      quantity,           // db szám, jellemzően 1
      blueprintId,       // Printify blueprint ID (pl. 6 = Gildan póló)
      printProviderId,    // Printify print provider ID
      variantId,          // a kiválasztott szín+méret Printify variant ID-ja
      imageId,             // a korábban feltöltött design image_id-ja
      imageX,               // kép pozíciója (0-1 közötti relatív érték)
      imageY,
      imageScale,           // kép mérete (relatív skálázás)
      printPosition,          // pl. "front" vagy "back"
    } = req.body;

    if (!priceHUF || !variantId || !imageId) {
      return res.status(400).json({ error: 'Hiányzó adatok a rendeléshez' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'huf',
            product_data: { name: productName || 'DreamPrint egyedi termék' },
            unit_amount: priceHUF * 100, // Stripe a legkisebb pénzegységben várja (fillér)
          },
          quantity: quantity || 1,
        },
      ],
      // Ezt kéri be a Stripe a vásárlótól a fizetés közben -- így nekünk
      // nem kell külön szállítási címet gyűjtő űrlapot építenünk.
      shipping_address_collection: {
        allowed_countries: ['HU', 'AT', 'DE', 'RO', 'SK', 'US', 'GB'],
      },
      // Itt "utaztatjuk át" a design adatokat a sikeres fizetésig.
      metadata: {
        blueprintId: String(blueprintId),
        printProviderId: String(printProviderId),
        variantId: String(variantId),
        imageId: String(imageId),
        imageX: String(imageX),
        imageY: String(imageY),
        imageScale: String(imageScale),
        printPosition: printPosition || 'front',
      },
      success_url: `${process.env.SITE_URL}/sikeres-rendeles?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/megszakitva`,
    });

    return res.status(200).json({ checkoutUrl: session.url });

  } catch (error) {
    console.error('Stripe checkout hiba:', error);
    return res.status(500).json({ error: 'Nem sikerült elindítani a fizetést' });
  }
}
