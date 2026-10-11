# SL i God's Eye View

Lagret **SL · Livetrafik** ligger under DATA LAYERS och startar avstängt.

1. Skapa ett konto och projekt på https://developer.trafiklab.se/.
2. Begär nyckel för **GTFS Regional Realtime**. För läsbara linjenamn och destinationer behövs även **GTFS Regional Static**.
3. Lägg nycklarna i programmappens `.env` utan att ta bort befintliga inställningar:

```dotenv
TRAFIKLAB_REALTIME_KEY=din_realtidsnyckel
TRAFIKLAB_STATIC_KEY=din_statiska_nyckel
```

Nycklar anges lokalt, inte i chatten. Starta om programmet och aktivera lagret.
Servern håller nycklarna utanför webbläsaren. Static-data sparas lokalt och hämtas högst en gång per dygn. Misslyckade metadataförsök begränsas till en gång per timme.
Positionerna uppdateras varje minut när lagret är på. Detta använder cirka 1 440 realtidsanrop per dygn om programmet används hela dygnet. Bronze-kvoten anges som 30 000 per månad; håll koll på din kvot och stäng av lagret när det inte används.
Fordon med position äldre än fem minuter visas inte. Ingen rörelse simuleras mellan rapporterna. Klicka för fordon, linje, destination och positionstid när uppgifterna finns.
Avgångstavlor och trafikstörningar ingår inte i den här första versionen.
Liveåtkomst återstår att verifiera med din API-nyckel.

Källa och dokumentation: https://www.trafiklab.se/api/gtfs-datasets/gtfs-regional/
Data licensieras enligt CC0 1.0.

## Hållplatser och regiontrafik
Sverige · Hållplatser visar upp till 1 500 hållplatsgrupper nära kartans mitt. Zooma in under cirka 180 km höjd för markörer, eller sök lokalt i panelen. Klicka för en avgångstavla som uppdateras varje minut medan den är öppen. Hållplatsregistret cachelagras ett dygn per serverprocess.
Sverige · Regiontrafik erbjuder Östgötatrafiken, UL, Värmlandstrafik, Skånetrafiken och Jönköpings länstrafik. Endast vald region hämtas. SL ligger kvar som separat lager.
Fordonsuppdateringen är nu varannan minut. Hämtning pausas när sidan är dold. Lokal anropsräkning sparas i .gev-cache/trafiklab-usage.json; gränser per rullande 30 dygn: 29 000 regionala realtidsanrop, 58 statiska anrop och 95 000 avgångs-/hållplatsanrop. Användning av nycklarna i andra program räknas inte här.
Om flera fordonslager eller regioner används behöver den gemensamma kvoten räcka för alla. Vid slut på lokal budget visas ett fel; befintlig statisk metadata behålls. Linjenamn och destinationer kan saknas för vissa fordon.
Avgångstavlor använder TRAFIKLAB_TIMETABLE_KEY från Trafiklab Realtime APIs. Källa Trafiklab.se, CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
