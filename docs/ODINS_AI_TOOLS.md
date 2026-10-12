# Validerade AI-verktyg och samtalskontext

Issue #1. Implementerat på `codex/validated-ai-tools`, inväntar granskning. Modellen väljer ett tillåtet verktyg genom ett strukturerat JSON-svar. Servern validerar och kör anropet; källornas formatterare skriver sakuppgifterna. Ingen andra fri modelltext används som källa för avgångar, förseningar eller mätvärden.

## Verktyg

| Verktyg | Underlag och avgränsning |
| --- | --- |
| `plan_trip` | Västtrafik eller ResRobot enligt valt trafiknät. Befintlig tåginformation från Trafikverket och geometri återanvänds. Explicit tåg/spårvagn filtrerar bort andra och okända färdsätt. |
| `traffic_status` | Befintligt begränsat hållplatsavgångsurval för SL/Västtrafik. Hela stadens fordon ingår inte. Källa, hämtning, gammalt underlag och okänd prognos följer #5. |
| `police_events` | Publicerade preliminära polisnotiser inom 50 km, högst 20 i svaret. Inte alla händelser eller exakta händelseplatser. |
| `air_quality` | EEA-stationsmätningar inom 50 km, högst 30 serier. Mättid och äldre underlag redovisas; ingen generell riskklassning eller väderprognos. |
| `navigate` | Exakt, entydig matchning i det lokala ortregistret. Modellen får inte leverera koordinater. |

Flyg, fartyg, kameror, väder och kommande Trafikverkslager har ännu inga egna AI-verktyg. Verktygskatalogen ska utökas tillsammans med respektive datatjänst. Frågor utan verktyg får ett besked om stöd/ett förtydligande, inga fria faktasvar.

## Konversation och datum

Webbläsaren får ett slumpmässigt samtals-ID. Servern lagrar högst sex tidigare användarmeddelanden, totalt högst 6 000 tecken, och validerade researgument. Inga tidigare källsvar matas tillbaka som aktuella fakta. Samtalet löper ut efter 30 minuter utan anrop; högst 64 samtal behålls. Minnet är tillfälligt, inte en databas eller sparad chatthistorik.

Exempel: först en resa Göteborg central–Vällingby imorgon 07:00, sedan ”Och vara framme kl 09:00 istället” och ”Och kl 08:30 istället”. Start/resmål och datum behålls; den sista frågan gäller fortfarande ankomst. Relativa datum fryses till kalenderdatum i Europe/Stockholm. En ny fullständig resväg använder den nya frågans tid. Ogiltig tid behöver förtydligas och får inte skriva över tidigare giltig tid.

Datum och klockslag är serverns ansvar, inte verktygsargument som modellen får hitta på. Inklistrade texter, ankomst/avgång och byte till sommar-/vintertid använder #4:s validering. Platser måste kunna kopieras ur användartext eller servervaliderat minne. En ny fullständig resa får inte hämta andra platser ur en äldre fråga. Saknade/tvetydiga hållplatser och adresser behöver fortfarande väljas av användaren.

Knappen **Nytt samtal** tar bort den aktuella kopplingen i panelen och rensar svar, val och resväg. Byte av trafiknät rensar serverns gamla resekontext och platsval. Av-/påslag av AI-lagret börjar också ett nytt samtal. Kartpositionen skickas på nytt för varje fråga. Platsval får bara använda ID:n från senaste servergenererade valet i samma samtal.

## Anropsbudget och validering

