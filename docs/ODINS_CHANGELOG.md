# Ändringslogg för ODINS EYE

## 2026-10-25 – lokala radiofavoriter

Stationer kan sparas/tas bort med stjärnan i den sökbara grupplistan eller
via den valda kanalen i Contexts radiopanel. Favoritknappen öppnar alla
sparade stationer. Namn och stations-ID lagras lokalt i webbläsaren utan
ström-URL:er eller automatisk uppspelning. Favoriter överlever omladdning;
saknade stationer behålls och markeras som inte inlästa. Lagringsfel visas.
Lagring/borttagning och blockerad lagring har fixturetester; ett webbläsarprov
verifierar stjärnan, favoritlistan och beständighet efter sidomladdning.

## 2026-10-24 – klickbara radiogrupper

Gruppetiketter som ”37 OTHER” och samlade radiomarkörer öppnar en sökbar
lista över gruppens inlästa stationer. Namn, tillgänglig ort/kategori och
separata val för uppspelning respektive kartfokus visas. Listan behåller
gruppen från klickögonblicket, stöder Escape och städas vid avaktivering.
Inga nya kataloganrop eller automatisk uppspelning sker när listan öppnas.
55 befintliga radiotester, produktionsbygge och ett fixturebaserat
webbläsarprov med 38 stationer passerar. Webbläsarprovet täcker bland annat
etikettaktivering, kartklick, sökning, mobilbredd och borttagen station.

Återkör med `node scripts/qa-radio-cluster.mjs --url http://127.0.0.1:4173`
mot en lokal Vite-utvecklingsserver. Provet använder syntetiska stationer
och gör inga externa radiokatalog- eller ljudanrop.

## 2026-10-24 – rapporterad ankomst i flygfrågor

Ankomstfrågor besvaras med Swedavias planerade, beräknade och faktiska tider
i stället för att enbart följa planet på kartan. Anropssignaler matchas exakt
mot källans poster, och Arlanda/Landvetter kan avgränsa sökningen.
Kartknappen är en separat åtgärd. Sökningen gäller dagens svenska datum.
39 AI-tester och produktionsbygget passerar; SAS2844 till Arlanda verifierades
med ett liveanrop. Integrationen är fortsatt draft för återstående täckning.

## 2026-10-24 – flygfrågor och tidigare platskontext

Frågor som ”Hittar du någon information för flight SAS96T?” väljer nu
flygsökning direkt. Tidigare plats-/resekontext rensas för en uttrycklig
flygidentifierare. Fyra formuleringar, inklusive SK 7714 med mellanslag,
provas efter en tidigare fråga om Landvetter. 36 AI-tester passerar och den
exakta användarfrågan ger HTTP 200 med `find_flight` via den lokala servern.
Detta verifierar verktygsvalet, inte att SAS96T finns i observationsunderlaget.

## 2026-10-24 – synkad main och överlämning

PR-kedjan fram till #26 är införd på main (`7bb9cdc`), issue #2/#6 är stängda
och båda Actions-körningarna på main passerar. Nyare PR:er är fortfarande öppna.
[Instruktionen för andra datorn](ODINS_SECOND_PC.md) finns i repositoryt;
arbetet där är ännu inte påbörjat. [Swedavia](ODINS_SWEDAVIA.md) dokumenterar
verifierad API-åtkomst, kodutkast och återstående steg utan att beskriva
AI-integrationen som färdig.

## 2026-10-24 – flygsökning i lokal AI

Uttryckliga frågor som ”Jag letar efter flight SK7714” kopplas nu till
flyglagrets inlästa observationer. Exakt identifierare krävs för att följa
planet; delträffar väljs inte. Saknade träffar förklarar datatäckning och
skillnaden mellan bokningsnummer och anropssignal. Ingen IATA-konvertering
eller tidtabellsstatus ingår. 35 AI-tester passerar, inklusive exakt träff,
avvisad delträff och avbruten kartåtgärd.

