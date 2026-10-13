# Egna POI och beständig lagring

Issue #10. Implementerat för granskning på `codex/persistent-pois`; ännu inte sammanfogat med main.

## Användning

Aktivera **Egna POI · Sparade platser** i Data Layers. Panelen använder kartans befintliga designspråk och kan minimeras.

1. Välj **Ny plats**, ange namn och koordinater, eller använd **Sök platser** för adress-/namnsökning. Välj rätt träff i listan.
2. **Välj position på kartan** tar positionen från kartklick. Om höjddata saknas används jordellipsoiden och det anges i panelen. Klick som inte träffar jordytan ger ett förtydligande.
3. Ange adress och anteckningar och tryck **Spara plats**. Saknad adress visas som **Uppgift saknas**. Koordinater är WGS84 och kan kopieras med sex decimaler; antalet decimaler är inte en noggrannhetsgaranti.
4. Klicka på en sparad plats i listan eller dess kartmarkering för att redigera den. Listval flyttar också kameran dit. Ändrade koordinater rensar gammal adress; anteckningar behålls. Kontrollera adressen och spara flytten.
5. **Ta bort plats** kräver bekräftelse. Avstängt POI-lager döljer markeringar och panel utan att radera sparad data.

Osparade formulärändringar ligger kvar vid av-/påslag i samma appsession. Ny plats/listval kräver bekräftelse om formuläret har ändrats. Osparade ändringar överlever inte en omladdning; använd Spara plats för beständig lagring. En gammal redigeringsvy kan inte skriva över en senare sparning: servern kontrollerar `updatedAt` och ber användaren öppna platsen igen.

## Adressuppslag och integritet

Adress-/namnsökningen återanvänder den gemensamma söktjänsten. **Hämta adress vid koordinater** gör ett explicit omvänt uppslag via Photon. Bara koordinater skickas i det uppslaget; namn och anteckningar stannar i den lokala databasen. Förslaget kan vara en närliggande adress och måste kontrolleras, särskilt efter flytt. Otillgänglig källa eller saknad adress hindrar inte manuell sparning.

Photon/OSM har synlig attribution i panelen. Omvända uppslag begränsas till ett aktivt anrop och minst 1,1 sekund mellan starter, med 128 cacheposter i 24 timmar och tio sekunders tidsgräns. `ODINS_PHOTON_URL` kan byta server. Publika demotjänsten saknar tillgänglighetsgaranti och är avsedd för måttlig användning; se [Photon](https://github.com/komoot/photon). Ingen bakgrunds- eller massgeokodning görs.

## Databas, backup och återställning

Windows standardplats: `%LOCALAPPDATA%\ODINS_EYE\data\pois.sqlite`. Annan plattform utan LOCALAPPDATA: `~/.local/share/ODINS_EYE/data/pois.sqlite`. `ODINS_POI_DB` kan ange en annan fil. Databasen ligger utanför appens cache och Git-spårade filer; SQLite-filer och automatiska återställningskopior ignoreras även om en egen sökväg placeras i projektet.

SQLite lagrar stabilt UUID, namn, latitud, longitud, adress, anteckningar samt skapad-/ändrad-tid i UTC. Schemat migreras med `PRAGMA user_version` (första versionen: 1); en databas med nyare version öppnas inte för ändring. SQL-värden parametriseras. Namn max 140 tecken, adress 500, anteckningar 10 000. Högst 10 000 platser och 12 MB normaliserade JSON-data stöds i första versionen, så att appens export också kan återställas inom HTTP-gränsen.

**Säkerhetskopiera** laddar ned en versionsmärkt JSON-fil. Filen innehåller privata anteckningar; välj själv var den sparas. **Återställ säkerhetskopia** kräver filval och uttrycklig bekräftelse och ersätter alla egna POI. Servern validerar hela filen och sparar först en automatisk kopia i `backups/before-restore-<UUID>.json` bredvid databasen. Återställningen är en SQLite-transaktion; fel lämnar tidigare data kvar. Den automatiska kopian kan återställas genom samma filval. Kopior sparas tills användaren själv tar bort dem.

Webbläsardata/cache-rensning raderar inte POI. Ingen automatisk överföring till GitHub, modell eller molnlagring görs. SQLite-filen är lokal lagring; kontoåtkomst och kryptering ingår inte i denna lokala version. HTTP-API använder appens befintliga skydd mot anrop från andra webbplatser och `Cache-Control: no-store`.

## API och verifiering

`GET/POST /api/pois`, `GET/PUT/DELETE /api/pois/<UUID>`, `GET /api/pois/backup`, `POST /api/pois/restore` och `GET /api/pois/reverse?lat=...&lon=...`. Listning kan avgränsas med `bbox=west,south,east,north`. Uppdatering kräver tidigare `updatedAt`; återställning kräver `confirm: "REPLACE"`. Lokal hantering av privata POI ingår inte i delningslänkar eller röstverktyg.

Serverprov täcker omöppnad databas, flytt och anteckningar, gammal redigering, radering, bbox, backup/återställning, ogiltig återställning utan dataförlust, HTTP-validering och avvisade anrop från annan webbplats. Webbläsarprov med separat testplats i den riktiga appen täcker skapande, sparning, av-/påslag, återöppning, koordinatändring, anteckningar som text och panelens bredd på desktop/mobil. Testplatsen tas bort efter kontrollen. Ett riktigt omvänt adressuppslag vid ett offentligt torg returnerade adressförslag. Full terrängnoggrannhet eller alla leverantörers adressdata är inte verifierade av dessa prov.

Kategorier, färgval, GeoJSON-import/export och koppling till AI eller räckviddsanalys är senare tillägg.
