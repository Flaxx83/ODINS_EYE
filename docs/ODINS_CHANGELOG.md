# Ändringslogg för ODINS EYE

## 2026-10-11

De senaste ändringarna finns i sex öppna pull requests. De körs i den lokala utvecklingsversionen men är ännu inte sammanfogade med `main`. Tabellen anger respektive avgränsning; verifiering gäller de angivna proverna.

| Ändring                       | Innehåll                                                                                                                                                                                                                         | Issue                        | Pull request                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------- |
| Installation och dataimport   | Gemensamt Pythonval via GEV_PYTHON/.venv/system-Python, geodata- och röstberoenden, SL/SJ ZIP-import, Lantmäteriet-topografi, järnvägsgraf, valfri Whispernedladdning, installationskontroll och tydliga fel vid saknad geometri | #2                           | [#11](https://github.com/Flaxx83/ODINS_EYE/pull/11) |
| AI-panelens design            | Rundad glasbakgrund, gemensamma designvariabler, kort introduktion, tydligt trafiknätsval, grupperade knappar, svar och reseförslag, tangentbordsfokus och mobil layout                                                          | Del av gränssnittet kring #1 | [#12](https://github.com/Flaxx83/ODINS_EYE/pull/12) |
| Svenska resefrågor            | Hela timmar som vid 07 tiden, validering av felaktiga tider, nästa kalenderdag i Stockholm och normalisering av inklistrade radbrytningar/NBSP/osynliga tecken                                                                   | Del av #4                    | [#13](https://github.com/Flaxx83/ODINS_EYE/pull/13) |
| AI vid Location               | Knapp till vänster om Location, panel ovanför dockan, minimering/återöppning med bibehållen text och svar, Escape och städning vid avaktivering                                                                                  | Del av gränssnittet kring #1 | [#14](https://github.com/Flaxx83/ODINS_EYE/pull/14) |
| Fartygskort                   | Namn, typ, fart/kurs, destination, rapporterad ETA, navigationsstatus, positionsrapportens ålder, MMSI/IMO och Visa senaste spår; saknade värden redovisas                                                                       | #15                          | [#16](https://github.com/Flaxx83/ODINS_EYE/pull/16) |
| AI-dockans slutliga placering | 160 px knapp på rymliga skärmar som växer åt vänster utan att flytta Location; panelens högerkant i linje med Locations högerkant; begränsad utökning på smala skärmar                                                           | Del av gränssnittet kring #1 | [#17](https://github.com/Flaxx83/ODINS_EYE/pull/17) |

### Verifiering

- Installation: fem offlineprover passerade på Windows och Linux från rena GitHub-kloner. Riktiga SL/SJ-arkiv och de tre utvalda Topografi 1M-temana importerades till separata provkataloger. Återskapad järnvägsgraf fick identisk kontrollsumma.
- Reseparsning: fem regressionstester passerade. Den faktiska AI-panelen provades med Göteborg central–Vällingby T-bana, även med radbrytning i T-bana, och gav tre förslag med sökt avgång kl 07:00 nästa dag.
- AI-design: desktop- och mobilkontroll av den ursprungliga paneldesignen, minimering, återöppning och formulärinlämning med simulerat svar. Dockans slutliga bredd och kantlinjer mättes i användarens öppna app.
- Fartyg: 27 riktade tester passerade. Layout, stängning och meddelande om för få spårpunkter provades med tydligt märkt testdata. Live AIS-flöde var tillgängligt, men ett fullständigt liveprov av kartklicket är ännu inte verifierat.
- Produktionsbygget passerade efter ändringarna. Dessa resultat betyder inte att samtliga bredare CI-kontroller är gröna.

### Begränsningar och fortsatt arbete

- #1 återstår för validerade AI-verktygsanrop och samtalskontext; paneldesignen löser inte den funktionella AI-integrationen.
- #4 återstår för önskad ankomsttid och bredare datum-/följdfrågetolkning.
- Fartygens ETA är rapporterad AIS-uppgift i UTC, utan påhittat år. Åldersfältet avser positionsrapporten, inte en garanti att samtliga statiska uppgifter är lika färska. Foto och prognostiserad rutt ingår inte. Senaste spår är insamlat under serversessionen.
- Full omimport av Topografi 100/250 och installation på en annan fysisk dator är inte verifierade på nytt.
- Tidigare formaterings- och paketgränsproblem i bredare CI följs upp i #6.

### Granskning och sammanfogning

