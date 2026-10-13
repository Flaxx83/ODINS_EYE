# Installation av ODINS EYE

## Grundinstallation

1. Installera Git, Node.js enligt `package.json` (Node 24.14+ inom 24.x, eller 26.x) och Python 3.11/3.12 för geodatafunktionerna.
2. Klona repositoryt och öppna en terminal i programmappen.
3. Kör `npm ci`.
4. Kopiera `.env.example` till `.env` och fyll i nycklar för de tjänster som ska användas. `.env` ska inte versionshanteras.
5. Skapa en lokal Pythonmiljö och installera geodataberoendena:

```powershell
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-geo.txt
```

På Linux/macOS används `python3 -m venv .venv` och `.venv/bin/python -m pip install -r requirements-geo.txt`.

Alla Pythonjobb använder samma val: **GEV_PYTHON** om angiven, annars projektets **.venv**, annars Windows `py -3` eller `python3` på andra system. `GEV_PYTHON` ska vara sökvägen till en exekverbar fil, utan argument eller omslutande citationstecken i värdet. Ett felaktigt explicit val ersätts inte tyst med en annan Pythonmiljö. Den befintliga utvecklingsdatorns särskilda Python-sökväg finns endast i dess ignorerade `.env`.

Kör `npm run doctor:odins` för en översikt över beroenden, cache och vilka nycklar som är konfigurerade. Den hämtar inga data och skriver inga nyckelvärden. `-- --strict` ger felkod när något saknas, inklusive valfria komponenter. `npm run doctor` är originalprojektets separata kontroll.

## Miljövariabler

- `TRAFIKLAB_REALTIME_KEY`: regionala GTFS-realtidsflöden.
- `TRAFIKLAB_STATIC_KEY`: regional GTFS-static (SL och SJ).
- `TRAFIKLAB_TIMETABLE_KEY`: nationella hållplatser och avgångar.
- `RESROBOT_API_KEY`: nationell reseplanering.
- `VASTTRAFIK_CLIENT_ID`, `VASTTRAFIK_CLIENT_SECRET`: Västtrafik OAuth.
- `GEV_PYTHON`: valfritt explicit Pythonval för EEA, järnvägsruttning, importer och taligenkänning.

API-nycklarna är separata produkter. Konfigurera endast dem du vill använda. SL:s automatiska metadatahämtning räcker inte som installation av SJ och Lantmäteriets järnvägsnät.

## Importera SL och SJ

Stoppa appens server innan du ersätter data. Starta om servern efter import så att metadata i minnet laddas om.

Importera redan hämtade regionala GTFS ZIP-filer offline:

```powershell
npm run import:gtfs -- --operator sl --zip 'D:\Data\sl.zip'
npm run import:gtfs -- --operator sj --zip 'D:\Data\sj.zip'
```

Kommandona återskapar `.gev-cache/sl-metadata.json`, `.gev-cache/sl-shapes/` respektive `.gev-cache/sj-geometry.json`. SL-importen inkluderar destinationsnamn från sista hållplatsen där headsign saknas. SJ-importen inkluderar trafikdatum och datumundantag. Shapes-filen krävs. Data ska vara aktuella för resans trafikdatum.

Alternativt görs en uttrycklig hämtning med `TRAFIKLAB_STATIC_KEY` från `.env`:

```powershell
npm run import:gtfs -- --operator sl --download
npm run import:gtfs -- --operator sj --download
```

Varje `--download` använder ett anrop ur regional static-kvoten. Ingen nyckel ska anges som kommandoradsargument. Lokal ZIP-import använder ingen kvot. För felsökning kan `--cache-dir work/test-cache` användas utan att ersätta appens data. Efter import: starta om servern så att metadata i minnet laddas om. Se även `SL-INSTALLATION.md` för liveflöden och villkor.

## Importera Lantmäteriets topografi och järnvägsgraf

Ladda ned Topografi 100, 250 och 1M, vektor som ZIP-exporter i **SWEREF 99 TM (EPSG:3006)**. Använd de kompletta exporterna med tematiska ZIP-filer och GeoPackage inuti. Ange din egen filplats:

```powershell
npm run import:topography -- --scale 1m --zip 'D:\Data\Topografi 1M Nedladdning, vektor.zip'
npm run import:topography -- --scale 250 --zip 'D:\Data\Topografi_250_Nedladdning_vektor.zip'
npm run import:topography -- --scale 100 --zip 'D:\Data\Topografi_100_Nedladdning_vektor.zip'
npm run import:rail -- --gpkg 'work/topography/100-kommunikation.gpkg'
```

Importören konverterar utvalda linjeteman (administrativa gränser, vägar, järnvägar, färjeleder och hydrografi) till WGS84 och tvågradersplattor i `.gev-cache/topography/<skala>/<tema>/`. Hela GeoPackage-exportens alla objekttyper visas alltså inte. `--theme kommunikation` begränsar en import; flaggan kan upprepas. `--extract-dir` och `--cache-dir` kan användas för alternativa arbets- och målkataloger. Data för alla tre skalor behövs eftersom kartan byter skala vid zoomning.

