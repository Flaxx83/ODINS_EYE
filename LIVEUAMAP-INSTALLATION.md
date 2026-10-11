# Liveuamap

Lokalt händelselager i DATA LAYERS: Liveuamap · Events.
Klicka på en orange markör för rubrik, tid och källänkar.
Lagret startar avstängt och kräver en egen API-nyckel.

1. Skaffa API-åtkomst via https://me.liveuamap.com/devapi#yourapikey. Prislistan på https://liveuamap.com/promo/api anger 150 USD/månad och 200 anrop/dag (kontrollerad 2026-10-11).
2. Lägg följande i programmappens `.env` (skapa filen om den saknas):

```dotenv
LIVEUAMAP_API_KEY=din_personliga_nyckel
LIVEUAMAP_REGION_ID=0
```

Region 0 är Ukraina enligt leverantörens kodexempel. Kontrollera aktuella region-ID:n med leverantören.
Nyckeln ska anges lokalt, inte skickas i chatten. `.env` är utesluten från Git.
Starta om programmet efter ändringen. Aktivera sedan lagret i DATA LAYERS.
Upp till 100 händelser hämtas och cachelagras i tio minuter. Avstängt lager gör inga nya anrop.
Frontlinjer och områdespolygoner ingår inte i denna första integration.
API-kontraktet bygger på Liveuamaps officiella C#-exempel:
https://github.com/liveuamap/liveuamap.consolecsharp.api
Liveåtkomst är inte verifierad utan personlig nyckel; format eller åtkomst kan ha ändrats.

