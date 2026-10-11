# Roadmap

Preliminär plan, bedömd 2026-10-11. Arbetsinsats omfattar utveckling, tester och dokumentation. Estimate i projektet anges i arbetstimmar (intervallets mittpunkt). Intervallen är bedömningar, inte löften.

Datumen är ett planeringsscenario: en utvecklare, 20 timmar per vecka från 2026-10-12, sekventiellt arbete. De är inte beslutade leveransdatum. Externa API-besked, nedladdningstider och väntan ingår inte. Omfattningen begränsas till respektive issues kärnfunktion.

| Ordning | Issue | Etapp | Insats | Beroenden | Start | Mål |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | [#2: Installation: reproducerbara importer och portabla Python-sökvägar](https://github.com/Flaxx83/ODINS_EYE/issues/2) | 1. Stabil grund | 16–24 h | Inga | 2026-10-12 | 2026-10-16 |
| 2 | [#6: Tester: fixtures och CI för våra integrationer](https://github.com/Flaxx83/ODINS_EYE/issues/6) | 1. Stabil grund | 12–20 h | #2 för CI-importer | 2026-10-19 | 2026-10-23 |
| 3 | [#5: Trafik: täckning och deduplicering av förseningar](https://github.com/Flaxx83/ODINS_EYE/issues/5) | 2. Tillförlitlig trafik och resa | 16–24 h | #6 | 2026-10-19 | 2026-10-30 |
| 4 | [#4: Reseplanering: ankomsttid, datum och förtydliganden](https://github.com/Flaxx83/ODINS_EYE/issues/4) | 2. Tillförlitlig trafik och resa | 16–24 h | #6 | 2026-10-26 | 2026-11-06 |
| 5 | [#3: Resegeometri: utred saknad SJ 422 och verifiera spårnät](https://github.com/Flaxx83/ODINS_EYE/issues/3) | 2. Tillförlitlig trafik och resa | 16–32 h | #2, #6 | 2026-11-02 | 2026-11-13 |
| 6 | [#1: AI: validerade verktygsanrop och samtalskontext](https://github.com/Flaxx83/ODINS_EYE/issues/1) | 3. Integrerad AI | 32–56 h | #4, #5, #6 | 2026-11-16 | 2026-12-04 |
| 7 | [#7: Datakällor: attribution, routingvillkor och cacheuppdatering](https://github.com/Flaxx83/ODINS_EYE/issues/7) | 3. Integrerad AI | 12–20 h | Inventering kan börja direkt; krävs före #9 och #8 | 2026-11-30 | 2026-12-04 |
| 8 | [#10: Kartfunktion: egna POI med koordinater, adress och anteckningar](https://github.com/Flaxx83/ODINS_EYE/issues/10) | 4. Nya kartverktyg | 24–40 h | #2, #6 | 2026-12-07 | 2026-12-18 |
| 9 | [#9: Kartanalys: räckvidd inom tidsbudget för gång, cykel, bil och elsparkcykel](https://github.com/Flaxx83/ODINS_EYE/issues/9) | 4. Nya kartverktyg | 40–64 h | #7, #6; #10 endast för start från sparad POI | 2026-12-14 | 2027-01-08 |
| 10 | [#8: Distribution: portabel Windows-version](https://github.com/Flaxx83/ODINS_EYE/issues/8) | 5. Distribution | 32–56 h | #2, #7, #10 samt verifierad installation | 2027-01-04 | 2027-01-22 |

Total bedömd insats: 216–360 timmar, mittpunkt 288 timmar. Vid 20 timmar/vecka motsvarar mittpunkten cirka 15 veckor. Lägg inte till kalenderlöften innan faktisk kapacitet är beslutad.

Projektfält: Ordning visar sekvensen, Etapp grupperar arbetet, Priority visar angelägenhet och Estimate visar arbetstimmar. Start date och Target date ger tidslinjens preliminära fönster. Endast grundarbetet #2 och #6 ligger kvar i aktuell iteration; övriga är Backlog för kommande planering.

Omvärdera intervall och datum efter varje etapp. Källvillkor och regressionstester hanteras även under funktionsarbetet. POI-databasen förbereds för senare portabel distribution. Röst är fortsatt lägre prioriterad.


## Senaste genomförda arbete som inväntar granskning

- #2: installation och importer i PR #11.
- #1: paneldesign och dockning i PR #12, #14 och #17; AI-verktygsintegrationen återstår.
- #4: tidstolkning och robust inklistrad text i PR #13; övrig resefrågetolkning återstår.
- #15: fartygskort i PR #16, status In review.

Se [ändringsloggen](ODINS_CHANGELOG.md) för gränser, provresultat och sammanfogningsordning. Dessa ändringar flyttar inte automatiskt de återstående roadmapdatumen.
