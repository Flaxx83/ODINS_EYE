# Räckvidd till fots – första etappen i #9

## Användning

Aktivera **Räckvidd · Till fots** under kartverktygen. Välj start genom kartklick,
koordinater eller adressökning med valbara träffar. Ange en till tre tidsgränser
(1–30 minuter) och gånghastighet (0,5–8 km/h, standard 6). Klicka **Beräkna gångytor**.
Största ytan är cyan, följande gul och orange. Byte av indata rensar tidigare ytor;
avaktivering döljer panel och geometri. Beräkning startar bara på uttryckligt knapptryck.

Första underlaget täcker ett buffrat område kring Skövde. Tillåtna startpunkter:
13,75–13,98° E och 58,34–58,46° N. Start utanför området avslås tydligt.
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
från en redan färdig regional extraktion om tilebygget avbröts. Återuppta inte en
avbruten extraktion. Vägar och refererade noder behålls kompletta; berörda
svängrestriktioner och nodtaggar (t.ex. barriärer) följer med. På Windows får den
packade nativebyggaren en processlokal DLL-sökväg. Systemets PATH ändras inte.

Kontrollera build.log och testa konturerna innan versionen aktiveras. Skapa sedan
`.gev-cache/routing/active.json` med `{"version":"skovde-20261012-v1"}` och starta
Vite. Referensen är serverägd; klienten kan inte välja filer eller extern routing-URL.
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

Större geografisk täckning och underlagsuppdatering, start från sparad POI,
validering av hinder/passager, cykel, bil, separat elsparkcykelprofil och jämförelse
mellan färdsätt. #9 är därför fortfarande pågående. AI- och röstadapter ingår inte
i första gångversionen. NVDB från #24 är valfri senare komplettering.

Källor: [Valhalla](https://github.com/valhalla/valhalla),
[isokron-API](https://valhalla.github.io/valhalla/api/isochrone/),
[Geofabrik Sverige](https://download.geofabrik.de/europe/sweden.html).
Kartytorna visar © OpenStreetMap contributors och ODbL. Underlaget är OSM,
inte ett importerat NVDB-paket.