PR:erna är staplade och bygger på föregående gren: **#11 → #12 → #13 → #14 → #16 → #17**. Granska och sammanfoga i denna ordning; kontrollera respektive basgren efter sammanfogning. Stäng inte #1 eller #4 enbart för dessa gränssnitts-/parserändringar. #2 och #15 har implementationer som inväntar granskning.

Se [status](ODINS_STATUS.md), [installation](ODINS_SETUP.md) och [roadmap](ODINS_ROADMAP.md) för detaljer.

## Svenska vägkameror (2026-10-11)

Trafikverkets `Camera`-API (schema 1) matar nu det befintliga Cameras/CCTV-lagret. Använd **Data Layers → Cameras**, öppna **CCTV** och välj **Sverige · kameranamn**. Bildproxy, kartposition och befintliga kamerakontroller återanvänds. Panelen visar Trafikverket, kameratyp och **Bild tagen** i svensk tid. Tidsstämpeln är katalogens `PhotoTime`, inte tidpunkten då webbläsaren laddade bilden.

API-nyckeln ligger bara i den ignorerade lokala `.env` som `TRAFIKVERKET_API_KEY`. Ingen nyckel eller extern bildadress skickas i klientens kamerakatalog. `CCTV_TRAFIKVERKET_ENABLED=0` stänger av leverantören. En egen fil-/miljökatalog kan enligt befintlig policy ersätta livekatalogerna.

