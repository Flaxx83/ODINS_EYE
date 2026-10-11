# Arkitektur

Browser: Cesium-karta och lager i `src/layers/`, katalog i `src/app/constructCatalog.js`.

Lokal Vite-server: tillägg i `server/providers/`, registrerade i `server/standalone/vite.config.js`.

AI-panel: `src/layers/local-ai/`. Anrop till `server/providers/local-ai.js`, vidare till lokal Bionic, styrda datakällfrågor eller resefunktioner.

Resor: Västtrafik i `local-trip.js`, SL/nationellt i `local-sl-trip.js`, datum/adresser i `travel-input.js`. Avgångsstatus i `local-traffic.js`.

Geometri: SL-matchning, nationell Västtrafik-matchning, SJ GTFS och järnvägsgraf samt gångprofil i Valhalla. Osäkra sträckor visas som ändpunkter, inte fågelväg.

EEA/Whisper/järnväg använder Python-jobb. Större filer ligger i lokal `.gev-cache/`. Portabilitet och återuppbyggnad av cache är ännu inte helt lösta.
