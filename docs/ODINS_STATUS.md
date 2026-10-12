# Status 2026-10-11

Samlad ändringslogg med issues, PR-länkar och verifiering: [ODINS_CHANGELOG.md](ODINS_CHANGELOG.md). De senaste ändringarna är implementerade på utvecklingsgrenarna och inväntar sammanfogning med main.

- Vite-bygget har passerat efter de senaste tilläggen.
- Liveprov: SL-resor Slussen–Stockholm C; Västtrafik Skövde–Södra Ryd; nationellt Lillegårdsvägen–Vällingby.
- Senaste geometritestet gav 4/5, 5/5 och 6/6 delsträckor för alternativen. SJ 422 kunde inte matchas säkert.
- Webbläsarprov: kartgeometri visas/rensas, kameran ramar in resan; EEA-ämnesval och kurva.
- EEA: 133 mätserier matchade mot koordinater vid senaste dataprovet; färskhet varierar.
- Realtime-felhantering: sex befintliga backendtester passerade. OpenAI-röst blockerades av uttömda API-krediter.
- Lokal Whisper-transkribering testad med syntetiskt svenskt tal; användaren måste granska texten.

## Kända begränsningar

- Frågemönster, inte fullständig agentisk källåtkomst.
- Förseningsräkning avgränsad till hållplatsurval; ej total för hela staden.
- Pythonvalet är nu gemensamt via GEV_PYTHON, projektets .venv eller systemets Python. Den lokala datorns särskilda sökväg ligger endast i ignorerad .env.
- Saknade cachefiler kan begränsa funktioner på en ny installation.
- Beräknad järnvägsdragning saknar verifiering mot operatörens faktiska spårval.
- Externa tjänster kan returnera preliminära, gamla eller ofullständiga data.
- Befintliga upstream-CI-tester behöver utvärderas mot våra nya lager.

## Installation och dataimporter – PR #11 / issue #2

