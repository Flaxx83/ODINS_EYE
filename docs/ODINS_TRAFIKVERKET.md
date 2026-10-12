# Trafikverket: gemensam API-grund

Implementerar #20 ovanpå testgrunden #6. Det här är en serverklient, inte nya tågsvar eller kartlager. Kamerorna använder klienten redan; övriga adapterintegrationer tillkommer i #21–#23.

## Åtkomst och avgränsning

`TRAFIKVERKET_API_KEY` ligger i lokal ignorerad `.env`. Använd inget `VITE_`-prefix. Endast det fasta HTTPS-API:t `https://api.trafikinfo.trafikverket.se/v2/data.json` används, via XML POST och JSON-svar. HTTP-redirects accepteras inte. Ingen rå XML eller godtycklig värd kan skickas från browsern. Diagnostik finns på `GET /api/trafikverket/status`; den läser bara lokalt tillstånd, hämtar inga data och visar inga nycklar, frågevärden eller råa API-fel. POST och parametrar avvisas.

Registreringssidan anger [CC0 för informationen i det öppna trafikinformations-API:t](https://data.trafikverket.se/oauth2/Account/register). Appen behåller källnamnet Trafikverket. [Officiell API-information](https://www.trafikverket.se/e-tjanster/trafikverkets-oppna-api-for-trafikinformation/) beskriver åtkomst, datamodell och uppföljning av anropsvolym. Budgetarna nedan är våra egna skydd och ska inte presenteras som Trafikverkets eller hela kontots kvoter. API Järnväg med certifikat är en separat tjänst.

## Verifierade modeller

Begränsade livefrågor med `limit=1` gav HTTP 200 och modellens record-array 2026-10-11. Versionerna är accepterade i provet, inte ett påstående om senaste tillgängliga version. Tabellen visar exempel på observerade fält, inte hela schemat.

| Modell              | Version | Cache TTL | Max ålder för sista fungerande svar | Observerade fält                                                                                                         |
| ------------------- | ------- | --------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Camera              | 1       | 15 min    | 1 h                                 | Id, Name, Active, Deleted, Geometry, Direction, PhotoTime, PhotoUrl, ModifiedTime                                        |
| TrainAnnouncement   | 1.9     | 30 s      | 2 min                               | ActivityType, LocationSignature, AdvertisedTrainIdent, AdvertisedTimeAtLocation, Canceled, TrackAtLocation, ModifiedTime |
| TrainStation        | 1.4     | 24 h      | 7 dygn                              | LocationSignature, AdvertisedLocationName, CountryCode, Geometry, ModifiedTime                                           |
| WeatherObservation  | 2       | 5 min     | 15 min                              | Sample, Surface, Air, Wind, Measurepoint, ModifiedTime                                                                   |
| WeatherMeasurepoint | 2       | 24 h      | 7 dygn                              | Id, Name, Geometry, Observation, ModifiedTime                                                                            |
| RoadCondition       | 1.2     | 5 min     | 15 min                              | Id, ConditionText, Geometry, LocationText, RoadNumber, StartTime, ModifiedTime                                           |

**Kvar att verifiera:** TrainMessage 1.7/1.3 och Situation 1.5/1.2 avvisades i provet med HTTP 400 och `ObjectType ... does not exists`. De ingår därför inte i klientens tillåtna modellregister ännu. Detta bevisar inte att informationen saknas i alla Trafikverkets tjänster eller att nyckeln saknar rättigheter. #21 och #22 ska verifiera korrekt aktuell modell/åtkomst eller alternativ källa innan sådana meddelanden utlovas. Tågtiderna kan byggas med verifierad TrainAnnouncement; frånvaro av separat störningskälla är okänd information, inte störningsfri trafik.

## Frågor och budgets

`getTrafikverketClient().query({type, limit, include, filter})` använder ett delat klientobjekt. Exempel på intern serverfråga:

```js
const result = await getTrafikverketClient().query({
  type: 'TrainAnnouncement',
  limit: 100,
  include: [
    'LocationSignature',
    'AdvertisedTrainIdent',
    'AdvertisedTimeAtLocation',
    'Canceled',
    'TrackAtLocation',
    'ModifiedTime',
  ],
  filter: { op: 'EQ', field: 'LocationSignature', value: 'Sk' },
});
```

Filtren stödjer validerade jämförelser EQ/NE/GT/GTE/LT/LTE och grupper AND/OR. Gruppdjupet är högst 3 och antalet filter högst 32. Fältnamn är begränsade till enkla identifierare; värden XML-escapas. Okända egenskaper, otillåtna modeller, felaktiga limits och rå XML avvisas före nätverket. Filterfältens semantik verifieras i respektive adapter. Browsern erbjuds ingen generell frågeproxy.

Identiska kanoniska frågor delar samma pågående anrop. TTL gäller typ, filter, include och limit tillsammans; olika stations-/tidsurval får inte återanvända varandras svar. Framtida adaptrar bör använda stabila tidsfönster och snäva urval. Inkluderade fält och AND/OR-grupper sorteras för att undvika onödiga cachevarianter. Konsumenter får egna kopior av resultatet.

Standardgränser per klient i en serverprocess:

- 20 sekunders deadline för hela hämtningen, inklusive svarskroppen.
- 6 MiB avkodade svarsbytes, högst 64 nivåer och 500 000 värden i svarsträdet. Inga oändliga numeriska värden.
- 32 cacheposter och 32 MiB räknat som serialiserade records. Faktisk JavaScript-heap kan vara större.
- 4 samtidiga API-anrop, 60 API-anrop per minut och 5 000 per UTC-dygn.
- `TRAFIKVERKET_DAILY_REQUEST_BUDGET` kan ändra dygnsbudgeten; 0 stoppar nya anrop. Budgeten omfattar XML POST, inte kamerabildernas separata GET-hämtning.

Räknarna ligger i minnet och återställs vid omstart. De är inte kontoövergripande eller beständiga. Den befintliga kamerakatalogen cachas också i 15 minuter; klientens kamera-TTL följer detta. Den XML-baserade kataloghämtningen kan därmed normalt ligga kring 96 anrop/dygn vid kontinuerlig användning, medan bildhämtning styrs av CCTV:s befintliga bildpolicy. Det gemensamma kamerataket och regionsbegränsningar är separata från API-budgeten.

## Cache, fel och klockor

Svaret har `rows` och `metadata`. `rows=[]` är en bekräftat tom fråga; `rows=null` betyder att användbart svar saknas. `metadata.complete=false` när svarslängden når limit: resultatet kan vara begränsat och får inte beskrivas som hela trafikmängden. Klienten validerar transport, format och record-array; respektive adapter måste dessutom validera sina fält, enheter och geografiska uppgifter.

Status är fresh, cached, stale, unavailable eller unconfigured. Vid fel behålls sista fungerande svar högst till modellens maxålder. `fetchedAt` ändras inte när gammal data återanvänds. `refreshFailed`, `errorCode` och `retryAt` visar orsaken och backoff; råa svar/error-texter och hemligheter exponeras inte. Exponentiell backoff börjar på 30 sekunder och når högst 15 minuter. 429 och serverns Retry-After pausar även andra nya frågor i samma klient; Retry-After respekteras upp till 24 timmar. Inga automatiska täta återförsök körs i bakgrunden.

`fetchedAt` är serverns hämtningstid, `sourceUpdatedAt` är senaste tillgängliga ModifiedTime. Källans observationsklocka är PhotoTime för kameror och Sample för WeatherObservation. Övriga modeller har ingen antagen observationsklocka. Framtida avgångstid räknas aldrig som observation. Källklockor kräver ISO-tid med explicit zon; numeriska/missbildade/missing tider och tider mer än fem minuter i framtiden blir okända. Metadata räknar gamla, färska och okända observationer. Färsk API-hämtning bevisar alltså inte färska mätningar.

Kamerornas katalogtid och stale/refreshFailed/complete följer med till frontend. Panelen markerar äldre kamerakatalog när uppdatering inte kunde göras och markerar begränsat API-urval. PhotoTime förblir källans bildtidsuppgift och kan ligga efter bildproxyns senaste bildhämtning. Nyckelbyte tömmer klientcachen och äldre pågående generationer får inte publicera data.

## Verifiering

`npm run test:integrations` inkluderar klient-, status- och kamerafunktionens regressionsprover. De testar bland annat coalescing, isolerade kopior, tomt kontra okänt, timeout, byte/struktur/heapbudget, queryvalidering, credential-echo, schema-/API-fel, rate limit, nyckelbyte, klockor och begränsade resultat. Fixtures kräver inga riktiga nycklar. Unit discovery inkluderar testerna även i den breda sviten.

Liveprov efter koppling till klienten: 1 548 svenska kameror i appens katalog och HTTP 200 image/jpeg från bildproxyn. Status och katalog kontrollerades mot den lokala nyckeln för att säkerställa att den inte exponerades. Slutliga lokala/Actions-resultat registreras i issue #20 och PR:n. Fulla geografiska/tidsmässiga dataurval för tåg, väghändelser och vägväder ingår i kommande adaptrar, inte i dessa modellprover.

Tågstatus i reseförslagen beskrivs i [ODINS_TRAIN_STATUS.md](ODINS_TRAIN_STATUS.md), inklusive stödda nummerfält, matchning och status för framtida resor.