- Endast fem namngivna verktyg och exakta argumentfält tillåts. URL:er, koordinater, extra argument, okända verktyg, dubbletter och fria svar avvisas före källanrop.
- Högst tre olika verktyg per fråga; resa/navigering körs ensamt. Modellens förtydligande är en kod som servern översätter till en fast svensk fråga.
- Högst sex anrop per samtal/minut och 20 totalt/minut. Högst tre samtidiga frågor, endast en per samtal. Befintliga leverantörers cache och tidsgränser fortsätter gälla. Gränserna gäller per serverprocess och är inte en distribuerad kvotlösning.
- Ett lokalt modellanrop per fråga, ingen obegränsad agentloop eller automatisk modellreparation. Lokalt API på port 1235, modellen `qwen3.5-4b`, svar högst 1 000 token, 60 sekunders tidsgräns och 24 000 bytes för modellsvaret. HTTP-frågan kräver JSON och högst 16 000 tecken/2 000 tecken användartext.
- Den installerade Bionic-versionen svarade på `reasoning_effort: none` med noll resonemangstoken. Bara `chat_template_kwargs` gav tomt slutsvar när resonemanget tog hela tokenbudgeten. Ingen ändring av användarens modellinstallation gjordes.
- Fel i källhämtning blir okänt läge, aldrig noll förseningar. Råa fel, nycklar och godtyckliga källinstruktioner returneras inte genom den nya orkestreringen.

Modellen kan fortfarande välja fel verktyg för en ovanlig formulering. Validering och källstyrda svar begränsar konsekvensen; detta är inte ett löfte om perfekt språkförståelse. Ett ogiltigt verktygsval ger ett tydligt förtydligande, ingen reservväg med påhittade fakta.

## Verifiering 2026-10-12

18 nya offlineprov täcker verktygsval, argument/proveniens, tidigare datum/ankomst, samtalsisolering och utgång, nätbyte, platsval, kvot/samtidighet, källfel, begränsat modellsvar och explicit färdsätt. Totalt 143 integrationstester och tre installationsprov passerar lokalt. Bygge, formatering och paketgränser verifieras också.

`npm run qa:ai` kräver Bionic på port 1235 och återkör sju frågor mot den riktiga modellen. Det prövar verktygsval/validering, inte live-avgångar, och körs inte i vanlig CI. Extra liveprov kontrollerade unsupported väderfråga och byte från trafik till luftfråga. Följdfrågekedjan ovan provades mot den riktiga modellen och en tydligt simulerad datatjänst.

HTTP-prov med riktiga källor: Brunnsparken i Göteborg till Lillegårdsvägen i Skövde imorgon, framme 09:00 gav tre ResRobot-förslag med korrekt ankomstsökning. Gatupunkt märktes utan husnummer/vald entré. Kartnavigering till Skövde provades via HTTP. Ett isolerat webbläsarprov med markerade testsvar verifierade samtals-ID, nätval och Nytt samtal. Provresultaten är snapshots, inte ett löfte om samma framtida tidtabell.

## Bevarade adresser i resefrågor (2026-10-12)

En uttrycklig ”Jag bor på … i …”-adress behålls nu som startpunkt när modellen förkortar den till kommunen. En uttrycklig ”från …”-start går före en hemadress som nämns som bakgrund. Kompletta start-/resmålsnamn i en resväg skyddas också mot förkortning. Två uttryckliga hemadresser behöver förtydligas. Gatunamn utan husnummer behålls utan att lägga till en tidigare bostad.

”Jag behöver vara Vällingby Centrum imorgon vid 11-tiden. Jag bor på Lillegårdsvägen 11 A i Skövde.” ger startadressens koordinater och ankomst senast 2026-10-13 kl 11:00. ”Behöver vara [plats]” är ankomst, inte avgång. Följdfrågor behåller den fullständiga adressen och ankomsttypen.

Ett enda matchat alternativ visas som fast text i panelen; bara tvetydiga startpunkter/resmål får rullista. Vällingby Centrum har fortfarande flera möjliga resmål i det befintliga registret. Ingen automatisk gissning på T-bana eller geografiskt centrum införs. Exakt startadress betyder inte att närmaste hållplats alltid används: koordinaterna lämnas till reseplaneraren, som skapar gång- och kollektivtrafiketapper enligt sitt underlag.

Sex nya offlineprov; totalt 149 integrationstester. Riktigt HTTP-prov matchade Lillegårdsvägen 11 A exakt som koordinat. Efter explicit provval av Vällingby T-bana returnerade ResRobot tre resor; första förslaget började med gång till Norrmalms köpcentrum. Detta är ett tidtabellsprov, inte bevis på att alla närliggande hållplatser ingår i källans sökning. Isolerat UI-prov med märkta testsvar verifierade en fast startadress, endast resmålsrullista och att adressens koordinat-ID skickades oförändrat.
