# Järnvägsgeometri: diagnos och säker ruttning

Utredning och implementation för #3, samordnat med järnvägsdelen av #30. Resans tider och tågens trafikstatus är separata från kartgeometrin. En saknad spårväg innebär inte att tåget saknar tidtabell eller att en verklig järnväg är avstängd.

## Vad som ändrats

Ruttningen kopplar stationspunkter till befintliga **spårsegment**, även mellan glest placerade noder. När närmaste spår inte kan ge en rimlig sammanhängande väg provas närliggande kandidater, högst åtta unika segment/noder inom 50 meter från den närmaste kopplingen. Den tidigare närmaste noden finns kvar som reserv inom samma 500-metersgräns. Hela vägen måste vara sammanhängande genom en och samma koppling vid varje station.

Virtuella punkter delar endast det ursprungliga segmentet. Två korsande segment med samma XY får inte en ny förbindelse. Det importerade nätet skrivs inte om. Grafens befintliga avrundning och kartografiska glappkopplingar behålls; detta är ett topografiskt nät, inte en bekräftelse på operativ topologi, växellägen eller nivåskillnader.

Gränsen till nätet är fortsatt 500 meter. Omvägsgränsen per stationspar är fortsatt 2,3 gånger fågelavståndet plus 3 km. Dessutom avvisas en längre återanvänd spårsträcka när återkörningen överstiger både 500 meter och 0,5 procent av nätvägens längd. Även en verklig planerad vändning kan därför behöva operatörsgeometri; den kan inte bekräftas av denna nätberäkning ensam. Inga gränser höjs för att tvinga fram saknade linjer.

Pythonjobbet returnerar nu ett strukturerat resultat med orsak, berört stationspar, avståndsgräns och vid fungerande rutt kopplingsavstånd. Klienten kontrollerar koordinater och stationskopplingar innan geometrin blir ritbar. Null, tomma strängar och booleanska koordinater blir inte kartpositioner vid noll grader. En saknad delsträcka behålls i täckningsrapporten och får inte flytta efterföljande geometri till fel etapp.

Panelen visar konkret orsak per saknad delsträcka: saknad/ogiltig graf, ogiltiga stationer, för långt till nätet, frånkopplat nät, avvisad omväg eller återkörning. Vid fel visas ingen fågelväg. Fungerande operatörsgeometri från andra leverantörer behålls. SJ:s glesa GTFS-linjer får inte bli en bekräftad spårdragning när nätberäkningen misslyckas.

Resultat återanvänds med en begränsad cache på 32 rutter, samordnade samtidiga anrop och grafens filversion i nyckeln. Ändrad graf gör att gamla rutter inte återanvänds. Hämt-/körfel kan provas igen. Returnerade koordinater och metadata delas inte som muterbara objekt mellan resor.

## Reproducerbara fall, 2026-10-12

Stationer, koordinater, trafikdatum, tid och tågnummer finns i `server/providers/rail-routing/fixtures/sweden-2026-10-12.json`. Resultatet för den lokala grafen finns i [valideringsrapporten](ODINS_RAIL_VALIDATION.json). Grafens SHA-256 är `da25d4e248baa8cbc40f9ca682b3c8dfef08ec1957c062a4ec33be2afd7bad65`.

| Tåg  | Sträcka                              | Resultat i detta underlag                                        |
| ---- | ------------------------------------ | ---------------------------------------------------------------- |
| 164  | Skövde–Hallsberg                     | Beräknad nätväg, cirka 113,3 km; största stationskoppling 28 m   |
| 164  | Skövde–Stockholm via Örebro/Västerås | Beräknad nätväg, cirka 341,5 km; största stationskoppling 70,7 m |
| 422  | Skövde–Stockholm                     | Avvisad omväg mellan Södertälje Syd och Stockholm                |
| 428  | Göteborg–Stockholm                   | Avvisad omväg mellan Södertälje Syd och Stockholm                |
| 4132 | Hallsberg–Stockholm                  | Avvisad omväg mellan Flemingsberg och Stockholm                  |

Den tidigare närmaste-nod-metoden gav cirka 265 km för Södertälje Syd–Stockholm, trots en avvisningsgräns på cirka 72 km för stationsparet. Den nya kopplingen ger fortfarande ingen godtagbar sammanhängande väg där. Detta pekar på en begränsning i det importerade nätets anslutningar; det beskriver inte den verkliga tågruttens längd.

SJ-cachen matchade datum/tid/stationer för 422 och 428 men hade bara fyra respektive fem punkter, med omkring 152 km mellan två punkter. Det räcker inte som detaljerad spårgeometri och ritas inte som sådan. Den prövade Västtrafik-platsökningen gav ingen exakt match för Stockholm Centralstation; andra liknande träffar används inte som ersättning. Detta är inte en fullständig inventering av alla möjliga operatörs- eller datatjänster.

## Körning och verifiering

Kör `npm run qa:rail` för att återköra de sparade fallen mot den lokala grafen. Kommandot rapporterar både fungerande och saknade rutter; kod 0 betyder att diagnostiken kunde köras, inte att alla rutter har geometri. `npm run qa:rail -- --require-all` ger felkod om någon rutt saknas. Graf och Pythonberoenden installeras enligt [installationsanvisningarna](ODINS_SETUP.md).

- 125 integrationstester passerade, inklusive tolv nya för resultatvalidering, orsaker, koordinater, legordning, cache och återförsök.
- Nio offlineprov för import/ruttning passerade, varav sju nya ruttfall: segmentkoppling, parallella kandidater, korsande spår, avståndsgräns, omväg, återkörning och ogiltiga indata.
- Den riktiga AI-panelen provades med tydligt märkt simulerat felresultat: orsaken visades och ingen spårlinje ritades.
- Fem verkliga tidtabellsfall återkördes mot den befintliga grafen: två fick beräknad nätgeometri och tre en konkret avvisningsorsak. Dessa resultat är underlagsberoende.
- Den lokala Pythonmiljön saknade geodataberoenden och återställdes i projektets `.venv`; lokal konfiguration väljer den miljön.

## Kvarvarande arbete

422, 428 och 4132 har fortfarande ingen säker kartgeometri med detta underlag. För att fylla dessa sträckor behövs verifierat tätare operatörsgeometri eller ett bättre anslutet järnvägsunderlag med känd topologi. En större omvägsgräns eller fågelväg löser inte databegränsningen. Det fortsatta geometriarbetet och expressbussarna hanteras i #30; källvillkor följs i #7. #3 kan avslutas som den dokumenterade utredning som dess omfattning tillåter, efter granskning.
