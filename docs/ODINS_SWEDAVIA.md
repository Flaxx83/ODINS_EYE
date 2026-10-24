# Swedavia – verifierat underlag och pågående integration

Status 2026-10-24: **under arbete, inte färdig användarfunktion**.

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

## Kodutkast

`server/providers/swedavia-flights.js` innehåller ett första serverutkast
med datumfilter, normalisering och kort minnescache. En koppling till den
uttryckliga flygfrågan finns i `local-ai-tools.js`.
Klienten visar nu rapporterade tider och en separat kartknapp. Frågan
”När är flight SAS2844 framme på Arlanda?” söker ankomster för ARN och matchar
anropssignalen exakt mot Swedavias svar, utan att anta att SAS2844 alltid
motsvarar SK2844. Ett liveprov den 24 oktober gav SK2844 GZP–ARN med planerad
och beräknad ankomst. Samma fråga verifierades i webbläsaren med rapporterade
tider, källänk och separat kartknapp. Fixturetester täcker exakt matchning, fel, tomt resultat,
svensk datumgräns och cache. 39 AI-tester och produktionsbygget passerar.
Datumval, generell pagination och bredare datakvalitetsprov återstår; PR
förblir draft. Sökningen gäller dagens svenska datum.

## Återstående arbete i ordning

1. Verifiera querymodell, paginering, flygnummernormalisering och datumgränser
   med kontrollerade fixtures och ett begränsat liveprov.
2. Utöka fixturetester för inställt flyg,
   flera träffar och saknad anropssignal. Klientens befintliga exakta matchning
   ska bevaras; ett tidtabellsresultat får inte påstås vara en aktuell position.
3. Granska resultatlistan vid flera träffar och med längre källtexter.
4. Verifiera fel, avbrott och att inget gammalt kartresultat visas som nytt.
5. Kör integrationstester, bygge och relevanta modulgränskontroller; gör
   ett webbläsarprov. Uppdatera användarmanualen först när funktionen är verifierad.

Den privata datorn gör liveverifiering och lokal AI-koppling. Den andra datorn
kan senare hjälpa med fixtures efter överenskommen uppdelning; arbetet där
är ännu inte påbörjat.