- Gemensam Pythonkonfiguration för EEA, järnvägsruttning och lokal transkribering.
- Kommandon för SL/SJ GTFS, Topografi 100/250/1M, järnvägsgraf och valfri Whispermodell; se [installationen](ODINS_SETUP.md).
- Saknad SL/SJ-cache stoppar inte resans tider och ändpunkter; kartförslaget visar importanvisningar. Saknade topografidata ger ett tydligt installationsfel.
- Fem offlineprover passerade lokalt och från rena GitHub-kloner på Windows och Linux i [installations-CI](https://github.com/Flaxx83/ODINS_EYE/actions/runs/38150397441).
- Verifierade riktiga SJ/SL-arkiv, alla tre utvalda Topografi 1M-teman och identisk kontrollsumma för återskapad järnvägsgraf. Full omimport av 100/250 och installation på annan fysisk dator är inte verifierade på nytt.
- [PR #11](https://github.com/Flaxx83/ODINS_EYE/pull/11) är öppen för granskning; ändringen är ännu inte sammanfogad med main.

## Lokal AI-panel – PR #12

- Gemensamma designvariabler för glasbakgrund, typsnitt, färger och rundade paneler.
- Kort introduktion, märkt trafiknätsval, reseexempel i textfältet och grupperade åtgärdsknappar.
- Minimering/expandering, intern scroll, mobil layout och synlig tangentbordsfokus.
- Svar, källänkar och reseförslag har en enhetlig layout. Backend och modellens källåtkomst utökas inte av denna designändring.
- Produktionsbygget passerar. Visuell kontroll vid 1440×900 och 390×844 samt minimering och inlämning med simulerat svar passerade utan horisontell overflow.
- [PR #12](https://github.com/Flaxx83/ODINS_EYE/pull/12) är öppen och bygger på PR #11:s gren. Den är ännu inte sammanfogad med main.

## Kvarstående CI-arbete – issue #6

Installations-CI passerar, men bredare CI stoppar på äldre runtimefilers formatering. Den lokala paketgränskontrollen stoppar även på radio-provider och dess oägda sweden-garden.json. Detta följs upp i [#6](https://github.com/Flaxx83/ODINS_EYE/issues/6); hela CI ska därför inte beskrivas som grön.

## Reseformuleringar – del av issue #4

Tidstolkningen stöder nu även hela timmar och svenska tidsuttryck som `vid 07 tiden`, `vid 7-tiden`, `kl 7` och `klockan 7`. Uttrycket används som avgångstid 07:00. Ogiltiga eller ofullständiga explicit angivna tider ger ett förtydligande i stället för att sökningen tyst använder aktuell tid. `Imorgon` beräknas som nästa kalenderdag i Stockholm även vid övergång till sommartid.

Liveprov 2026-10-11: `Jag vill resa från Göteborg central till Vällingby T-bana imorgon vid 07 tiden.` sökte avgång 2026-10-12 07:00 och gav tre ResRobot-förslag. Första förslaget avgick 07:11 och anlände 11:34. Dessa är testets tidtabellsuppgifter och inte fasta framtida reserekommendationer.

Fem regressionstester finns i `server/providers/travel-input.test.mjs` och körs med `npm run test:travel` samt i installations-CI. Övriga delar av #4, såsom önskad ankomsttid och bredare datum-/följdfrågetolkning, återstår.

Komplettering: samma resefråga kunde ge ett tolkningsfel när T-bana innehöll en inklistrad radbrytning efter bindestrecket. Backend normaliserar nu radbrytningar, NBSP och osynliga formateringstecken innan verktygsval och reseparsning. Fem regressionstester täcker detta tillsammans med tidstolkningen.

## Dockning av lokal AI

När Lokal AI-lagret är aktivt visas en AI-knapp direkt till vänster om Location i nederdockan. Panelen öppnas ovanför knappen och följer dockans placering vid storleksändring. Minimering döljer panelen; text, nätval och svar behålls vid återöppning under samma aktivering. Escape i panelen minimerar den och återför fokus till dockknappen. Avaktivering av lagret tar bort panel, knapp och händelselyssnare. Verifierat i användarens öppna app: placering, minimering och bibehållen text vid återöppning. Produktionsbygget passerar.

## Fartygskort

Val av fartyg öppnar ett kort med namn, typ, fart/kurs, destination, rapporterad ETA, navigationsstatus, positionsrapportens ålder och MMSI/IMO. Saknade fält visas som Uppgift saknas. ETA visas i UTC med rapporterad månad/dag och utan påhittat år. Foto och prognostiserad rutt ingår inte.

Knappen Visa senaste spår använder samma insamlade AIS-spår som befintlig fartygsvisning. För få rapporter redovisas tydligt; historiken är begränsad till serversessionen. Stängning eller avmarkering tar bort kortet. Statiska AIS-rapporter får inte ersätta senaste fart, position eller dess rapporttid.

27 riktade tester och produktionsbygget passerar. Visuell kontroll, stängning och meddelande om saknat spår verifierades med tydligt märkt testdata. Liveflödet var tillgängligt, men ett komplett end-to-end-prov med ett faktiskt fartygsval verifierades inte under denna kontroll. Fälttäckning varierar mellan fartyg och AIS-rapporter.

AI-dockans placering har justerats: knappen är 160 px på rymliga skärmar (tidigare 80 px) och utökas åt vänster med bibehållen nettobredd i dockans layout. Location flyttas därför inte. Panelens högerkant riktas mot Locations högerkant och klampas inom skärmen. Breddningen begränsas på smala skärmar för att undvika att knappen hamnar utanför vyn.

## Trafikläge – issue #5

Implementerat på grenen fix/transit-departure-coverage, inväntar granskning. [Urval, prognoser, begränsningar och verifiering](ODINS_TRAFFIC_COVERAGE.md). 91 integrationstester och liveprov via AI-endpointen för Göteborg och Stockholm passerade. Statistik avser hållplatsavgångar i ett avgränsat urval; hela stadens fordon ingår inte.

## Resefrågor – issue #4

Ankomsttid, datum och gemensam tidsvalidering implementerat på feat/travel-arrival-dates, inväntar granskning. [Exempel, kalenderregler och begränsningar](ODINS_TRAVEL_INPUT.md). 111 integrationstester passerade. Valt trafiknät behålls; tvetydiga datum/tider behöver förtydligande. Automatisk kontext för följdfrågor återstår i #1.

## Järnvägsutredning – issue #3

Utredning, säkrare segmentkoppling och orsaker per delsträcka implementerat på fix/rail-network-routing-diagnostics, inväntar granskning. 125 integrationstester och nio offlineprov passerade. Två av fem sparade fall fick beräknad geometri; 422/428/4132 avvisades med konkret orsak. [Resultat och kvarstående databegränsningar](ODINS_RAIL_GEOMETRY.md). Kvarvarande geometriarbete inklusive expressbussar följs i #30.

## AI-integration – issue #1

Implementerat på codex/validated-ai-tools, inväntar granskning. [Verktyg, samtalskontext och anropsbudget](ODINS_AI_TOOLS.md). Följdfrågor behåller resväg, kalenderdatum och ankomst/avgång. Nya källanrop görs för datafrågor; äldre källsvar blir inte nya fakta. Trafiknät och användarens senaste platsval valideras. Tidigare begränsning om att alltid skriva hela resvägen i #4 ersätts av detta tillfälliga samtalsminne.

Adressuppföljning till #1: exakt hemadress, bevarade hela hållplatsnamn, ankomst via ”behöver vara [plats]” och rullista endast vid tvetydigheter. 149 integrationstester; liveadress/tre reseförslag och UI med fixerad start verifierade. Vällingby Centrum behöver fortfarande ett exakt resmål i befintlig katalog. Se [AI-integrationen](ODINS_AI_TOOLS.md).

### Gemensam adress-/namnsökning — granskningsklar 2026-10-12

Location och AI använder samma valbara platskandidater; reseplaneringen återanvänder kandidatkällan. Namn/gator behöver inte vara fullständiga adresser. Partiella källsvar synliggörs. Photon kan vara långsam/otillgänglig; generell funktion innebär inte garanterad träff för varje adress. 156 integrationstester, riktade UI-/Location-prov, build och paketgränser passerade lokalt. Ändringen väntar på granskning och sammanslagning.
