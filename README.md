# ODINS_EYE

En lokal kart- och lägesbildsapp för Sverige och Europa, med trafik, miljödata och en lokal AI-panel.

Projektet bygger på [Gods Eye View](https://github.com/bilawalsidhu/gods-eye-view) av Bilawal Sidhu. Originalets MIT-licens och attribution finns kvar. Den ursprungliga dokumentationen finns i [docs/UPSTREAM_README.md](docs/UPSTREAM_README.md). ODINS_EYE är vår anpassning, inte ett påstående om att originalidén är vår.

## Kom igång

Installera Node.js 24 och kör:

```powershell
npm ci
Copy-Item .env.example .env
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

Öppna http://127.0.0.1:4173. Se [installation och lokala beroenden](docs/ODINS_SETUP.md) innan du använder data- och AI-tilläggen.

## Våra tillägg

- SMHI, GDACS, Krisinformation, Polisen och svenska MCF-lager.
- SL och regional kollektivtrafik via Trafiklab samt Västtrafiks API.
- Lokal Bionic/Qwen-panel för navigering, källfrågor och reseplanering.
- ResRobot för resor mellan regioner, adressval och framtida avgångstid.
- Resevisning med turgeometri, SL-linjeformer, gångrutter och beräknad järnvägsdragning.
- EEA-luftkvalitet och lokalt importerad Lantmäteriet-topografi.

## Status

Detta är en fungerande lokal prototyp under utveckling. AI-panelen har fortfarande styrda frågemönster och är inte en fri agent med tillgång till alla datakällor. Beräknad spårväg är inte bekräftelse på tågets faktiska spårval. Geometrimatchning kan saknas. Följ källornas tidsstämplar och täckningsuppgifter.

Se [ändringsloggen](docs/ODINS_CHANGELOG.md) för senaste tillägg, verifiering och koppling till issues/pull requests.

## Planering

[Roadmap](docs/ODINS_ROADMAP.md), [GitHub Issues](https://github.com/Flaxx83/ODINS_EYE/issues) och [projektet Odins Eye](https://github.com/users/Flaxx83/projects/3) används för planering. Se [arkitektur](docs/ODINS_ARCHITECTURE.md) för var funktionerna ligger.

## Verifiering

```powershell
npm run build
```

Riktade tester och lokala webbläsar-/API-prov är beskrivna i [docs/ODINS_STATUS.md](docs/ODINS_STATUS.md). Äldre upstream-tester är inte automatiskt bevis för våra integrationer.

## Hemligheter och data

API-nycklar ska ligga i `.env`, aldrig i commits. `.gev-cache/`, `work/`, loggar och inspelningar är lokala. Nedladdade originaldata och modellvikter följer inte med repositoryt. Vissa små bearbetade datamängder finns i koden; deras licenser gäller separat från MIT.


## Rita på kartan

DISPLAY ▸ **Draw** öppnar ritverktyget för punkter, linjer och områden. Verktyget låter dig skapa och rensa kartanteckningar. Beständig POI-lagring planeras separat i issue #10.

Testkommandon och CI-kontrakt: [ODINS_TESTING.md](docs/ODINS_TESTING.md).
