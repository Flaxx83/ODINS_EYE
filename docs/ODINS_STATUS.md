# Status 2026-10-11

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
