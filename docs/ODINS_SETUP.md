# Installation

Node.js 24 används på utvecklingsdatorn. `npm ci` installerar JS-beroenden. Kopiera `.env.example` till `.env` och fyll endast i tjänster som ska användas.

## Miljövariabler för våra tillägg

- TRAFIKLAB_REALTIME_KEY, TRAFIKLAB_STATIC_KEY: regionala GTFS-flöden.
- TRAFIKLAB_TIMETABLE_KEY: hållplatser och avgångar.
- RESROBOT_API_KEY: nationell reseplanering.
- VASTTRAFIK_CLIENT_ID, VASTTRAFIK_CLIENT_SECRET: Västtrafik OAuth.
- GEV_PYTHON: Python-sökväg för EEA-jobbet. Övriga Python-anrop har ännu datorbundna sökvägar; se roadmap.

Bionic Local Model API kör lokalt på http://127.0.0.1:1235/v1 med modellen `qwen3.5-4b`. Ingen OpenAI-nyckel behövs för den lokala panelen. Originalets separata Realtime-röst använder OpenAI API och kräver egen åtkomst/fakturering.

Pythonfunktionerna behöver pyarrow, pyproj, shapely, faster-whisper och kompatibelt PyAV. Whisper base måste laddas ned innan transkribering. Lokalt installerad svensk Windows-röst används för uppläsning.

## Data som måste återskapas

`.gev-cache/` innehåller bland annat GTFS-metadata och linjeformer, EEA-mätningar, OAuth-token, järnvägsgraf och Whisper-modellen. Dessa skickas inte till GitHub.

Lantmäteriets Topografi 100/250/1M GeoPackage-exporter behövs för lokala topografiplattor och järnvägsgraf. Importskript för topografi skapades initialt i den lokala arbetskatalogen och behöver paketeras reproducerbart. `server/providers/rail-routing/build.py` förutsätter ännu `work/topography/100-kommunikation.gpkg`.

SJ-geometri importerades från GTFS till `.gev-cache/sj-geometry.json`; importflödet behöver också paketeras. SL-metadata/linjeformer byggs av Trafiklab-integrationen. Se `SL-INSTALLATION.md`.

## Driftsätt

Kör lokalt på loopback. Publicering av servern på internet är inte förberedd. Leverantörernas kvoter och villkor måste följas. Gångruttning använder FOSSGIS offentliga Valhalla-demo med cache och sekventiella anrop; för bredare distribution bör egen eller avtalad routing användas.
