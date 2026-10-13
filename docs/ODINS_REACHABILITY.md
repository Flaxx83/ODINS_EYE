# Räckvidd till fots – första etappen i #9

## Användning

Aktivera **Räckvidd · Till fots** under kartverktygen. Välj start genom kartklick,
koordinater, sparad POI eller adressökning med valbara träffar. Ange en till tre tidsgränser
(1–30 minuter) och gånghastighet (0,5–8 km/h, standard 6). Klicka **Beräkna gångytor**.
Största ytan är cyan, följande gul och orange. Byte av indata rensar tidigare ytor;
avaktivering döljer panel och geometri. Beräkning startar bara på uttryckligt knapptryck.

Aktivt underlag täcker Västra Götaland med omnejd som ett rektangulärt område,
inte en administrativ länsgräns. Tillåtna startpunkter: 10,95–14,75° E och
57,05–59,35° N. Panelen visar aktuell täckning från servern. Start utanför området avslås tydligt.
Det är gångytor längs OSM-nätet, inte cirklar eller garanterad individuell räckvidd.
Höjd/lutning, väder, pauser och personlig förmåga modelleras inte i denna etapp.
OSM kan sakna gångvägar eller tillträdesuppgifter. Konturer är interpolerade
uppskattningar av routingkostnader, inte exakta fastighets- eller passagegränser.

## Lokal installation

Python 3.12+ och projektets Pythonmiljö krävs. Valhalla körs genom Pythonbindningen;
Docker och publik demo behövs inte. Paket och rådata är valfria och inte versionshanterade.

```powershell
.venv/Scripts/python.exe -m pip install -r requirements-routing.txt
# Hämta ett daterat regionalt PBF från Geofabrik till .gev-cache/routing/source/.
.venv/Scripts/python.exe scripts/build-routing-region.py .gev-cache/routing/source/sweden-261012.osm.pbf .gev-cache/routing/skovde-20261012-v1
```

Scriptet bygger aldrig över en befintlig version. `--resume` återupptar tilebygget
från en redan färdig regional extraktion om tilebygget avbröts. Återupptagning kräver en färdigmarkering med matchande källkontrollsumma och bbox;
avbruten extraktion eller annan PBF avvisas. Vägar och refererade noder behålls kompletta; berörda
svängrestriktioner och nodtaggar (t.ex. barriärer) följer med. På Windows får den
packade nativebyggaren en processlokal DLL-sökväg. Systemets PATH ändras inte.

Kontrollera build.log och aktivera med scriptet i uppdateringsavsnittet nedan.
Aktiv referens ligger i `.gev-cache/routing/active.json`. Referensen är serverägd; klienten kan inte välja filer eller extern routing-URL.
GET `/api/reachability` visar tillgänglighet och proveniens. POST tar endast
`lat`, `lon`, `minutes` och `speed`. Saknad motor/data ger tydligt fel, ingen cirkelfallback.

## Underlag och kontroll 2026-10-13

- Geofabrik `sweden-261012.osm.pbf`, 889 889 971 byte; headerdatum
  2026-10-12T20:21:35Z. SHA256:
  `67e280090ac7e1a545fc4257b95a821527330dd4cc258366526a079826cd1809`.
- Buffert 13,55–14,18° E / 58,24–58,55° N. Extrakt 1 905 181 byte,
  25 314 vägar inklusive referenser och 55 restriktionsrelationer.
- pyvalhalla 3.9.1; native tilebygge cirka 7 sekunder efter extraktion.
  Sverigeextraktionen tar längre tid och kräver minne för nodpositioner.
- Native prov från Skövde centrum (58,3897 / 13,8457) gav slutna polygoner
  för 5, 10 och 15 minuter vid 6 km/h.
- Servern tillåter en samtidig beräkning, 30 sekunders timeout, max 3 MB svar,
  högst 10 nya beräkningar per minut, 50 000 konturpunkter och 32 lyckade cacheposter i 10 minuter.
  Ofullständiga konturer och konturer utanför bufferten avslås. Fel cachas inte.
