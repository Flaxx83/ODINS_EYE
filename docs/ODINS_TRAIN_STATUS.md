# Tågtider och störningar i reseförslag

Trafikverkets TrainStation 1.4 och TrainAnnouncement 1.9 kompletterar befintliga SL-, Västtrafik- och ResRobot-resor. Reseplaneraren behåller ansvaret för reseförslag och geometri. Informationen används direkt i serverns reseflöde, utan ett fritt modellstyrt verktygsanrop.

## Matchning

ResRobot `Product.num` är verifierat som annonserat tågnummer. Stationens namn normaliseras för central/centralstation/resecentrum/station, parenteser och kommun efter komma. När koordinater finns krävs också närhet inom 1,5 km till Trafikverkets station. Flera olika stationssignaturer är tvetydiga och väljs inte automatiskt.

Västtrafiks `serviceJourney.number` och gid är inte annonserat tågnummer. Ett uttryckligt `trainNumber` kan användas. Ett liveprov för SJ Regional verifierade `line.designation=157` mot detaljsvarets tågbeteckning, medan serviceJourney.number var 1. Den numeriska designation-reserven används därför bara för SJ med transportSubMode regionaltrain. Övriga Västtrafiktåg utan ett verifierat nummerfält får okänd status; inget nummer gissas från linje eller gid.

Avgång och ankomst matchas var för sig med stationssignatur, annonserat tågnummer, Avgang/Ankomst och planerad tid inom ±60 sekunder. ResRobot-tid tolkas i Europe/Stockholm, även över midnatt. Icke-existerande och tvetydiga lokala tider vid sommartidsomställning blir okända. Flera olika ActivityId-träffar ger tvetydigt tåg. Revisioner med samma ActivityId samordnas. Om båda posterna har trafikdatum måste det stämma; en ankomst efter midnatt kan tillhöra föregående trafikdatum. Saknat trafikdatum visas som null och är inte ett antaget datum.

## Status och källor

Planerad, beräknad och faktisk tid hålls separat. Felaktiga kalenderdatum ignoreras utan datum-normalisering. Faktisk tid i framtiden ignoreras; beräknad/faktisk tid mer än 48 timmar från den planerade händelsen behandlas som saknad uppgift. Avvikelse mer än en minut blir sen/tidig; en uttrycklig beräknad eller faktisk tid inom en minut kan visas som i tid enligt uppgiften. Saknad prognos betyder aldrig i tid. Inställt, spår, preliminär prognos och Deviation.Description visas när fälten finns. Saknade värden visas som Uppgift saknas.

Endast tågetapper berikas: buss, spårvagn, tunnelbana och gång får inte dessa statusvärden. Källans ModifiedTime redovisas separat från fetchedAt. En gammal klientcache, gammal stationskatalog eller saknad/felaktig/mer än sex timmar gammal ModifiedTime får inte beskrivas som färsk trafikstatus. Äldre rapporterad inställning visas uttryckligen som äldre information med okänd aktuell status.

Aktuell status hämtas endast för ändpunkter inom sex timmar före/efter serverns aktuella klocka. Framtida resor utanför fönstret får planerade tider och okänd aktuell status. Detta är en konservativ produktpolicy, inte ett påstående om API:ts fulla tidshorisont. Trafikmeddelanden kan fortfarande ändras innan resan.

Klienten från #20 används med högst 19 faktiska adapterfrågor per reseanrop (stationsfråga plus högst 18 tågfrågor). Identiska ändpunkter delas mellan förslag. Berikningen har en gemensam tidsgräns på 25 sekunder; källfel får inte ta bort reseförslaget. Högst tre förslag och 24 etapper per förslag berikas. Övrig routing har sina befintliga separata tidsgränser.

Resultatet innehåller `trainStatus[förslagsindex]`, med ursprungligt legIndex, tågnummer, ändpunkter och separata departure/arrival-resultat. Okänt, tvetydigt, begränsat, stale och source_unavailable hålls skilda från en bekräftad prognos. Källa anges som Trafikverket · tågannonsering, eller stationsregister när endast den frågan gav ett användbart svar. Källfotens tid kommer från verklig fetchedAt (även vid cache); ingen hämtningstid skapas för framtida resor utan anrop eller för en helt otillgänglig källa. Återgivningen i AI-panelen är vanlig text inom befintligt designspråk.

## Separata trafikmeddelanden

TrainMessage 1.7 och 1.3 accepterades inte av endpointen i modellproverna för #20. Ingen separat TrainMessage-integration utlovas. Den här leveransen använder rapporterade avvikelser som finns på den matchade TrainAnnouncement-posten. Den innebär inte att alla störningar är täckta. Fortsatt utredning av separat officiell meddelandekälla krävs innan den kan läggas till.

## Verifiering

`npm run test:integrations` innehåller fixtures för Skövde–Stockholm, Göteborg–Stockholm, försening, inställt, midnatt, sommartid, saknad prognos, gammal data, tvetydighet, konflikter i trafikdatum, felaktigt tågnummersfält, begränsade svar, anropsbudget och hängande källa. 73 integrationsprov passerade lokalt.

Liveprov 2026-10-12: stationsfrågan gav 719 annonserade stationer utan limit-trunkering. ResRobot Göteborg–Stockholm matchade båda ändpunkterna för tåg 426 och returnerade beräknade förseningar, spår och preliminära avvikelser. Det kompletta `/api/local-ai`-flödet returnerade HTTP 200, tre reseförslag, tågstatus och separata tider i svarstexten. Detta är ett tidsbundet verifieringsprov, inte en beständig trafikutskrift. Slutliga CI-resultat registreras i issue #21 och PR:n.

Se även [API-grund, licens och cachepolicy](ODINS_TRAFIKVERKET.md) och [Trafikverkets officiella API-information](https://www.trafikverket.se/e-tjanster/trafikverkets-oppna-api-for-trafikinformation/).
