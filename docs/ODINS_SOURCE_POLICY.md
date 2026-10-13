# Källor, villkor och cachepolicy

Granskad 2026-10-12 för issue #7. Avser ODINS tillägg och deras anslutning till den befintliga källförteckningen i [DATA_SOURCES.md](../DATA_SOURCES.md). En datalicens, API-tjänstens användningsvillkor och vår lokala anropsbudget är olika saker. Lokala budgetar är inte leverantörens tilldelade kvot. Ingen källa ger genom denna inventering garanterad tillgänglighet eller fullständig täckning.

## Inventering och källhänvisning

| Källa / faktisk användning | Kontrollerat underlag | Beslut för projektet |
| --- | --- | --- |
| GeoNames: bundlade ortspunkter för ortsmatchning | [GeoNames](https://www.geonames.org/) CC BY 4.0, [exportvillkor](https://www.geonames.org/export/) | Visa GeoNames, licenslänk och att ortsmatchningen är bearbetad. Ingen runtime-användning av GeoNames webbtjänst har identifierats; dess kvot ska inte appliceras på lokala filer. |
| EEA: luftmätningar och stationsmetadata | [EEA legal notice](https://www.eea.europa.eu/en/legal-notice): CC BY för eget material, särskilda villkor kan gälla tredje part | Visa EEA och rapporterande station när källan lämnar uppgiften. Diagram/urval är våra bearbetningar; originalmätningarnas innebörd ska bevaras. Generella EEA-villkor bevisar inte varje stations specifika rättigheter. Metadata för varje datamängd måste följa med vid vidareexport. |
| Trafiklab GTFS Regional: SL/SJ och regionala tidtabeller | [GTFS Regional](https://www.trafiklab.se/api/gtfs-datasets/gtfs-regional/): CC0; statiska filer uppdateras dagligen | Lokal import är tillåten enligt datalicensen. Importdatum och trafikdatum ska hållas isär. Behåll källhänvisning även när CC0 inte kräver den. API-kvot beror på abonnemang. |
| ResRobot: nationella reseförslag | [ResRobot licens](https://www.trafiklab.se/api/our-apis/resrobot-v21/license/): CC0 | Lagra små lokala svarscacher där implementationen stödjer det. Reseförslag är källans tidtabellsunderlag, inte vår garanti för avgång eller ankomst. |
| SL Transport/Journey Planner: direkta SL-API:er | [SL-villkor](https://www.trafiklab.se/api/other-apis/sl/licence/): attribution och produktspecifika tekniska villkor | Överför inte automatiskt GTFS/ResRobots CC0 till alla SL-API:er. Behåll produktnamn och källa. Villkor och tilldelad kvot måste kontrolleras för den produkt som faktiskt aktiveras. |
| Västtrafik: platser, reseplanering och positioner | [Utvecklarportalen](https://developer.vasttrafik.se/) | Källhänvisning införd. Den inloggade produktens aktuella avtal och kvot kunde inte verifieras med publik dokumentation i denna granskning. Ange därför inte CC0 för detta API utifrån Trafiklabs separata VT-feed. Avtalskontroll kvar före bred distribution. |
| Lantmäteriet: Topografi 100/250/1M och beräknat järnvägsnät | [Öppna data](https://www.lantmateriet.se/sv/geodata/vara-produkter/avgiftsfria-produkter/oppna-data/): CC0 | Lokal bearbetning/import; vi visar bara utvalda linjer. Behåll källa och bearbetningsuppgift. Ingen automatisk uppdatering av nedladdade filer finns. Produkt-/leveransmetadata ska sparas vid nästa import. |
| Trafikverket öppna trafikinformations-API | [Registreringsavtal](https://data.trafikverket.se/oauth2/Account/register): CC0 för informationen | Nyckel serverlokal. Källstatus och ålder finns i den strukturerade klienten. Kamerabilder är separata hämtningar; API-datalicensen ska inte användas som ett generellt tillstånd för alla inbäddade bildkällor. |
| Photon / OpenStreetMap: namnsökning | [Photon](https://github.com/komoot/photon): publik demo för måttlig användning; OSM-data ODbL | Kort minnescache, minst en sekund mellan Photon-dispatcher. Ingen masshämtning. Publik demo har ingen SLA. Egen instans eller avtalad leverantör före större distribution. |
| Valhalla / FOSSGIS / OSM: gångväg | [Valhalla-tjänsten](https://valhalla.openstreetmap.de/), [FOSSGIS routingpolicy](https://routing.openstreetmap.de/about.html) | Visa beräknad gångväg, OSM och Fix the map. Konservativt minst 1,1 s mellan avslut och nästa gånganrop. OSRM-policyn är inte bevis på ett specifikt Valhalla-avtal. Långsiktigt eget/avtalat Valhalla, konfigurerbart via VALHALLA_BASE_URL. Ingen produktionskapacitet antas från demon. |
| Radio Browser: stationskatalog | [API-dokumentation](https://docs.radio-browser.info/); befintlig förteckning anger PDDL 1.0 | Projektet använder Radio Browser, inte Radio Garden. Streams spelas direkt från stationerna och omfattas av deras villkor; ljud cachas inte. PDDL-versionen kunde inte bekräftas i den publika sidans renderade innehåll vid denna kontroll: behåll som tidigare dokumenterad uppgift, inte ny verifiering. Vid paketerad katalogexport behövs bekräftad licensmetadata. |
| Esri: satellitbild och transparent ortsnamnslager | [Referenstjänsten](https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer) | Använd live-plattor och tjänstens credits. Ingen egen bulkcache eller offlinepaketering införs. Esri-data omfattas inte av projektets MIT-licens. |

Äldre globala lager har redan separata rader i DATA_SOURCES.md, inklusive icke-kommersiella begränsningar för OpenSky och TeleGeography. Denna etapp omklassificerar inte dessa källor och ger inget generellt klartecken för kommersiell distribution.

## Faktisk cache och lokal budget

Kod är auktoritativ för siffrorna nedan. Minnescacher försvinner vid serveromstart. TTL beskriver när ny hämtning behövs, inte observationsålder eller licensrätt till lagring.

| Funktion | Faktiskt beteende efter denna ändring | Kod |
| --- | --- | --- |
| Gemensam adress-/namnsökning | 10 min, högst 64 kompletta söksvar, 2 aktiva sökningar och 30 nya sökningar/min; identiska anrop samordnas. Partiella svar cachas inte som kompletta. | server/providers/address-search.js |
| Gånggeometri | 24 h minnescache, högst 128 rutter; identiska väntande rutter samordnas; högst 32 väntande olika rutter. Seriell kö med 1,1 s paus efter varje hämtning. Inget stale-svar efter TTL eller fel. | server/providers/walking-geometry.js |
| Trafikverket | 32 cachenycklar / 32 MB, 4 aktiva; lokal budget 60/min och 5 000/dygn. Tågannonser TTL 30 s / maxålder 2 min; kamera TTL 15 min / maxålder 1 h; väder/väglag 5/15 min; tågstationer 1/7 dygn; vägvädermätpunkter med inbäddad observation 5/15 min från #23. Bildens observationstid kontrolleras separat. | server/providers/trafikverket/client.js, models.js |
| Västtrafik | Journey-detaljer 10 min; positioner 60 s. OAuth-token diskcache följer expires_in; cachefiler med token ska aldrig distribueras. | server/providers/vasttrafik.js |
| Trafiklab Timetables | Hållplatsregister 24 h; avgångar 60 s; max 200 cachenycklar. | server/providers/timetables.js |
| Trafiklab lokal anropsräknare | Rullande 30 dygn: regionalStatic 58, regionalRealtime 29 000, timetable 95 000. Räknare sparas lokalt; detta är projektets konfiguration, inte automatiskt rätt nivå för varje användares nyckel. | server/providers/trafiklab-budget.js |
| Polisen | 5 min minnescache; minst 60 s mellan återförsök. Urval upp till källans senaste 500 notiser. | server/providers/polisen.js |
| EEA | Diskcache; ny hämtning efter 1 h. RefreshFailed vid återanvänt svar efter hämtfel. Stationsseriens senaste mätning äldre än 6 h markeras separat i AI-underlaget. Ingen hård maxålder finns för fallback-filen; detta är en kvarstående förbättring. | server/providers/air-quality.js, local-ai-data.js |
| Radio Browser | Katalog 45 min; sista fungerande katalog högst 7 dygn; mirror-lista 6 h. Ingen ljudcache. | server/providers/radio/constants.js |
| GTFS och topografi | Lokala importfiler, ingen schemalagd återimport. Importdatum är inte ett aktualitetslöfte. | scripts/import-gtfs.mjs, docs/ODINS_SETUP.md |

## Gemensamt språk för data

- **Hämtad:** klockslaget då vårt system fick svaret. Det ändras inte vid läsning ur cache.
- **Observerad/rapporterad:** källans mättid, positionsrapport, prognos eller ETA. Fartygs-ETA är rapporterad, inte vår prognos.
- **Cachelagrad:** återanvänt svar inom TTL. Det är inte nödvändigtvis en färsk observation.
- **Gammal / uppdatering misslyckades:** sista fungerande svar återanvänds bara där källans policy och UI stödjer det. Saknad prognos betyder inte i tid.
- **Beräknad:** våra gång-/spårrutter eller sammanställningar. Beräknat spår är inte bekräftat operativt spårval.
- **Saknad / partiell:** otillgänglig källa eller ofullständigt urval. Fågelväg får inte ersätta saknad faktisk resväg som om den vore verifierad.

Detta språk definierar kontraktet; varje äldre lager är inte redan ombyggt till en gemensam statuskomponent. Trafikverket har en strukturerad statusmodell, andra lager har olika UI. Ingen komplett livebild över en stad utlovas.

## Beslut inför räckvidd och distribution

För #9 väljs Valhalla som fortsatt motor för utredning av nätbaserad gång/cykel/bil, med eget eller avtalat endpoint. En publik demo används bara för små interaktiva utvecklingsprov, inte för områdessvep eller produktions-SLA. Elsparkcykel kräver ett separat profil-/regelbeslut; gånghastighet eller cykelprofil är inte automatiskt rätt modell.

VALHALLA_BASE_URL i serverns miljö styr gångruttningens basadress, exempelvis http://127.0.0.1:8002/ för egen lokal instans. Endast serveroperatören konfigurerar URL:en. Körning mot egen server ändrar inte OSM-attribution eller behovet att uppdatera routningsunderlaget. Befintliga OSRM-anrop i Directions använder sin tidigare klient; de delar inte gångruttningens kö. Flera serverprocesser har separata budgetar och kräver gemensam styrning vid distribution.

Före #8/bred drift ska följande verifieras: Västtrafiks aktiva avtal/kvot; radiokatalogens licensmetadata vid export; EEA-stationernas datamängdsvillkor; routingendpoint och kapacitet; GTFS/topografins leveransdatum samt en gräns för gammal EEA-fallback. Ingen API-nyckel, OAuth-token, användaradresscache eller leverantörsplatta ska paketeras i distributionen. Appens korta adresscache är serverminne och rensas vid omstart; ruttkoordinater skickas till routingoperatören.

## Granskning och underhåll

Källhänvisningarna finns i appens Data attribution, lokala paneler och DATA_SOURCES.md. Om produkt/endpoint ändras ska dess villkor kontrolleras på nytt innan rätten till cache eller export antas. Spara produkt, licenslänk, kontrollerat datum, importdatum och bearbetning. Om något inte går att verifiera ska det stå öppet som här, inte fyllas med en antagen fri licens. Issue #7 kan granskas som inventering och kodrättning; kvarstående distributionskontroller ska inte döljas genom att stänga den automatiskt.


## Privata POI (2026-10-13)

Egna namn och anteckningar lagras lokalt i SQLite, utanför cache och Git. Sparning och säkerhetskopiering gör inga externa anrop. Adressökning återanvänder befintlig tjänst; omvänd sökning skickar endast valda koordinater till Photon efter uttryckligt knapptryck. Synlig OSM-attribution, begränsad minnescache och anropsbudget ingår. Se [ODINS_POI.md](ODINS_POI.md).


## Beslut efter NVDB-prov – #24, 2026-10-13

Första räckviddsversionen använder versionsmärkt OSM och egen/avtalad Valhalla. NVDB WMS är inte en routingexport och RoadData-provets län-/vägreferenser är inte geometri. Homogeniserad Lastkajen-export föreslås för en senare separat kompletteringskontroll. Paketens CC0 ändrar inte ODbL för OSM eller behovet av tydlig attribution och licensgranskning vid databaskombination. Se [ODINS_NVDB_ROUTING.md](ODINS_NVDB_ROUTING.md) för källor, verifiering och kvarstående luckor. Publik demo användes endast för tre punkt-till-punkt-prov; inga konturer eller områdessvep.