- UI/API-prover och enhetstester dokumenteras i PR:en. Nativepaketet/PBF installeras
  separat; vanliga CI-tester använder kontrollerade fixtures, ingen publik isokrontjänst.

## Återstår i #9

Ytterligare geografisk täckning och validering av verkliga hinder/passager, cykel, bil, separat elsparkcykelprofil och jämförelse
mellan färdsätt. #9 är därför fortfarande pågående. AI- och röstadapter ingår inte
i första gångversionen. NVDB från #24 är valfri senare komplettering.

Källor: [Valhalla](https://github.com/valhalla/valhalla),
[isokron-API](https://valhalla.github.io/valhalla/api/isochrone/),
[Geofabrik Sverige](https://download.geofabrik.de/europe/sweden.html).
Kartytorna visar © OpenStreetMap contributors och ODbL. Underlaget är OSM,
inte ett importerat NVDB-paket.

## Utökning och uppdatering 2026-10-13

Ny version `vastra-gotaland-20261012-v1`: 645 409 kompletta vägar inklusive
referenser, 1 852 restriktionsrelationer och 63 448 699 byte extrakt. Samma daterade
Sverige-PBF som ovan. Buffert 10,7–15,0° E / 56,8–59,6° N. Bygge inklusive
extraktion tog 238 sekunder; native tilebygge 61 sekunder på utvecklingsdatorn.

Deterministiska nativeprover: saknad passage (vattenmodell), separat järnväg utan
implicit anslutning, motorväg `foot=no` och grindnod `access=no` tvingade alla fram
2,821 km omväg i stället för genvägen. Detta verifierar små kontrollerade nät,
inte varje faktisk passage i länet. En färgad polygon är interpolerad och kan
fortfarande omfatta vatten eller hinder mellan gångbara länkar. Panelen säger detta
uttryckligen. Start måste ligga högst 100 m från en gångbar länk.

```powershell
# Vid uppdatering: hämta en ny daterad Geofabrik-PBF till source/.
# Använd en ny versionskatalog. Ersätt datum och versionsnamn nedan.
.venv/Scripts/python.exe scripts/build-routing-region.py .gev-cache/routing/source/sweden-261012.osm.pbf .gev-cache/routing/vastra-gotaland-20261012-v1 --bbox 10.7,56.8,15.0,59.6 --coverage 10.95,57.05,14.75,59.35 --name "Västra Götaland med omnejd"
.venv/Scripts/python.exe scripts/qa-walking-barriers.py
.venv/Scripts/python.exe scripts/activate-routing-region.py vastra-gotaland-20261012-v1 --sample 58.3897,13.8457 --sample 57.7089,11.9746 --sample 58.3498,11.9356 --sample 57.721,12.94
```

Aktivering kontrollerar nodreferenser och 5/15/30-minuterskonturer i valda orter.
Äldre data än aktiv version avvisas. Förra referensen sparas i
`active.previous.json`; `active.json` byts atomiskt först efter lyckade prov.
Misslyckat bygge eller prov lämnar aktiv version kvar. Återställ genom att kopiera
föregående referens till active.json. Servern läser referensen per anrop och
cachenyckeln innehåller version. Uppdatering är manuell; ingen bakgrundsnedladdning
eller schemalagd körning har lagts till.

**Välj sparad POI** hämtar lokala SQLite-punkter på uttryckligt knapptryck och visar
valbara namn/adresser. Endast vald koordinat används till lokal beräkning;
anteckningar skickas inte till routingmotorn eller adressökningen. Aktivering
återställer gamla ytor, så nya standardvärden inte visas med föregående geometri.

Anslutning till gångnätet kontrolleras separat med `locate`; start utan gångbar länk
inom 100 m avvisas (verifierat mitt i Vänern). Ytornas tidsbudget räknas från
närmaste gånglänk. Anslutningsavstånd visas och tillträde från vald punkt till
länken måste kontrolleras; anslutningsgång ingår inte i tiden.
