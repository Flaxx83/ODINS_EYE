# Swedavia FlightInfo i lokal AI

Status 2026-10-25: implementerad och lokalt verifierad, klar för granskning i
PR #61. Ändringarna är ännu inte sammanfogade med `main`.

## Verifierat

FlightInfo Free-prenumerationen gav HTTP 200 vid ett manuellt provanrop för
Landvetters avgångar den 24 oktober 2026: 71 poster. En separat query för
SK1439 gav bland annat anropssignalen SAS87T. SK7714 gav tomt resultat i det
provade datumurvalet. Tom träff betyder inte att flyget är inställt eller
saknas utanför Swedavias täckning.

API kräver både `Accept: application/json` och prenumerationsnyckeln i
`Ocp-Apim-Subscription-Key`. Servernyckeln lagras endast i ignorerad lokal
konfiguration som `SWEDAVIA_FLIGHTINFO_KEY`. Ingen hemlighet ingår här.
AirportInfo och WaitTime har aktiva prenumerationer enligt användarens bild,
men deras åtkomst eller integration har inte verifierats med provanrop.

Källor: [portal](https://apideveloper.swedavia.se/),
[FlightInfo-modell](https://apideveloper.swedavia.se/content/Using_the_FlightInfo_API.pdf),
[åtkomst och kvoter](https://apideveloper.swedavia.se/faq).

## Funktion och avgränsning

`server/providers/swedavia-flights.js` hämtar serverägda frågor till FlightInfo.
Frågan kan innehålla idag, imorgon, i övermorgon, igår, ISO-datum, dag/månad
eller svenskt månadsnamn. Svensk kalenderdag används även vid UTC-dygnsskifte
och sommar-/vintertidsbyte. Motstridiga, ogiltiga och oprecisa datum ger en
förtydligandefråga före API-anrop. Sökområdet är -7 till +90 dagar från idag;
leverantörens verkliga täckning kan vara kortare.

Arlanda/ARN och Landvetter/GOT kan avgränsa frågan. Ankomst och avgång filtreras
separat. Flygnummer med inledande nollor normaliseras, men ett IATA-prefix
översätts inte på gissning till en anropssignal. Anropssignaler matchas exakt
mot källans poster. Framtida anropssignaler kan saknas; använd gärna flygnumret.

Klienten visar planerad, beräknad och faktisk tid i svensk tid med källänk
och hämtningstid. CAN visas som **Inställt**, en gammal uppskattning visas
då inte som aktuell och ingen kartknapp erbjuds. Vid flera träffar öppnar
användaren respektive daterad post; inget plan väljs automatiskt. Kartknappen
finns bara för dagens, ej inställda poster med anropssignal och söker separat
i flyglagrets aktuella observationer. Den bekräftar inte flygstatus.

Cache är per datum, identifierare, riktning och flygplats, högst 64 poster
i 60 sekunder. Källfel cachas inte som tomma träffar. Fulla sidor om 1000 poster
följs med URL-kodad continuationtoken, högst fem sidor och 30 sekunders total
hämttid (högst 12 sekunder per anrop). Saknad/upprepad token eller överskriden
gräns ger fel i stället för ett påstått komplett resultat. Slutposter dedupliceras.

## Verifiering och begränsningar

212 integrationstester, produktionsbygget och modulgränser passerar.
Fixturetester i `swedavia-flights.test.mjs` täcker datum, DST/årsskifte,
inställt flyg, flera träffar, cache, pagination och flygnummer. Befintliga
AI-tester täcker källfel, tomma svar och exakt anropssignal. Webbläsarprovet
`node scripts/qa-swedavia.mjs --url http://127.0.0.1:4173` verifierar flera
val, inställt flyg, framtidsbegränsning, nytt resultat, källänk och mobilbredd.
Det kräver en lokal Vite-server och ersätter FlightInfo-svaren med fixtures.

Liveprov 25 oktober gav olika daterade poster för SK1439 idag och imorgon.
Ett tillfälligt källfel vid ett av proven visades som fel; ett senare försök
lyckades. Proven är stickprov, inte garanti för alla flyg eller datum.
Swedavia täcker deras flygplatser, inte hela SAS-nätet. Saknade uppgifter
är okända, inte en bekräftelse på inställelse eller frånvaro. Fria sökningar
efter alla flygbolag, bokning och hela världens flygplatser ingår inte.

Den privata datorn gör liveverifiering och lokal AI-koppling. Den andra datorn
kan senare hjälpa med fixtures efter överenskommen uppdelning; arbetet där
är ännu inte påbörjat.
