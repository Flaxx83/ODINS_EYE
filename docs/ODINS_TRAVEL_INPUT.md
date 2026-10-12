# Resefrågor: datum, avgång och ankomst

Implementation för #4. Validering sker före plats- och reseanrop. Valt trafiknät styr även tidsangivna resor: Hela Sverige använder ResRobot, SL använder ResRobot med SL-urval, Västtrafik använder sitt eget API. Datum tvingar inte längre en Västtrafikresa över till nationell sökning.

## Exempel

- Jag vill resa från Brunnsparken i Göteborg till Järntorget i Göteborg imorgon och vara framme kl 09:00.
- Jag vill resa från Slussen i Stockholm till Stockholm Centralstation den 13 oktober 2026, ankomst kl 09:00.
- Jag vill resa från A till B 2026-10-13 kl 07:00.
- Jag vill resa från A till B på tisdag kl 07:00.
- Jag vill resa från A till B imorgon halv åtta på morgonen.

Klockslag utan ankomstuttryck gäller avgång. Ankomst anges med exempelvis ankomst, vara framme eller senast kl. ResRobot får searchForArrival=1; Västtrafik får dateTimeRelatesTo=arrival med den validerade tidpunkten. Svaret skriver ut sökt avsikt, datum och svensk lokal tid. Det är sökkriteriet, inte en garanti för att prognoserna håller ankomsttiden.

## Kalender och förtydliganden

- Datum: ÅÅÅÅ-MM-DD, D/M med valfritt fyrsiffrigt år, samt svenska månadsnamn. Datum utan år gäller innevarande år; år flyttas inte tyst fram.
- Idag, imorgon och i övermorgon utgår från kalendern i Europe/Stockholm. Veckodag gäller nästa förekomst inklusive idag. Nästa veckodag gäller följande kalendervecka, måndag–söndag; skriv exakt datum om annan betydelse avses.
- Datum eller ankomstavsikt kräver också klockslag. Saknat klockslag blir inte automatiskt aktuell tid nästa dag. Utan datum/tid gäller avgång nu.
- Svenska hela timmar, HH:MM/HH.MM, halv, kvart i/över och morgon/kväll stöds. Halv/kvart utan del av dygnet kräver förtydligande. Motstridiga datum, tider eller avgång/ankomst blandas inte.
- Ogiltiga kalenderdatum, passerade tidpunkter och tvetydiga/obefintliga tider vid sommar-/vintertidsbyte stoppas med förtydligande. Appens endpoint svarar HTTP 200 med needsClarification för dessa indatafel; inget rese-API anropas.
- Tidsuttryck kan stå före eller efter resvägen. Inklistrade radbrytningar och osynliga blanksteg normaliseras. Adress 11A och 11 A behandlas lika; 110 eller 11B väljs inte istället.
- Kommunangivelse kan matchas även när hållplatsnamnet har en mellanliggande trafikslagstext. Flera platsmatchningar kräver ett explicit val. Ett gammalt/felaktigt valt ID ersätts inte automatiskt med en annan plats.
- När användaren väljer bland platser behålls explicit datum, tid och avgång/ankomst i en fullständig fråga. Imorgon räknas inte om efter midnatt under platsvalet. Sökning utan klockslag gäller aktuell tid när valet skickas.
- Följdfrågor som Och imorgon kl 07? kräver att hela resvägen anges igen. Automatisk samtalskontext återstår i #1.

API:ernas tidtabellsperiod begränsar möjliga framtida datum. API-fel eller tomma förslag ger inga påhittade resor. Geometritäckning följs separat i #3/#30.

## Verifiering

111 integrationstester passerade, med 25 tids-/reseindatafall (20 nya) för kalender, avsikt, båda adapterparametrarna, adresser, platsval och förtydliganden. Västtrafiks riktiga API accepterade ankomstsökning och koordinatparametrar; ogiltigt dateTimeRelatesTo gav HTTP 400, utan tyst fallback. Liveprov via appens endpoint omfattar framtida ankomstresa och DST-förtydligande. Slutliga CI-resultat redovisas i issue och PR.

ResRobot-kontraktet beskrivs i [Trafiklabs dokumentation](https://www.trafiklab.se/api/our-apis/resrobot-v21/route-planner/). Västtrafiks parameteranvändning verifierades mot dess autentiserade API; nycklar hålls på servern.

## Gatunamn utan husnummer (2026-10-12)

Gatunamn som Lillegårdsvägen i Skövde söks även som adress utan husnummer. Gatunamn och kommun måste matcha; en tidigare angiven bostad eller ett godtyckligt husnummer återanvänds inte. Resan använder gatupunkten som källan rapporterar och svaret anger att husnummer saknas.

Den exakta frågan Brunnsparken i Göteborg–Lillegårdsvägen i Skövde, ankomst imorgon kl 09:00, gav tre förslag via appens endpoint med både Västtrafik och Hela Sverige. 113 integrationstester passerade, inklusive regressioner för gatunamn utan nummer, fel kommun, fel gatunamn och koordinater i ankomstsökning.