Liveprov: **1 548** aktiva kameror hämtades; katalogtaket **4 000** gav **485** svenska kameror efter fördelning mellan samtliga leverantörer. Taket innebär att kartan inte är en fullständig nationell inventering. `trimmedPacks` redovisar bortvalda kameror. `CCTV_MAX_SOURCES` kan justeras upp till befintligt tak 5 000, men garanterar inte alla svenska kameror. Uppdaterade stillbilder hämtas via servern; ingen videoström utlovas. Kamerornas fältvinkel, monteringshöjd och räckvidd är uppskattade och markeras RAW PRIOR. Källa: [Trafikverkets öppna API](https://www.trafikverket.se/e-tjanster/trafikverkets-oppna-api-for-trafikinformation/).

Validering: fem leverantörstester passerade, produktionsbygget passerade, verklig JPEG hämtades med HTTP 200 via appens bildproxy. Liveprovet i gränssnittet visade Falutorget Norra, Trafikverket, kameratyp, tidsstämpel och SNAPSHOT OK. Implementationen spåras i [issue #18](https://github.com/Flaxx83/ODINS_EYE/issues/18) och bygger vidare på PR #17. Bredare tidigare CI-begränsningar gäller fortfarande.

## Trafikverksplan och arbetsordning (2026-10-11)

Fem nya planeringsissues #20–#24 är tillagda i projekt 3: API-grund, tåginformation, väghändelser, vägväder och NVDB-utredning. De har prioritet, tidsintervall, Estimate, acceptanskriterier och GitHub-beroenden. Roadmappen omfattar nu 15 kärnuppgifter och ersätter tidigare sekvens och kalenderfönster. Befintliga issuebeskrivningar och projektets Ordning har samordnats. NVDB-utredning #24 blockerar räckviddsarbetet #9 tills ett datakälls-/routingbeslut finns; beslutet kan även bli att använda OSM utan NVDB. Ingen ny dataintegration implementeras inom planeringsändringen.

## Stabil testgrund (2026-10-11)

Issue #6 och PR #26 samlar offlineintegrationstester och reparation av befintliga CI-kontrakt. Unit discovery inkluderar serverfiler. Windows/Linux-gaten täcker resa, datum, trafikstatus, AI-källkontext, kameror och kartgeometri. Lokala karttexter använder gemensamt overlay-lager; AI-panelens CSS kan importeras av browsern utan att bryta Node-moduler. Formatteringen av lokala runtimefiler ligger i en separat commit. Se [testguiden](ODINS_TESTING.md) och issue #6 för verifieringsresultat och aktuell CI-status. Den generella AI-verktygsloopen tillhör fortsatt #1.

## Gemensam Trafikverksklient (2026-10-11)

Issue #20 inför serverklient med validerade XML-frågor, begränsade svar, samordnade anrop, cache, backoff och lokal anropsbudget. Kamerorna återanvänder klienten och visar katalogens staleness/begränsning. Observationstid och hämtningstid hålls isär. Sex modellversioner accepterades i begränsade liveprover; störningsmodellerna TrainMessage/Situation kräver ytterligare verifiering i #21/#22. Inga nya tågsvar eller väghändelselager levereras här. Se [API-guiden](ODINS_TRAFIKVERKET.md) för verifierade versioner och policies, och issue #20 för slutliga provresultat.

## Trafikverket: tågstatus i reseförslag (#21)

Befintliga resor kompletteras med källmärkt tågstatus: planerad/beräknad/faktisk tid, inställning, spår och avvikelser. Matchning kräver station, annonserat nummer, aktivitet och tid; tvetydiga och framtida statusar blir uttryckligen okända. Se [matchningspolicy, begränsningar och verifiering](ODINS_TRAIN_STATUS.md). Separata TrainMessage-meddelanden ingår inte; rapporterade Deviation-fält används när de finns.

## Trafikläge: täckning och unika avgångar (2026-10-12)

Issue #5: trafiksvaret räknar unika hållplatsavgångar med korrekt identitet och skiljer försening, tidig avgång, inställt och okänd prognos. Samma tur vid olika hållplatser försvinner inte längre i dedupliceringen. Västtrafiks explicita hållplatsprognoser används; SL:s tidtabellsfallback är inte realtid. Urval, 60-minutersfönster, centrum, hämtfel, gamla/begränsade tavlor och konflikter redovisas. Trafiklab-cacheträffar bevarar uppströmshämtningens tid. Se [täckning och verifiering](ODINS_TRAFFIC_COVERAGE.md).

## Resefrågor: ankomsttid och datum (2026-10-12)

#4: gemensam kalender- och tidsvalidering för Västtrafik, SL och Hela Sverige, riktiga ankomstsökningar, bevarat trafiknätsval, svensk lokal tid och förtydliganden för ogiltiga/tvetydiga uppgifter. Exakt adressmatchning för 11A/11 A och datum som bevaras vid platsval. Följdfrågor kräver hela resvägen tills #1 ger samtalskontext. Se [reseindata](ODINS_TRAVEL_INPUT.md).

## Järnvägsgeometri och diagnostik (2026-10-12)

#3: stationer kopplas till segment i nätet, osäkra omvägar/återkörningar avvisas och varje saknad sträcka får en orsak i panelen. Gles SJ-geometri blir inte en riktig spårlinje. Fem sparade fall omfattar 422/428/4132 och fungerande jämförelser; dessa tre tågsträckor saknar fortfarande säker geometri i det aktuella underlaget. `npm run qa:rail` återkör diagnosen. Se [utredning och begränsningar](ODINS_RAIL_GEOMETRY.md).

## AI-verktyg och samtalskontext (2026-10-12)

#1: modellen väljer validerade verktyg för resor, avgångsurval, polisnotiser, luftmätningar och ortnavigering. Servern tolkar datum/tid och formatterar källfakta. Tillfälligt samtalsminne gör följdfrågor möjliga; Nytt samtal och nätbyte rensar kontext. Platsval, argument, anropsbudget och samtidighet skyddas. 18 nya offlineprov samt riktiga Qwen-/källprov. Se [AI-verktyg, begränsningar och verifiering](ODINS_AI_TOOLS.md).

## Hemadress som rese-start (2026-10-12)

Uttryckliga hemadresser och hela hållplatsnamn får inte förkortas till ortnamn. ”Behöver vara [plats] vid [tid]” ger ankomst. Entydig start visas utan rullista; endast återstående tvetydigheter behöver väljas. Koordinaterna används av reseplaneraren för gång/kollektivtrafik, utan att låsa användaren till närmaste hållplats. Sex regressionstester och riktiga adress-/reseprov. Se [AI-integrationen](ODINS_AI_TOOLS.md).

### 2026-10-12 — Gemensam platsökning

- Location, AI-navigering och reseplanering delar adress-/namnkandidater. Ofullständiga gatu- och platsnamn ger valbara alternativ med ort/platstyp.
- Kartpositionen prioriterar närhet utan geografisk spärr. Exakta husnummer/suffix skyddas. AI-val valideras mot senaste samtalssvar.
- Västtrafik + Photon/OpenStreetMap med cache, anropsbegränsning, tydlig partiell källa och källhänvisning.
- 156 integrationstester och riktade Location-/webbläsarprov passerade. Se ODINS_AI_TOOLS.md för beteende och begränsningar.

### 2026-10-12 — Ortsnamn ovanpå satellitkartan

Valbart lager **Data Layers → Infrastructure → Ortsnamn · Esri** använder transparenta World Boundaries and Places-plattor. Även administrativa gränser ingår. Zoomnivån styr vilka namn tjänsten visar. Kräver nätåtkomst. Samma lokala lagerbeteende som Lantmäteriets tillägg: slås på via lagerpanelen och ingår inte i delningslänkar. Chrome verifierade fem riktiga namnplattor och på/av; build och katalogprov passerade.

### 2026-10-12 — Källpolicy, attribution och gångcache

- Primärkällor och olika datalicenser/API-villkor dokumenterade i ODINS_SOURCE_POLICY.md, inklusive faktisk TTL, budget, import- och observationsålder.
- GeoNames, EEA, Trafiklab, Lantmäteriet och Valhalla/FOSSGIS finns i samlad attribution. Radio Browser bekräftad som aktiv integration; Radio Garden används inte.
- Gångcache begränsad till 128 rutter/24 h, identiska väntande anrop samordnas och max 32 olika väntande rutter. VALHALLA_BASE_URL kan peka på egen instans. Fel cachas inte.
- Kvarstående avtals-/distributionskontroller redovisas uttryckligen; inga antagna fria licenser eller garanterad demokapacitet införs.

### 2026-10-12 — Väghändelser, första etapp (#22)

- Valbart Trafikverkslager med DATEX II 3.1 från roadworks, accident och trafficmessage; geografiskt begränsad leverans, klickbart kort och val mellan överlappande poster.
- Den gemensamma klienten utökad med fasta XML-feeds, begränsad cache, budget och tydlig gammal/partiell källstatus. Tid/geometri/DTD valideras; avslutade och pausade poster filtreras bort.
- AI-verktyget road_events återanvänder källan. Kollektivtrafikens trafikstatus är ett separat verktyg.
- Detaljerad/återkommande giltighet märks; ingen bekräftad aktivitet just nu, reseförsening eller omruttning antas. Se ODINS_ROAD_EVENTS.md för provresultat och avgränsningar.

### 2026-10-12 — Vägväder och kamerastation (#23)

Valbart Trafikverkslager och validerat AI-verktyg för stationernas senaste mätningar. Svensk CCTV-position får explicit knapp för närmaste station med avstånd/mättid. Rapporterat väglag visas separat för angivna vägsträckor; inget halklöfte eller automatisk omruttning. WeatherMeasurepoint-cache nu 5/15 min eftersom svaret innehåller observationer. Se ODINS_ROAD_WEATHER.md för geometriavgränsningar och prov.


### Fast AI-knapp i dockan (2026-10-12)

AI-knappen visas även när Lokal AI är avstängt. Klick aktiverar lagret och öppnar panelen; minimering behåller samtalet. Avstängning via Data Layers stänger panelen men lämnar knappen kvar för nästa öppning. Knappens bredd och panelens placering mot Location är oförändrade. Inga modell- eller API-anrop görs förrän användaren skickar en fråga.


### Fristående gångväg via AI (2026-10-12)

Verktyget `walk_route` hanterar frågor som ”Kortaste vägen att gå från Storgatan i Skövde till Torget i Skövde?”. Servern bevarar uttryckliga start- och målnamn inklusive husnummer. Gemensam adressökning ger platsval om flera träffar finns; endast senaste svarets ID:n accepteras. Gångvägen kan visas på kartan med befintlig Valhalla/OSM-geometri. Avstånd mäts längs geometrin och gångtid uppskattas vid 6 km/h. Det är en beräknad gångväg utan garanti för absolut kortaste sträcka. Befintlig lokal gångruttning (cirka 5 km mellan ändpunkterna), cache och anropsbudget återanvänds. Om geometri saknas visas ett tydligt fel och ingen fågelväg. Ingen kollektivtrafikplanering behövs för detta verktyg.

Validering: tre regressioner för platsval, bokstavlig adress och utebliven geometri; liveprov med lokal modell och Valhalla gav sammanhängande gånggeometri.


## Egna POI – issue #10, 2026-10-13

Egna kartplatser med WGS84-koordinater, adress, anteckningar, redigering/flytt och radering är implementerade för granskning. SQLite lagras beständigt utanför cache och Git. JSON-backup och transaktionell återställning med automatisk förkopia ingår. Adressökning återanvänds; omvänt uppslag sker endast efter knapptryckning. Se [POI-funktionen](ODINS_POI.md) för databasplats, flöden, gränser och verifiering. Kategorier, GeoJSON och AI-koppling återstår som senare tillägg.
