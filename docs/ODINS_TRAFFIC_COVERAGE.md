# Trafikläge: urval, prognoser och dubbletter

Implementation för issue #5. Trafiksvaret bygger på hämtade avgångar från SL/Trafiklab och Västtrafiks reseplanerings-API; en lokal språkmodell beräknar inte antalen.

## Urval och räkneenhet

- Angiven entydig ort styr centrum; annars används kartpositionen. Centrum och koordinater skrivs ut. Okänd/tvetydig ort ger ett förtydligande, inte ett tyst urval vid kartan.
- Högst fem närliggande hållplatsområden inom 10 km; vid angivet hållplatsnamn högst tre. Västtrafiks egen platskatalog används. Katalogen och urvalet är inte fullständiga stadsinventeringar.
- Gemensamt tidsfönster: kommande 60 minuter, slutpunkten exkluderad. Aktuell jämförbar prognos styr fönstret; annars används planerad tid. Svaret visar svensk lokal tid; strukturerade tidsstämplar är ISO/UTC.
- Enheten är **unika hållplatsavgångar**, inte unika fordon. Identitet: leverantör, tur, trafikdatum när tillgängligt, hållplats och planerad tidsstämpel. Samma tur vid två hållplatser är två avgångar; plattformsbyte skapar ingen extra avgång.
- Buss och spårvagn tillsammans betyder båda färdsätten. SL-urvalet filtrerar bort andra operatörer på gemensamma hållplatser.

## Status och datatäckning

Mer än 60 sekunder efter planerad tid räknas som sen; mer än 60 sekunder före räknas som tidig. Inom ±60 sekunder enligt jämförbar prognos redovisas separat. Inställda och okända redovisas separat.

SL kräver `is_realtime=true` och giltiga planerade/prognostiserade tider. Ett återfyllt tidtabellsvärde med `is_realtime=false` är okänt, även om delay är noll. Motstridigt delay och tidsskillnad är okänt.

Västtrafik använder explicit `estimatedTime` vid hållplatsen, aldrig fallbackfältet `estimatedOtherwisePlannedTime`. Ett liveprov innehöll giltig explicit prognos trots `line.isRealtimeJourney=false`; linjeflaggan används därför inte som ensam spärr för hållplatsprognosen. Prognosen är ingen bekräftelse på GPS-position eller en känd observationstid.

Motstridiga dubbletter blir okända utan att ordningen väljer ett värde. Gammalt underlag (över 120 sekunder enligt tillgängliga hämt-/svarstider), tidsstämplar för långt fram och för lång hämtning får okänd status. Hämtningstid, källsvarets skapandetid och observationstid är olika begrepp. Saknad observationstid ersätts inte med hämtningstiden.

`trafficSummary` innehåller totalsummor, tidsfönster, tröskel, enhet, centrum, urvalsgräns, tavlor och täckningsräknare. Där redovisas hämtfel, tomma/gamla/begränsade tavlor, ogiltiga/uteslutna rader, rader utanför tidsfönstret, dubbletter och konflikter. Status är `sample`, `partial` eller `unavailable`; ingen status påstår full stadstäckning.

En korrekt hämtad tom tavla kan ge noll **i urvalet**. Om samtliga hämtningar misslyckas eller underlaget enbart är ogiltigt/gammalt utan identifierade avgångar blir count/totals null. Fel blir aldrig ett påstående om noll förseningar. Västtrafiks 30-radsgräns eller nästa sida markerar begränsad tavla; alla sidor hämtas inte automatiskt.

Trafiklab-proxyn bevarar `gev.fetchedAt` från den faktiska uppströmshämtningen även vid cacheträff. Källfotens tid använder den klockan, inte frågans tid. API-nycklar hålls på servern och skrivs inte ut i trafiksvaret.

## Verifiering 2026-10-12

- 90 integrationstester passerade, varav 16 nya fall för identitet, dubbletter, konflikter, tidsfönster, falsk realtime, gamla/felaktiga svar, urval, API-begränsning och bevarad cacheklocka.
- Live Göteborg: fem hållplatsområden, 122 buss-/spårvagnsavgångar, tre begränsade tavlor, status partial. Antal är provets ögonblicksbild.
- Live Stockholm: fem hållplatsområden, 25 bussavgångar, varav 16 okända prognoser; status sample. Okända tolkades inte som i tid.
- Det faktiska `/api/local-ai` gav HTTP 200 och strukturerat trafikläge för båda städerna med kartcentrum i en annan region.
- Produktionsbygge, formatering och paketgränser passerade lokalt. GitHub-CI redovisas i PR och issue när körningen är klar.

Källa och API-kontrakt: [Trafiklab Timetables](https://www.trafiklab.se/api/our-apis/trafiklab-realtime-apis/timetables/) och [Västtrafiks utvecklarportal](https://developer.vasttrafik.se/). SL-svar anger attributionen data från Trafiklab.se.

Framtida/historisk trafikstatistik, hela stadens fordonsantal och full paginering ingår inte. Vid anropstak redovisas begränsningen. Datumtolkning och samtalskontext fortsätter i #4 och #1.
