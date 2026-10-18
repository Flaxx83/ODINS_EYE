# Räckvidd – fyra färdsätt – #9

## Användning

Aktivera **Räckvidd** under kartverktygen. Välj start genom kartklick,
koordinater, sparad POI eller adressökning med valbara träffar. Ange en till tre tidsgränser
(1–30 minuter) och gånghastighet (0,5–8 km/h, standard 6). Klicka **Beräkna räckvidd**.
Gång visas i cerise, cykel i blått, bil i orange och elsparkcykel i lila. Byte av indata rensar tidigare ytor;
avaktivering döljer panel och geometri. Beräkning startar bara på uttryckligt knapptryck.

Aktivt underlag omfattar hela Sverige genom hela Geofabriks Sverige-PBF,
utan ytterligare regional klippning. Tekniska startgränser: 10,5–24,5° E och
55,0–69,3° N. De omsluter Sverige; de är ingen exakt landpolygon.
En gångbar länk måste ändå finnas inom 100 m. Panelen visar aktuell täckning från servern. Start utanför området avslås tydligt.
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

## Hela Sverige – 2026-10-13

Version `sweden-20261012-v1` använder hela den daterade Sverige-PBF:en med samma
kontrollsumma som ovan. Ingen ytterligare läns- eller kommungräns används för
importen. 2 309 489 väglänkar med highway/ferry-taggar och 5 739
restriktionsrelationer; totalt 10 421 430 OSM-vägar, inklusive annan kartgeometri.
Native tilebygge tog 252 sekunder, totalt 309,5 sekunder inklusive kopiering och
statistik på utvecklingsdatorn. Ingen ny nedladdning behövdes för denna utökning.

```powershell
.venv/Scripts/python.exe scripts/build-routing-region.py .gev-cache/routing/source/sweden-261012.osm.pbf .gev-cache/routing/sweden-20261012-v1 --whole-source --bbox 9,54,26,70 --coverage 10.5,55,24.5,69.3 --name "Hela Sverige"
.venv/Scripts/python.exe scripts/qa-walking-barriers.py
.venv/Scripts/python.exe scripts/activate-routing-region.py sweden-20261012-v1 --samples scripts/fixtures/routing-sweden-samples.json
```

`--whole-source` bevarar PBF:en byte för byte. Byggläget ingår i färdigmarkeringen
så återupptagning inte kan växla mellan hel källa och regionalt klipp.
Aktiveringsproven kör samma Pythonjobb som API:t, inklusive kontrollen av
anslutningen till gångnätet. Provpunkterna är offentliga platser och sträcker sig
från Smygehuk och Malmö till Kiruna och Abisko, med Gotland och Öland.

Landextraktet kan sakna fortsättningen av gångvägar över landsgränsen. Panelen
visar därför en gränsnotis både vid underlagsstatus och efter beräkning. Ett helt
Sverigeunderlag betyder tillgång till det svenska OSM-nätet, inte en garanti för
att varje verklig gångväg är registrerad eller att rutterna utanför Sverige är
kompletta. Gränsöverskridande områden kräver senare grannlandsdata.

Utökningen gäller gångytorna. Cykel, bil och elsparkcykel är fortfarande egna
kommande etapper i #9.

Nationell referenskontroll använder Osmiums inbyggda nodpositionsindex och
validerar referenser på samtliga vägar direkt i C++-hanteraren, utan Pythonloopar
över råfilens noder eller vägnoder.
Ett kontrollerat prov med saknad nod avvisas före aktivering. Detta undviker
att bygga en separat stor Pythonmängd av alla råfilens nod-ID:n.

Nationell aktivering passerade på alla 14 provplatser för 5/15/30 minuter.
API-prov i Stockholm, Visby och Luleå samt verkligt webbläsarprov med Kirunas
gångytor, Hela Sverige-status, gränsnotis och mobilbredd passerade.
186 integrationstester och 14 riktade katalog-/server-/etikettprov passerade.
Native bygge/återupptagning, hela PBF-innehållet och avvisning av saknad nod
verifierades separat. Produktionsbygge och paketgränser passerade.

