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
Detta utkast ska inte betraktas som klart: klienten visar ännu inte
`flightResults`, nya datakällan saknar egna fixturetester och hela flödet
har inte verifierats i webbläsaren. PR ska därför förbli draft.

## Återstående arbete i ordning

1. Verifiera querymodell, paginering, flygnummernormalisering och datumgränser
   med kontrollerade fixtures och ett begränsat liveprov.
2. Lägg till fixturetester för lyckad/tom sökning, fel, tidszon, inställt flyg,
   flera träffar och saknad anropssignal. Klientens befintliga exakta matchning
   ska bevaras; ett tidtabellsresultat får inte påstås vara en aktuell position.
3. Visa tydliga resultat i AI-panelen med källtid, planerad/beräknad/faktisk tid,
   status och valbar kartknapp för anropssignal. Låt användaren välja vid flera träffar.
4. Verifiera fel, avbrott och att inget gammalt kartresultat visas som nytt.
5. Kör integrationstester, bygge och relevanta modulgränskontroller; gör
   ett webbläsarprov. Uppdatera användarmanualen först när funktionen är verifierad.

Den privata datorn gör liveverifiering och lokal AI-koppling. Den andra datorn
kan senare hjälpa med fixtures efter överenskommen uppdelning; arbetet där
är ännu inte påbörjat.