## 2026-10-24 – #56 gång och tidtabellsstyrd färjepilot

Räckviddspanelen har separata gångval för statisk nätmodell, utan färjor och
en pilot för linje 285/286 mellan Lindholmspiren och Stenpiren. Piloten hämtar
aktuella avgångar och räknar gång, väntan, två minuters ombordstigningsmarginal
och överfart innan fortsatt gång beräknas. Den stöder start nu och högst en
överfart. Fel ger ingen statisk reserv. Hissars driftstatus, framtida starttid,
andra färdsätt och AI-integrering återstår i #56.

Se [manualen](ODINS_USER_MANUAL.md#färjor-vid-gång) och
[modellbeskrivningen](ODINS_REACHABILITY.md#färjepilot--2026-10-24).

## 2026-10-16 – #9 bil och elsparkcykel

Räckvidd har nu bilprofil med vägnätets hastigheter och valbart hastighetstak,
samt en märkt elsparkcykeluppskattning på cykelnätet (5–20 km/h). Samma lokala
Sverigeunderlag används. Köer, batteri och specifika elsparkcykelförbud ingår inte.
Jämförelse finns för gång/cykel. 189 integrationstester, nativeprov för tillträde,
enkelriktning, svängförbud och hastighetstak samt verkliga kartprov passerade.
Bygge och modulgränser passerade. GitHub-granskning återstår.
Se [användning och modell](ODINS_REACHABILITY.md). #9 hålls öppen för granskning
samt utökad jämförelse/validering.


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


## NVDB-utredning och routingbeslut – #24, 2026-10-13

Utredningen har ett dokumenterat beslut: OSM och egen/avtalad Valhalla för första räckviddsversionen; NVDB som separat, senare kontroll/komplettering. Lokalt OSM-uttag, NVDB-infoklick, begränsade API-prov och tre Valhalla-profiler har kontrollerats. Ingen Lastkajen-export eller NVDB-till-Valhalla-import är verifierad; ingen isokronfunktion levereras i denna etapp. Se [utredningen](ODINS_NVDB_ROUTING.md) och [provresultaten](ODINS_NVDB_SAMPLE.json). Nästa etapp i #9 börjar med routingendpoint och versionsmärkt regionalt OSM-underlag, sedan gångkonturer före fler färdsätt.

## 2026-10-13 – första gångversionen av #9

Lokal Valhalla 3.9.1 via Windows/Python, regional OSM-extraktion, validerat isokron-API och **Räckvidd · Till fots**. 1–3 tidsgränser, 1–30 minuter, standard 6 km/h. Delad adressökning, koordinater och kartklick. Täckningskontroll, timeout, serialisering och cache; inga publika demoanrop. [Installation, prov och begränsningar](ODINS_REACHABILITY.md). Övriga färdsätt återstår.

## Fortsättning #9 – större gångunderlag och POI

Gångytorna använder nu Västra Götaland med omnejd (rektangulär täckning) och sparad POI kan väljas som start. Versionsbyte validerar nodreferenser, daterad data och konturer i fyra orter före atomisk aktivering; föregående version bevaras. Fyra kontrollerade nativeprover tvingar fram gångomväg vid saknad passage, separat järnväg, gångförbjuden motorväg och låst grind. Polygonernas interpolation kan visuellt täcka vatten/hinder och framgår nu tydligt i panelen. Cykel/bil/elsparkcykel och fler faktiska passageprov återstår. [Detaljer och uppdatering](ODINS_REACHABILITY.md).

## #9 – gångunderlag för hela Sverige

Hela Sverige-PBF:en används nu utan ytterligare regional klippning: cirka 2,31 miljoner highway/ferry-väglänkar och 5 739 restriktionsrelationer. Täckning visas dynamiskt och gränsöverskridande begränsningar framgår i panelen. Gånghastighet, tidsgränser, anslutningskontroll och POI-start behålls. Övriga färdsätt återstår. [Installation och nationella provpunkter](ODINS_REACHABILITY.md).

## #9 – cykel och jämförelse, 2026-10-16

Cykelprofil (stadscykel, standard 18 km/h) och jämförelse med gång är implementerade på samma Sverigeunderlag. Färdsättsspecifik anslutning, validering och cache; gång vit/grå och cykel blå/cyan. Kontrollerade nativeprov för cykelväg, cykelförbud, enkelriktning och cykelundantag samt verkligt jämförelseprov i webbläsare passerar. Bil och separat elsparkcykelprofil återstår; #9 hålls öppen. [Detaljer](ODINS_REACHABILITY.md).


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

## Svensk användarmanual – 2026-10-16

Samlad [användarmanual](ODINS_USER_MANUAL.md) med snabbstart, kartbakgrunder, adressval, AI, resor, räckvidd, POI/backup, datalager och felsökning. Två skärmbilder från den lokala appen och exempelfrågor ingår. README länkar till manualen. Guiden beskriver utvecklingsgrenen och anger kvarvarande begränsningar.

## Järnvägsstil – #28, 2026-10-17

Lantmäteriets kommunikationslager använder objekttypen för stilsättning:
ralstrafik får lila/mörklila streckad linje (3 px), vaglinje/ovrig_vag får grå
linje (1,5/1 px), farjeled får cyan streckad linje (2 px). Teckenförklaring visas
endast när lagret är aktivt. Geometri, routing och källdata är oförändrade.
Lila grundspår har streckat mönster för att skiljas från heldragen resegeometri.
Rasterbakgrundernas egna stilar ändras inte. Produktionsbygget passerar;
visuell kontroll genomförs i Skövde på Esri Satellite och OSM.

## Lugnare järnvägsvisning – #28, 2026-10-17

Efter visuell återkoppling ersätts den lila/mörklila streckningen med en
heldragen lila linje (#bd77ff). Bredden är fortsatt 3 px. Teckenförklaringen
och användarmanualen följer den nya stilen. Färjeleder är fortsatt streckade.

## Jämför valbara färdsätt – #9, 2026-10-18

Räckvidd kan jämföra valfria två till fyra färdsätt från samma start och med
samma tidsgränser. Gång, cykel, bil och elsparkcykel har egna hastighetsfält.
Varje resultat kan visas/döljas via färgförklaringen utan omberäkning.
En jämförelse visas först när alla svar har lyckats på samma underlagsversion.

## Göteborgsprov av räckvidd – #9, 2026-10-18

Prov vid Hisingsbron, Älvsborgsbron och Lindholmen–Stenpiren: 12 konturuppsättningar,
24 riktade rutter och 36 målpunkt/tidskontroller passerar mot lokalt underlag.
Webbläsarprov med alla fyra profiler passerar. Rapport och reproducerbart
Pythonprov sparade. Färje- och hissbegränsningar förtydligade i manualen.
Ingen ändring av beräkningsmodellen.

## Färjeförstudie – #56, 2026-10-18

Verifierad Västtrafik-åtkomst för Lindholmspiren–Stenpiren med avgångar,
ankomster, kajlägen och inställelseflaggor. Störningsanrop lyckas men gav
inga poster. Dokumenterat att estimated-tider inte i sig bekräftar realtid.
Förslag till gång + en färjeöverfart dokumenterat; ingen produktionslogik ändrad.

## Strikt färjeuteslutning – #56, 2026-10-18

Nytt reproducerbart native-prov för isolerade öar, färjestart och båda
riktningarna Lindholmspiren–Stenpiren. Strikt exkludering passerar för gång,
medan preferensen use_ferry=0 fortfarande tillåter färja utan landalternativ.
Rapport/resultat sparade. Ingen ändring av produktionsprofil eller konfiguration.
