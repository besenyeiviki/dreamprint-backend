# DreamPrint backend

Ez a kis szerver-oldali kód köti össze a weboldaladat a Stripe fizetéssel
és a Printify gyártással. Három fájl csinálja a munkát:

1. **`api/upload-design.js`** -- a vásárló feltöltött képét elküldi a
   Printify-nak, és visszaad egy `imageId`-t.
2. **`api/create-checkout-session.js`** -- elindítja a Stripe fizetést, és
   "rácsomagolja" a design-adatokat a fizetésre.
3. **`api/webhook.js`** -- amikor a Stripe jelzi, hogy a fizetés sikeres
   volt, ez adja le a tényleges rendelést a Printify-nak.

## A teljes folyamat (mi történik egy vásárlásnál)

```
Vásárló feltölti a képét
        ↓
  upload-design.js → Printify → visszakapjuk az imageId-t
        ↓
Vásárló rákattint "Megrendelés"-re
        ↓
  create-checkout-session.js → Stripe fizetési oldal megnyílik
        ↓
Vásárló fizet
        ↓
  Stripe meghívja a webhook.js-t
        ↓
  webhook.js → Printify → a rendelés legyártásra kerül
```

## Hogyan told fel élesbe (Vercel)

1. **Told fel ezt a mappát egy GitHub repository-ba.** Ez most egy kicsit
   más, mint az `index.html`-nél volt, mert itt egy egész mappa van
   almappával (`api/`), nem egyetlen fájl:
   - Hozz létre egy új repository-t (pl. `dreamprint-backend` néven)
   - Töltsd le a gépedre az összes fájlt ebből a projektből, és rendezd
     el ugyanabban a mappaszerkezetben, ahogy itt látod (`api/` almappa
     a három `.js` fájllal, mellette a `package.json`, `.env.example`,
     `README.md`)
   - A GitHub repository oldalán "uploading an existing file" → húzd rá
     az egész mappát (a GitHub kezeli az almappákat is). Ha ez nem
     működne, fájlonként is feltöltheted -- írd a fájlnév elé, hogy
     `api/webhook.js`, és a GitHub automatikusan létrehozza az `api`
     almappát.

2. **Vercelben importáld ezt a repository-t** külön projektként (vagy ha
   a weboldaladdal egy repóban van, a Vercel automatikusan felismeri az
   `api/` mappát, és serverless function-ként hosztolja).

3. **Add meg a titkos kulcsokat a Vercelben** -- SOHA ne írd bele őket a
   kódba. Vercel projekt → Settings → Environment Variables, és add hozzá
   egyenként:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET` (ezt a Stripe webhook beállításánál kapod meg,
     lásd lentebb)
   - `PRINTIFY_API_TOKEN`
   - `PRINTIFY_SHOP_ID` (a tiéd: `28196869`)
   - `SITE_URL` (a végleges weboldalad címe)

4. **Állítsd be a Stripe webhookot**, hogy tudja, hova küldje az
   értesítést sikeres fizetésről:
   - Stripe Dashboard → Developers → Webhooks → "Add endpoint"
   - URL: `https://a-te-domained.vercel.app/api/webhook`
   - Esemény, amire feliratkozol: `checkout.session.completed`
   - Ez ad neked egy "Signing secret"-et (`whsec_...`) -- ezt másold be a
     `STRIPE_WEBHOOK_SECRET` környezeti változóba.

## Mit kell még a weboldal (frontend) oldalán megcsinálni

A jelenlegi `index.html`-ben a "Megrendelés" gomb most még csak egy
figyelmeztető ablakot dob fel. Ezt kell lecserélni egy olyan kódra, ami:

1. Meghívja az `/api/upload-design` endpointot a feltöltött képpel
2. A kapott `imageId`-vel meghívja a `/api/create-checkout-session`
   endpointot
3. Átirányítja a vásárlót a kapott `checkoutUrl`-re (ez a Stripe
   fizetési oldala)

Ezt a következő lépésben kötjük össze a tényleges terméktervező
felülettel, amikor a katalógus (kész minták + saját tervezés) UI is
elkészül.

## Fontos, mielőtt élesbe mész

- Amíg a Stripe kulcsaid `sk_test_...` / `pk_test_...` formátumúak,
  **valós pénz nem mozog** -- ez a teszt módod.
- Éleshez a Stripe fiókodnak be kell fejeznie a céges/egyéni vállalkozói
  adatok ellenőrzését (ezt a Stripe Dashboard vezet végig).
- Vállalkozási forma (egyéni vállalkozó / cég) szükséges Magyarországon,
  mielőtt ténylegesen bevételt fogadsz el -- ezt érdemes könyvelővel vagy
  a NAV-val egyeztetni.
