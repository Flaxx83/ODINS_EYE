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
- Kod innehåller datorbundna Python-sökvägar.
- Saknade cachefiler kan begränsa funktioner på en ny installation.
- Beräknad järnvägsdragning saknar verifiering mot operatörens faktiska spårval.
- Externa tjänster kan returnera preliminära, gamla eller ofullständiga data.
- Befintliga upstream-CI-tester behöver utvärderas mot våra nya lager.