Varje tema skrivs först till en separat stagingkatalog; en misslyckad import ersätter inte tidigare färdiga plattor. Manifest redovisar skala, tema och antal objekt. Importen kan köras om från samma arkiv. Extraherade GeoPackage sparas i `work/topography/` som underlag för järnvägsgrafen. Rail-kommandot kräver alltid en explicit `--gpkg`, och stöder valfri `--output`.

Räkna med flera GB ledigt lagringsutrymme och betydande RAM vid Topografi 100-importen; den samlar plattornas objekt i minnet. Välj en tematik åt gången på en dator med mindre minne. Laserdatan ingår inte i dessa importer. Järnvägsgrafen är ett beräkningsunderlag, inte bekräftelse på ett tågs operativa spårval.

## Lokal AI och valfri röst

Bionic Local Model API kör på `http://127.0.0.1:1235/v1` med modellen `qwen3.5-4b`. Starta modellen/servern i Bionic. Ingen OpenAI-nyckel behövs för den lokala panelen. Bionicmodellen laddas ned separat via Bionic.

För lokal taligenkänning behövs även:

```powershell
.venv\Scripts\python.exe -m pip install -r requirements-voice.txt
npm run model:whisper
```

Whisper base laddas då uttryckligen ned till `.gev-cache/whisper`. Appens transkribering laddar inte automatiskt ned modeller. Uppläsning använder en installerad svensk systemröst när sådan finns. Originalets separata Realtime-röst använder OpenAI API och kräver egen API-åtkomst/fakturering.

## Start och verifiering

```powershell
npm run doctor:odins
npm run test:setup
npm run test:imports
npm run build
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

Öppna `http://127.0.0.1:4173`. Installationsproven använder syntetisk GTFS, tomma cachekataloger och Pythonval utan riktiga API-nycklar. `test:imports` kräver geodataberoenden och provar riktiga ZIP/GeoPackage-strukturer, koordinatkonvertering, omimport, felaktigt koordinatsystem och grafbygge utan externa data. EEA hämtar aktuell luftdata på begäran; installerade geodataberoenden krävs.

Saknad SL/SJ-geometri ska inte stoppa reseplaneringen. Kartförslaget visar ändpunkter, saknade resvägar och vilket importkommando som behövs. Saknade topografiplattor ger ett tydligt installationsfel i stället för en till synes tom datakälla. En järnvägsgraf utan matchbar förbindelse lämnar sträckan utan linje.

`.gev-cache/`, `.venv/`, `work/`, nycklar, inspelningar och lokala modeller skickas inte till GitHub. Dessa importer gör cache återskapningsbar; spara originalarkiven separat. Egna POI och deras beständiga databas planeras i #10 och är ännu inte implementerade.

## Drift

Kör lokalt på loopback. Internet krävs för livedata och externa rese-/gångruttningstjänster. Publicering av servern på internet är inte förberedd. Gångruttning använder FOSSGIS offentliga Valhalla-demo med cache och sekventiella anrop; bredare distribution kräver en genomgång enligt #7. Geometri och tidtabeller behöver importeras på nytt när underlaget ändras; `doctor:odins` kontrollerar närvaro, inte fullständighet eller aktualitet för varje datafil.

### Trafikverkets vägkameror

Sätt `TRAFIKVERKET_API_KEY` i den lokala `.env` (utan `VITE_`-prefix) och starta om utvecklingsservern. Aktivera Data Layers → Cameras och välj Sverige i CCTV-panelens kameralista. `CCTV_TRAFIKVERKET_ENABLED=0` stänger av källan. Servern använder Camera schema 1 och cachar den gemensamma katalogen; bilder hämtas separat via serverns befintliga bildproxy. Bild tagen visar källans PhotoTime. Bilderna är stillbilder och globala katalogtak kan begränsa antalet svenska kameror, se ändringsloggen. Lägg aldrig en riktig nyckel i dokumentation, screenshots av appens inställningar eller Git.

### Trafikverkets API-grund

Kamerorna använder den gemensamma serverklienten. `TRAFIKVERKET_DAILY_REQUEST_BUDGET` sätter ett lokalt, minnesbaserat tak för XML-anrop (standard 5 000 per UTC-dygn; 0 stoppar nya anrop). Bildhämtning har separat CCTV-policy. `GET /api/trafikverket/status` visar säker lokal diagnostik utan nyckel eller frågevärden och utan att hämta upstreamdata. Se [API-guiden](ODINS_TRAFIKVERKET.md) för modellversioner, cache, backoff och begränsningar.

Gångruttningens endpoint kan konfigureras serverlokalt med `VALHALLA_BASE_URL=http://127.0.0.1:8002/` för en egen Valhalla-instans. Standardvärdet är utvecklingsdemon. Se [källpolicy](ODINS_SOURCE_POLICY.md) innan bred drift eller räckviddsberäkningar.

### Lokal räckvidd till fots

Valfri Valhalla/Pythonmiljö och daterad regional PBF: [ODINS_REACHABILITY.md](ODINS_REACHABILITY.md). Det lokala isokronverktyget använder inga publika demoanrop.
