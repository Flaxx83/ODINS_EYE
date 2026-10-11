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