## Cykel och jämförelse – 2026-10-16

Välj **Till fots**, **På cykel** eller **Jämför gång och cykel**. Stadscykel har
18 km/h som justerbar grundhastighet (5–35 km/h i appen). Gång har fortsatt
6 km/h som standard (0,5–8). Samma nationella nät och tidsgränser 1–30 minuter
används; ingen ny kartimport behövs. Gång visas vit/grå, cykel blå/cyan.
Jämförelsen använder samma valda start och tidsgränser men varje färdsätt får
en egen tillåten nätanslutning inom 100 m. Båda beräkningarna måste lyckas
innan jämförelsen ritas. Ändrade indata eller färdsätt rensar tidigare ytor.

API:t accepterar `mode: "walk"` eller `mode: "bicycle"`. Utelämnat mode behåller
gång för äldre klienter. Cacheposter skiljer på färdsätt även vid identisk hastighet.
Pythonjobbet använder `bicycle`, `bicycle_type: city` och `cycling_speed`; även
kontrollen av startens nätanslutning använder den valda profilen.
Jämförelsen gör två seriella lokala anrop och omfattas av samma beräkningsbudget.

Hastigheten avser jämnt plant underlag, inte garanterad medelhastighet över hela
området. Cykelmodellens vägtyp, underlag och preferenser påverkar räckvidden.
Sverigeunderlaget saknar separat höjddata; väder, trafik och pauser ingår inte.
Modellen kan innefatta att bära/leda cykeln, exempelvis i trappor, med motorns
kostnader. OSM-åtkomst och konturernas interpolation har samma begränsningar som
för gång. Bil och elsparkcykel samt AI/röstadapter återstår.

Nativeprov kan köras med:

```powershell
.venv/Scripts/python.exe scripts/qa-cycling-reachability.py
```

Kontrollerade nät verifierar cykelväg i båda riktningar, omväg vid `bicycle=no`,
enkelriktning för cykel med fortsatt gång i motsatt riktning samt undantaget
`oneway:bicycle=no`. Genvägen blev 0,595 km och omvägen 2,821 km. Pythonjobbet
returnerade gång- och cykelkonturer separat. Riktiga Sverigeprov i Skövde gav
5/10/15-minutersytor för båda profilerna. Webbläsarprovet verifierade jämförelse,
rensning vid färdsättsbyte, mobilbredd och avaktivering.

