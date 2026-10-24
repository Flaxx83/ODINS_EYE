# Färjedata för räckvidd – förstudie till #56

Kontrollerat 2026-10-18. Förstudien omfattar datatillgång och föreslagen integration,
inte en färdig tidsberoende räckviddsmodell. Relaterat: #9, #7 och PR #55.

## Beslut som underlaget stödjer

Börja med **gång + högst en färjeöverfart Lindholmspiren–Stenpiren i båda
riktningar**, med 285 och 286 som kandidater. Använd avgångs- och ankomsttider
från Planera Resa v4. Återanvänd befintlig serverautentisering; inga nya
nycklar behövdes i proven. Realtid ska markeras separat och inte antas bara
för att ett estimated-fält är ifyllt. Cykel och elsparkcykel följer efter att
medtagande och tillträde modellerats. Bil ingår inte i denna passagerarfärjepilot.
Hissars driftdata är inte undersökt i denna etapp.

## Verifierad åtkomst

Lokala integrationer använder redan `server/providers/vasttrafik.js` för OAuth,
`local-trip.js` för resor och `local-traffic.js` för avgångar.

| Behov | Källa/anrop | Resultat i provet |
|---|---|---|
| Hållplatsidentitet | Planera Resa v4 `locations/by-text` | Båda hållplatsområdena hittades; sökningen ger även orelaterade alternativ som måste filtreras |
| Avgångar och kaj | `stop-areas/{gid}/departures` | HTTP 200; planerad/uppskattad tid, stopPoint, linje, journey-id, inställelseflaggor |
| Överfart och ankomstkaj | `journeys?originGid=…&destinationGid=…` | Tre direkta färjeförslag på 285/286, sex minuter i respektive prov |
| Inställelse | `isCancelled`, `isPartCancelled` | Fälten finns, false i provet; ingen verklig inställd tur verifierad |
| Störningar | Störning v1 `traffic-situations/line/{gid}` | HTTP 200 för båda linjerna, tomma listor; detta bevisar inte störningsfri drift |
| Realtidskvalitet | `line.isRealtimeJourney` plus tidsfält | false i alla tre reseförslag trots ifyllda estimated-tider; ingen faktisk försening verifierad |
| Fordonsmedtagande/kapacitet | Operatörens reseregler | Inte styrkt per avgång av API-provet; ingen platsgaranti |

