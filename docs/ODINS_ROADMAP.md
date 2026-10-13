# Roadmap

Uppdaterad 2026-10-12 med Trafikverksplanen och senaste AI-tillägg. Ordningen nedan ersätter den tidigare sekvensen med tio arbetsuppgifter. Den visar rekommenderad prioritering; endast uttryckliga beroenden blockerar arbete. Implementerade PR:er granskas och sammanfogas före beroende arbete.

Senaste tillägg till #1: fast AI-knapp i dockan ([PR #42](https://github.com/Flaxx83/ODINS_EYE/pull/42)) och fristående gångvägar med platsval ([PR #43](https://github.com/Flaxx83/ODINS_EYE/pull/43)). Båda inväntar granskning. PR #43 bygger på #42, som bygger på vägväder i #41; detta är PR-beroenden, inte färdig leverans på main. Gångvägar återanvänder befintlig lokal ruttning och är inte en fullständig kortaste-väg-funktion. Detaljer och verifiering finns i [statusöversikten](ODINS_STATUS.md).

## Rekommenderad arbetsordning

| Ordning | Arbetsuppgift                                                                                        | Bedömd insats | Beroende/avgränsning                                             |
| ------- | ---------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------- |
| 1       | [#2: Reproducerbar installation](https://github.com/Flaxx83/ODINS_EYE/issues/2)                      | 16–24 h       | In review                                                        |
| 2       | [#6: Gemensamma tester och CI](https://github.com/Flaxx83/ODINS_EYE/issues/6)                        | 12–20 h       | #2                                                               |
| 3       | [#20: Trafikverket: API-grund, cache och källstatus](https://github.com/Flaxx83/ODINS_EYE/issues/20) | 8–12 h        | #6                                                               |
| 4       | [#21: Tågtider och störningar i reseförslag](https://github.com/Flaxx83/ODINS_EYE/issues/21)         | 16–24 h       | #20                                                              |
| 5       | [#5: Förseningar: täckning och deduplicering](https://github.com/Flaxx83/ODINS_EYE/issues/5)         | 16–24 h       | #6                                                               |
| 6       | [#4: Resefrågor: ankomsttid och datum](https://github.com/Flaxx83/ODINS_EYE/issues/4)                | 16–24 h       | #6                                                               |
| 7       | [#3: Verifiera kvarvarande järnvägsgeometri](https://github.com/Flaxx83/ODINS_EYE/issues/3)          | 16–32 h       | #2, #6                                                           |
| 8       | [#1: Validerade AI-verktyg och samtalskontext](https://github.com/Flaxx83/ODINS_EYE/issues/1)        | 32–56 h       | #4, #5; använd Trafikverkets strukturerade tjänster när de finns |
| 9       | [#7: Attribution, routingvillkor och cachepolicy](https://github.com/Flaxx83/ODINS_EYE/issues/7)     | 12–20 h       | Inventering kan starta direkt                                    |
| 10      | [#22: Väghändelser, vägarbeten och köer](https://github.com/Flaxx83/ODINS_EYE/issues/22)             | 12–20 h       | #20                                                              |
| 11      | [#23: Vägväder och väglag](https://github.com/Flaxx83/ODINS_EYE/issues/23)                           | 12–20 h       | #20                                                              |
| 12      | [#10: Egna POI med SQLite](https://github.com/Flaxx83/ODINS_EYE/issues/10)                           | 24–40 h       | #2, #6                                                           |
| 13      | [#24: NVDB: underlag och routingbeslut](https://github.com/Flaxx83/ODINS_EYE/issues/24)              | 8–16 h        | #7                                                               |
| 14      | [#9: Nätbaserad räckvidd för fyra färdsätt](https://github.com/Flaxx83/ODINS_EYE/issues/9)           | 40–64 h       | #7, #6, #24; #10 endast för sparad POI                           |
| 15      | [#8: Portabel Windows-version](https://github.com/Flaxx83/ODINS_EYE/issues/8)                        | 32–56 h       | #2, #7, #10 och verifierad installation                          |

Insatser inkluderar utveckling, riktade tester och dokumentation. Tidigare tio kärnissues bedömdes till 216–360 timmar. De fem nya uppgifterna tillför 56–92 timmar: totalt 272–452 timmar, mittpunkt 362 timmar. Detta är ursprungliga omfattningsestimat, inte återstående arbete; redan genomförda delar ska dras av vid sprintplanering. Väntan på externa besked ingår inte.

Tidigare daterade roadmapfönster ersätts av denna prioritering. Inga nya kalenderlöften görs. Projektets Ordning, Priority och Estimate styr planeringen; nya issues ligger i Backlog utan iteration. Start- och måldatum sätts när aktuell kapacitet och återstående arbete har bedömts.

## Trafikverket: leveranser i ordning

1. **#20, API-grund (8–12 h, P1):** återanvänd kamerornas serverintegration, cache, anropsbudget, samordnade anrop och tydlig källstatus. Granska schema och villkor i detta steg tillsammans med #7; vänta inte med nödvändig attribution till slutet.
2. **#21, tåg (16–24 h, P1):** matcha tågetapper till station, tågnummmer, datum och aktivitet; visa planerad/beräknad/faktisk tid, inställt, spår och störning. Okänd prognos är inte i tid. Befintlig reseplanerare fortsätter skapa resan.
3. **#22, väghändelser (12–20 h, P2):** valbart kartlager med olyckor, köer, avstängningar och vägarbeten. Reseanknytning kräver korrekt geometri; närhet är inte bevisad påverkan. Automatisk omruttning ingår inte.
4. **#23, vägväder (12–20 h, P2):** observationer, stationer och väglag tillsammans med kameror och karta. Visa observationstid och avstånd; härled inte säker halka från temperatur ensam.
5. **#24, NVDB-utredning (8–16 h, P2):** litet provområde runt Skövde och ett dokumenterat beslut om nät, hastigheter, topologi, routingmotor och kompletterande data för #9. Full nationell import och ny routingmotor ingår inte.

#22 och #23 kan tekniskt starta efter #20 utan att #21 är avslutad. NVDB-utredningen kan starta efter #7. Fri modellstyrning byggs i #1; de nya datatjänsterna måste även fungera genom det befintliga strukturerade frågeflödet. Tågstatus ersätter inte buss-/spårvagnsstatus i #5, och tåginformation löser inte geometri i #3.

## Genomfört arbete som inväntar granskning

- #2: installation och importer i PR #11.
- #1: paneldesign och dockning i PR #12, #14 och #17; validerade AI-verktyg och samtalskontext nu implementerade, inväntar granskning. Se [AI-integration](ODINS_AI_TOOLS.md).
- #4: tidstolkning och robust inklistrad text i PR #13; övrig frågetolkning återstår.
- #15: fartygskort i PR #16, In review.
- #18: svenska vägkameror i PR #19, In review. Lokal konfiguration: tak 5 000, Texas 200 och Kalifornien 100. Senaste katalogprov innehöll alla 1 548 svenska kameror; antal kan ändras med källan och andra leverantörers svar.

- #5: täckning, deduplicering och prognosstatus implementerat, inväntar granskning. Se [trafikläge](ODINS_TRAFFIC_COVERAGE.md). Nästa kärnuppgift i ordningen är #4, ankomsttid och datum i resefrågor.

Se [ändringsloggen](ODINS_CHANGELOG.md), [installation](ODINS_SETUP.md) och [GitHub-projekt 3](https://github.com/users/Flaxx83/projects/3). Röst har fortsatt lägre prioritet.

- #4: ankomsttid, datum och förtydliganden implementerat, inväntar granskning. Se [reseindata](ODINS_TRAVEL_INPUT.md). Nästa kärnuppgift i lösningsordningen är #3, kvarvarande järnvägsgeometri, samordnat med #30.

- #3: utredning, säkrare nätkoppling och geometriorsaker implementerat, inväntar granskning. Se [järnvägsutredningen](ODINS_RAIL_GEOMETRY.md). 422/428/4132 har fortfarande en dokumenterad databegränsning; fortsatt geometriarbete samordnas med #30. Nästa kärnuppgift i ordningen är #1, validerade AI-verktyg och samtalskontext.

- #1: validerade verktyg och tillfälligt samtalsminne implementerat, inväntar granskning. Se [AI-integration](ODINS_AI_TOOLS.md). Fem verktyg återanvänder befintliga källor; nya datalager behöver egna verktygsadaptrar. Nästa kärnuppgift enligt ordningen är #7, attribution, routingvillkor och cachepolicy.

## Källpolicy – issue #7, 2026-10-12

Inventering, källhänvisning, faktisk cache och routingbeslut är implementerade för granskning. Se [ODINS_SOURCE_POLICY.md](ODINS_SOURCE_POLICY.md). Publika demotjänster är inte underlag för bred distribution eller nätbaserade områdessvep. Kontroller av Västtrafiks aktiva avtal, exportmetadata och gamla EEA-fallbacks återstår inför distribution. Nästa planerade funktionsarbete efter granskning är #22, väghändelser på kartan; #7 behålls öppen för de uttryckliga kontrollpunkterna.

### Väghändelser – första etapp, 2026-10-12

#22 har levererat valbart lager, kort och strukturerat AI-verktyg för tre DATEX-feeds. Giltighets-/källbegränsningar finns i ODINS_ROAD_EVENTS.md. Delperiodstolkning och verklig geometribaserad reseanknytning återstår; ursprungligt estimat omvärderas när den första etappen granskats. Nästa funktionsspår efter granskning är #23, vägväder och väglag.

#23 har levererat stationslager, kort, kameraknapp och validerat AI-verktyg. Tätare vägsträckematchning och verklig reseanknytning återstår; dessa hålls synliga i issue/dokumentation. Cachepolicyn för WeatherMeasurepoint är korrigerad eftersom svaret innehåller senaste observation, inte bara statiska stationer. Se ODINS_ROAD_WEATHER.md.


## Egna POI – issue #10, 2026-10-13

Egna kartplatser med WGS84-koordinater, adress, anteckningar, redigering/flytt och radering är implementerade för granskning. SQLite lagras beständigt utanför cache och Git. JSON-backup och transaktionell återställning med automatisk förkopia ingår. Adressökning återanvänds; omvänt uppslag sker endast efter knapptryckning. Se [POI-funktionen](ODINS_POI.md) för databasplats, flöden, gränser och verifiering. Kategorier, GeoJSON och AI-koppling återstår som senare tillägg.


## NVDB-utredning och routingbeslut – #24, 2026-10-13

Utredningen har ett dokumenterat beslut: OSM och egen/avtalad Valhalla för första räckviddsversionen; NVDB som separat, senare kontroll/komplettering. Lokalt OSM-uttag, NVDB-infoklick, begränsade API-prov och tre Valhalla-profiler har kontrollerats. Ingen Lastkajen-export eller NVDB-till-Valhalla-import är verifierad; ingen isokronfunktion levereras i denna etapp. Se [utredningen](ODINS_NVDB_ROUTING.md) och [provresultaten](ODINS_NVDB_SAMPLE.json). Nästa etapp i #9 börjar med routingendpoint och versionsmärkt regionalt OSM-underlag, sedan gångkonturer före fler färdsätt.

### #9 – gångversion 2026-10-13

Motorvalet från #24 är implementerat genom lokala Pythonbindningar. Första gångytorna och kartpanelen är klara för granskning inom Skövdeområdet. Nästa steg: hinder-/passagevalidering och större täckning, därefter cykel/bil och elsparkcykelprofil. POI-start och AI/röst återstår. [Teknisk dokumentation](ODINS_REACHABILITY.md).
