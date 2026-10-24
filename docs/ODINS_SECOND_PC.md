# Arbete på den andra datorn

Överlämning 2026-10-24. **Arbetet är inte påbörjat.**
Denna GitHub-version kompletterar filen som tidigare sparades på USB-minnet.

## Utgångsläge

Repository: https://github.com/Flaxx83/ODINS_EYE

`main` har uppdaterats till `7bb9cdc5d278dd1c88bf1641f904c97e682c30bf`.
PR #11, #12, #13, #14, #16, #17, #19, #25 och #26 är merged; issue #2 och #6
är stängda. [CI](https://github.com/Flaxx83/ODINS_EYE/actions/runs/40127621590)
och [installationsproven](https://github.com/Flaxx83/ODINS_EYE/actions/runs/40127621605)
passerade på denna commit.

Senare funktioner ligger i öppna PR:er. Bland annat finns den svenska manualen
i #52, färjepiloten i #59 och exakt flygsökning i #60. Swedavia-kopplingen är
under arbete. Börja från aktuell `origin/main`; sammanfoga inte arbetsgrenarna
för att få tillgång till fler funktioner. Läs aktuella PR:er för att undvika
att göra om pågående arbete.

## Förutsättningar

Datorn saknar privata API-nycklar, lokal språkmodell och eventuellt geodatacacher.
Använd små syntetiska fixtures och injicerade testfunktioner. Kopiera inte
privata miljöfiler, tokenfiler eller hela `.gev-cache` till datorn eller GitHub.
Internet behövs för GitHub och beroendeinstallation. Vanliga kartvyer kan också
behöva externa resurser; tester utan API-nycklar är inte samma sak som full
offlinekartfunktion.

Läs tillämpliga `AGENTS.md`, `docs/ODINS_SETUP.md` och `docs/ODINS_TESTING.md`.
Git och Node 24.14+ inom 24.x eller Node 26.x behövs. Python 3.12 är valfritt
för geodataimportproven. Följ datorns lokala installationsregler.

## 1. Hämta projektet

Använd en riktig klon, inte ZIP-filen utan Git-historik. En befintlig klon
med osparade ändringar måste bevaras innan grenbyte; gör ingen reset/rensning.
Använd vid behov en ny klon i en ny katalog.

Kör ett kommando i taget i PowerShell:

```powershell
git clone https://github.com/Flaxx83/ODINS_EYE.git
cd ODINS_EYE
git fetch origin
git switch main
git pull --ff-only origin main
git rev-parse HEAD
git switch -c codex/second-pc-offline-verification
node --version
npm.cmd ci
```

Om fast-forward misslyckas, undersök skillnaden och bevara lokalt arbete.
Notera startcommit i rapporten.

## 2. Första uppgift: installation och tester utan nycklar

```powershell
npm.cmd run doctor -- --json
npm.cmd run doctor:odins
npm.cmd run format:check
npm.cmd run check:boundaries
npm.cmd run test:integrations
npm.cmd run test:setup
npm.cmd test
npm.cmd run build
```

Miljökontroller kan rapportera saknade nycklar, modeller och cachefiler.
Skilj förväntade saknade förutsättningar från programfel. Använd inte
`doctor:odins --strict` som godkännandekrav när valfria komponenter saknas.

Om Python är tillgängligt:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-geo.txt
npm.cmd run test:imports
```

Markera annars Pythonproven som inte körda. Skapa
`docs/qa/SECOND_PC_OFFLINE.md` med OS-/runtimeversioner, startcommit, kommandon,
resultat och reproduktionssteg. Åtgärda bara konstaterade fel och behåll testkraven.

## 3. Nästa uppgift: faktiska luckor i fixturetester

Granska först befintlig täckning. Välj högst två bekräftade luckor:

| Område | Filer på den överlämnade main | Beteende att undersöka |
| --- | --- | --- |
| Fartygskort | `src/layers/vessels/inspector-model.js` och dess tester | Saknade värden, rapporterad ETA, felaktiga datum |
| Vägkameror | `server/providers/cctv/trafikverket.test.mjs` | Ogiltiga koordinater/bildvärdar och nycklar i klientdata |
| Resväg | `src/layers/local-ai/trip-map.test.mjs` | Saknad geometri får ingen påhittad rak resväg |
| Import/installering | `scripts/odins-setup.test.mjs` | Saknad fil, fel Pythonval och ofullständig GTFS |

För ett verkligt fel: skriv ett regressionsprov som misslyckas före rättningen
och passerar efter. Duplicera inte befintliga tester och lägg inte in fabricerade
livesvar i produktionskoden. Leverera en liten PR per område.

## 4. Granska gränssnitt och dokumentation

Granska tangentbordsfokus, etiketter, stängning, scroll och läsbarhet i 390 × 844
och 1280 × 800. Starta datorns egen server:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

Öppna `http://127.0.0.1:4173/`. Den adressen ansluter till den dator där
webbläsaren körs. Stäng externa datalager vid manuell granskning.

För automatiska webbläsarprov, följ fixture-, dummy-token-, bygg- och
serverupplägget i `.github/workflows/ci.yml`. Befintliga prov är:

```powershell
npm.cmd run qa:street-level:fixtures -- --strict --url http://localhost:4173
npm.cmd run qa:panel-resize -- --url http://localhost:4173
```

Dummy-token ger ingen riktig API-åtkomst. Om webbläsare eller kartresurser
saknas, dokumentera begränsningen; markera inte okörda visuella prov som godkända.
Gör små avgränsade rättningar, inte en generell redesign.

Uppdatera installations- och testinstruktioner utifrån de verkliga fynden.
Skapa ingen parallell fullständig manual: PR #52 innehåller redan en sådan.
Anteckna konkreta förbättringsförslag till den.

## 5. Ansvarsfördelning och återlämning

Privata datorn behåller live-API, lokal LLM/röst, routinggrafer, verkliga
färjeavgångar och Swedavia-integrationen. Dessa provas där före integration.

Kontrollera `git status --short`, `git diff --check` och `git diff` före commit.
Lägg endast till avsedda filer. Pusha en egen `codex/`-gren och öppna en PR mot
`main` med problem, ändring, startcommit, körda prover och det som inte verifierats.
Sammanfoga inte PR:en och ändra inte andras arbetsgrenar inom detta uppdrag.

Rapportera följande i `docs/qa/SECOND_PC_OFFLINE.md`:

- Datum, startcommit, gren och Windows-/Node-/Pythonversion.
- Varje kommando med godkänt, fel eller inte kört.
- Bekräftade fel och reproduktionssteg.
- Ändrade filer och PR-länk.
- Ej verifierad live-API, lokal AI, geodata eller webbläsarmiljö.
- Rekommenderat nästa steg utifrån fynden.

## Instruktion till kodassistenten

> Läs denna fil och tillämpliga projektinstruktioner. Börja med uppgift 2
> på en egen codex/-gren från aktuell origin/main. Datorn saknar privata
> API-nycklar, lokal LLM och privata geodatacacher. Använd befintliga fixtures,
> dokumentera saknade förutsättningar och sänk inte testkraven. Skapa
> docs/qa/SECOND_PC_OFFLINE.md med verifierbara resultat. Rätta endast
> reproducerbara fel inom uppgiften och undvik dubbelarbete med öppna PR:er.
> Förbered en liten PR; sammanfoga ingenting. Redovisa sedan fynden och välj
> nästa uppgift utifrån dem.