Modellreferens: [Valhallas cykelprofil](https://valhalla.github.io/valhalla/api/route/api-reference/#bicycle-costing-options).

Jämförelse avvisas om underlagsversionen byts mellan de två anropen. Resultatets
kompakta sammanfattning visar färdsätt/tider/hastighet/färg. Full proveniens och
modellbegränsningar finns under **Antaganden och källor**. Hastighetsfält för det
färdsätt som inte används döljs.

## Bil och elsparkcykel (2026-10-16)

Bil använder Valhalla auto med statiska väghastigheter, tillträde, enkelriktning och
svängrestriktioner. Hastighetstaket kan ställas till 10–120 km/h (standard 120).
Köer, aktuella avstängningar, parkering och tidsberoende regler ingår inte.

Elsparkcykel är en uppskattning på cykelnätet med stadscykelmodell och
avoid_bad_surfaces=1. Plan hastighet 5–20 km/h, standard 20. Cykelklassat fordon
avses (högst 20 km/h och 250 W). Specifika elsparkcykelförbud, batteri, höjd,
väder och pauser ingår inte. Profilen är inte motorns mopedprofil.

Samma Sverigeunderlag används för alla fyra färdsätten. Nätanslutning krävs inom
100 m; tiden dit ingår inte. Jämförelsen finns fortsatt för gång och cykel.
Native QA kontrollerar bilförbud, cykelvägar, enkelriktning, cykelundantag samt
konturer för alla fyra profiler. API-tester kontrollerar gränser och separat cache.

Källor:
- https://github.com/valhalla/valhalla/blob/3.9.1/docs/docs/api/route/api-reference.md
- https://www.transportstyrelsen.se/elsparkcykel

Synlighet: mättade färger, 42 % opacitet och separata terrängföljande konturlinjer. Kortare tidsgränser har mörkare färgton.


## 2026-10-16 – AI-frågor om räckvidd

Frågor som ”Hur långt kommer jag till fots på 10 minuter från Henriksbergsgatan
3B i Skövde?” behandlas nu som räckvidd med en startplats, inte en gångresa med
start och mål. Gemensam adressökning ger valbara alternativ när träffen är oklar.
Knappen **Visa räckvidd på kartan** öppnar verktyget och beräknar valt område.
Gång/cykel/bil/elsparkcykel stöds med sina standardantaganden, hel minut 1–30.
Frågan måste ange färdsätt, minuter och start efter ”från”; detta är en avgränsad
serverstyrd tolkning, inte stöd för alla fria formuleringar eller följdfrågor.
Inga koordinater hämtas från modellens fria svar. Validerade platsval är bundna
till samtalet. Tidigare vanlig gångruttning är kvar.

Verifierat: 192 integrationstester, bygge/modulgränser och verkligt browserflöde
med adressval och en 10-minuterspolygon. Ingen merge utförd.


### Återkoppling från AI-knappen

AI-knappen väntar nu på beräkningen, visar pågående status och därefter resultat
eller fel i AI-panelen. Kartkameran ramas in med konturernas koordinater i stället
för att vänta på bounding spheres för terrängföljande linjer. Vid jämförelse
omsluter ramen båda resultaten. Verkligt browserprov: Nyckelpigevägen 62 i Skövde,
30 minuter cykel, adressval, en polygon och förflyttad kamera passerar.

### Färgförklaring

Panelen visar en färgruta och Inom N min för varje beräknad tidsgräns, grupperat
per färdsätt vid jämförelse. Färgerna hämtas från kartans konturpalett. Vid flera
tider förklaras att kortare tid är mörkare och att områdena är inneslutna.
Förklaringen rensas när indata ändras eller en ny beräkning påbörjas.


### Flera tidsgränser via AI

Uttryckliga räckviddsfrågor accepterar 1–3 olika hela minuter mellan 1 och 30,
exempelvis ”till fots från Lillegårdsvägen 11A i Skövde till fots på 5, 10, 15 minuter”.
Separera med komma och mellanslag, semikolon eller ”och”. Upprepat färdsätt efter
adressen tas bort före platsuppslag. Alla gränser överförs till panelen.

Räckviddsfrågor och deras platsval använder en separat sessionsbudget på 20/minut;
språkmodellflödet behåller 6/minut. Den globala gränsen på 20/minut och samtidighets-
skyddet finns kvar. Beräkningsmotorns egna gränser är oförändrade.

## Valbar jämförelse av fyra färdsätt – 2026-10-18

**Jämför färdsätt** ersätter det fasta gång/cykelvalet. Välj minst två av gång,
cykel, bil och elsparkcykel. Gång/cykel är förvalda. Start och 1–3 tidsgränser
är gemensamma; hastigheten anges per valt färdsätt. Två till fyra seriella
anrop använder den befintliga beräkningsbudgeten (10 nya beräkningar/minut).
Alla svar måste lyckas och ha samma underlagsversion innan några ytor visas.

Färgförklaringens kryssrutor döljer/visar både ytor och gränslinjer för varje
färdsätt utan nya anrop. Startmarkören finns kvar. Ändrade beräkningsindata
rensar resultatet; ändrade visningsval behåller det. Modeller, källdata och
profilernas begränsningar är oförändrade. AI väljer fortfarande ett färdsätt.

Browserprov: `node scripts/qa-reachability-comparison.mjs` med lokal server
på port 4173 och installerat svenskt routingunderlag. Provet omfattar fyra
riktiga profiler, synlighet, versionsbyte, fel, minsta urval och mobilvy.
