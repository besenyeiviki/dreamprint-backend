// api/upload-design.js
//
// Ez az endpoint fogadja a vásárló feltöltött képét (base64 formában a
// weboldalról), és feltölti a Printify média-könyvtárába. Cserébe kapunk
// egy image_id-t, amit a rendelés leadásakor fogunk használni.
//
// Miért kell ez a lépés? Mert a Printify rendelés-leadáskor nem fogad el
// nyers képfájlt közvetlenül -- előbb fel kell tölteni a rendszerükbe,
// és az onnan kapott ID-t kell hivatkozni.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Csak POST kérés engedélyezett' });
  }

  try {
    const { imageBase64, fileName } = req.body;

    if (!imageBase64 || !fileName) {
      return res.status(400).json({ error: 'Hiányzik a kép vagy a fájlnév' });
    }

    // A base64 stringből eltávolítjuk az esetleges "data:image/png;base64," előtagot,
    // mert a Printify csak a nyers base64 adatot várja.
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const printifyResponse = await fetch(
      'https://api.printify.com/v1/uploads/images.json',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PRINTIFY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_name: fileName,
          contents: base64Data,
        }),
      }
    );

    const data = await printifyResponse.json();

    if (!printifyResponse.ok) {
      console.error('Printify upload hiba:', data);
      return res.status(502).json({ error: 'Nem sikerült feltölteni a képet a Printify-nak', details: data });
    }

    // A data.id lesz az image_id, amit a rendelésnél fogunk használni.
    return res.status(200).json({ imageId: data.id });

  } catch (error) {
    console.error('Szerver hiba a kép feltöltésekor:', error);
    return res.status(500).json({ error: 'Szerver hiba történt' });
  }
}