Officiell API-dokumentation: [Planera Resa v4](https://developer.vasttrafik.se/apis/13/v4),
[Störning v1](https://developer.vasttrafik.se/apis/12/v1).
V4-schemat kunde inte läsas fullständigt i denna genomgång; fält ovan har observerats
i riktiga svar. Exakta kvoter, pagination, frågefönster, uppdateringsfrekvens och
realtidsfältens fullständiga kontrakt återstår att verifiera innan implementation.

Hållplatsområden:
- Lindholmspiren: `9021014004493000`, 57.705524, 11.939841.
- Stenpiren: `9021014006242000`, 57.705947, 11.957514.
- Linje-GID: 285 `9011014528500000`; 286 `9011014528600000`.

Stop-area är inte tillräcklig för gånganslutningen: provet använder A1→E1 för 286
och A2→E3 för 285. Koppla till respektive stopPoint-koordinat och kontrollera
nätanslutningen. Koppla inte API-turer till OSM enbart genom linjenumret 285.

## Sparat observationsprov

[Utvalda svarsfält](qa/ferry-data-sample.json), hämtning påbörjad 16:01:07 svensk tid.
Tre avgångar från Lindholmspiren den 18 oktober 2026:

| Linje | Planerad avgång | Planerad ankomst | Överfart |
|---|---|---|---|
| 286 | 16:03 | 16:09 | 6 min |
| 286 | 16:23 | 16:29 | 6 min |
| 285 | 16:25 | 16:31 | 6 min |

Detta är ett daterat prov, inte en aktuell avgångstavla. Nycklar, tokens och
rekonstruktionsreferenser är inte sparade i dokumentationen. Provet är bara
framåtriktningen; motsatt riktning och tidpunkter efter ändrad kalender ska
prövas före pilotens godkännande.

## Reseregler och källkonflikt

[Västtrafiks linjeinformation](https://www.vasttrafik.se/info/alvsnabben-och-alvsnabbare/)
beskriver 285 längs älven och 286 mellan de två kajerna, samt möjlighet att ta
med cykel. Generell information säger vardagstrafik för 286, men API-provet gav
286 på söndagen 18 oktober. Hårdkoda därför inte veckodagar från informationssidan;
kontrollera datumstyrda resor och behandla skillnaden som något att verifiera.

[Cykel- och mikromobilitetsregler](https://www.vasttrafik.se/resa-med-oss/under-resan/cykel/)
ger villkor för medtagande. Likställ inte automatiskt elsparkcykel med cykel:
hopfällning, handbagage och plats kan påverka medtagandet. Maskinläsbar kapacitet
och avgångsspecifikt tillträde har inte verifierats. Inför ingen obegränsad
elsparkcykel-färjeprofil på grundval av det statiska cykelnätet.

## Villkor och drift

[API-villkor](https://developer.vasttrafik.se/docs/terms) anger CC0 1.0 för data,
krav på registrerad applikation/prenumeration och att minimera nödvändiga anrop.
Tekniska begränsningar gäller; tjänsten garanterar inte aktualitet eller tillgång.
Nycklar ska stanna på servern. Ange Västtrafik som källa och hämtningstid i resultat.

Föreslagen cache, inte verifierad leverantörskvot: samordna samtidiga anrop,
begränsa pilotens hållplatser/tidsfönster, kort cache för nära avgångar och
separat cache för hållplatsidentiteter. Vid 429/timeout: tydligt otillgänglig
färjeberäkning, aldrig tyst återgång till statiska färjetider. Exakt TTL och
kvot bestäms efter dokumentationskontroll. Tom störningslista betyder endast
att källan inte returnerade poster i det anropet.

## Föreslagen beräkning – kräver tekniskt prov

1. Ange start, starttid med Europe/Stockholm och tidsbudget. Gör en landbaserad
   grundberäkning som **verifierat utesluter alla färjelänkar**. En preferens att
   undvika färjor räcker inte. Teknisk möjlighet i vår Valhalla-version är en
   första kontrollpunkt; nuvarande arbetare har inte detta skydd.
2. Beräkna nätbaserad gångtid till respektive avgångskaj utan färja. Lägg till
   en synlig ombordstigningsmarginal; fastställ inte marginalen som operatörsfakta.
3. Hämta samtliga relevanta direkta färjeturer inom tidsfönstret. Tre optimerade
   reseförslag är inte bevis på fullständig avgångstäckning. Pagination och
   komplett insamling måste verifieras; markera annars resultatet som begränsat.
4. Välj avgångar som kan hinnas med och inte är inställda. Beräkna
   `återstående tid = starttid + tidsbudget − ankomsttid`. Använd samma konsekventa
   tidsgrund för avgång och ankomst. Saknad/oklar realtid får inte döljas.
5. Beräkna gångområde från ankomstkajen med återstående tid och utan färjelänkar.
   Visa grundområdet och tillkommande färjeområden med härkomst: linje, avgång,
   väntetid, överfart, kvarvarande tid, källa och kvalitet. Inga färjeområden när
   budgeten är slut före ankomst. Olika kajer och olika tider får inte blandas.
6. Piloten tillåter högst en överfart; märk detta. Flera byten och andra linjer
   kommer senare. Hissdrift är fortsatt okänd och redovisas som modellbegränsning.

Detta är en föreslagen kombination av lokal gångrouting och tidtabellsdata,
inte något nuvarande isokronanrop redan gör. Att lägga en fast väntetid ovanpå
den befintliga färjepolygonen skulle inte lösa problemet.

## Nästa genomförbara etapp

- Verifiera strikt färjeuteslutning i routingmotorn med Göteborgsproven.
- Verifiera dokumenterat tidsfilter/pagination och båda reseriktningar i V4.
- Normalisera tider, inställelse och datakvalitet i en liten serveradapter med
  fixtures för ordinarie/inställd/försenad avgång, fel, kalender och dygnsbyte.
- Testa gång + en färja som separat pilot, innan detta ersätter generell räckvidd.

Steg 1 i #56 har alltså ett verifierat dataunderlag men kvarvarande tekniska
frågor. Datakällan är tillgänglig; färjeintegrationen är ännu inte implementerad.

## Uppföljning: färjeuteslutning verifierad

[Lokala prov](qa/FERRY_EXCLUSION.md) visar att strikt uteslutning fungerar
för gång i rutt och isokron. Preferensen use_ferry=0 räcker inte. Startfilter
behövs också. Produktionsarbetaren är ännu oförändrad; nästa steg är att
koppla en uttrycklig landprofil till piloten och verifiera API-tidsfönstret.

## Uppföljning 2026-10-24: första gångpiloten

En separat landprofil och en pilot med start nu och högst en överfart är
implementerade på arbetsgrenen. Se [modell och begränsningar](ODINS_REACHABILITY.md#färjepilot--2026-10-24).
Förstudiens tidigare status beskriver läget vid respektive undersökning.
Framtida starttid, hissars driftstatus och övriga färdsätt återstår.
