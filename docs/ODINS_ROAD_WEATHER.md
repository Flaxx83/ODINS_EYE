# Vägväder, väglag och kamerakoppling

Första leverans av #23, 2026-10-12. Slå på **Data Layers → Infrastructure → Trafikverket · Vägväder**. Cyan punkter har observation inom 30 minuter vid hämtning, grå punkter har gammal eller okänd mättid. Klick öppnar kort med väg-/lufttemperatur (°C), rapporterad nederbördskod, vind (m/s och grader, med mäthöjd), mättid och källstatus. Noll är ett värde; saknad uppgift blir Uppgift saknas.

## Källa och färskhet

Liveprov verifierade WeatherMeasurepoint v2 och RoadCondition v1.2. WeatherMeasurepoint innehåller både stationens Geometry.WGS84 och den senaste Observation. Geometrin läses bara från stationsposten; mätvärden läses bara från Observation. Historiska WeatherObservation-poster används inte som om de vore senaste mätning. Eftersom mätpunktssvaret innehåller senaste observation ändras dess cache till TTL 5 min / max gammal cache 15 min; Observation.Sample följs i gemensamma klientens metadata. Hämtningstid är inte mättid.

Stationer som är raderade eller har ogiltiga koordinater visas inte. Ogiltig/zonlös/future mättid markeras som okänd, och över 30 minuter som gammal. Temperatur eller vind som saknas ersätts inte med noll. Nederbörden visas som rapporterad kod, utan att omtolka en okänd kod till regn/snö. M/s omvandlas inte till km/h i denna leverans. Trafikverkets [VViS-dokumentation](https://bransch.trafikverket.se/contentassets/28744f2661f44c22b63b4042092fadfd/ersattningsmodell-vaders2019-vagklass-4-5-och-gc.pdf) redovisar temperatur i °C och vind i m/s.

## Kameror

En svensk kameraposition får knappen **Vägväder nära kameran** i CCTV-panelen. Förfrågan använder den valda kamerans publicerade lat/lon, inte kartans mitt. Närmaste station inom 30 km väljs och Haversine-avstånd visas tillsammans med mättiden. Stationen kan sakna färsk mätning; det döljs inte genom att välja en längre bort utan förklaring. Vid byte av kamera får ett gammalt svar inte öppna kort för den nya kameran. Ingen bakgrundshämtning per kamera införs: det är ett explicit knappanrop med gemensam cache.

Närliggande station representerar inte automatiskt kamerans exakta vägsträcka eller yta. En bild och en observation kan också ha olika tider.

## Rapporterat väglag

RoadCondition levererar ConditionText/ConditionInfo, väg och platsbeskrivning, rapporttid och rapporterad WGS84-linje. Bbox-urvalet använder linjens lagrade punkter; det är inte en full polygon-/linjeskärningsanalys. Vid plats-/kamerafråga tas rapporter med en lagrad linjepunkt inom 3 km med. Avståndet är punktbaserat och kan överskatta avståndet till ett glest segment. Rapport äldre än 6 h eller med okänd tid markeras; framtida start filtreras bort.

Rapporter i kartans urval visas som vägsträckerapporter, inte ett bekräftat väglag precis vid stationen. Rapporterat Normalt med exempelvis Våt/Torrt är källans beskrivning, inte vår garanterade halkbedömning. Ingen risk beräknas ur temperatur ensam. Uppgifterna används inte för automatisk omruttning.

## AI och begränsningar

Validerade verktyget road_weather återanvänder samma serverkälla. Exempel: Vad är vägtemperaturen i Skövde? Svaret visar närmaste station, avstånd från vald ort/kartpunkt, mättid, värden och närliggande rapporter med källor. En ortfråga använder den registrerade ortpunkten; avståndet kan därför skilja från den aktuella kartpositionen. Allmänt väder är fortfarande separat från vägväder. Röst prioriteras inte och lagret är explicit voice-off.

Stationer, vägsträckor och kamera positioneras separat. Automatisk utvärdering längs en faktisk resrutt ingår inte i denna leverans. Tätare geometrisk matchning och deduplicering av flera väglagsrapporter som gäller samma sträcka är fortsättning. Ingen garanti om fullständig eller uppdaterad täckning ges.

## Prov

Ett riktigt HTTP-prov runt lat 58.4/lon 13.85 gav 38 stationer i urvalet och Stensbordet som närmaste station cirka 6.0 km bort, med väg- och lufttemperatur, vind och mättid. En rapport för Väg 26 visade Normalt/fläckvis Våt/Torrt med egen rapporttid. Qwen/Bionic valde road_weather för vägtemperatur i Skövde. Dessa är tidsbundna provresultat.

175 integrationstester och 54 riktade katalog-/manifest-/markup-prov passerade. Webbläsarprov med märkta fixtures verifierade nollvärde, saknad uppgift, gammal observation, kameraavstånd och stängning. Katalog/boundaries/build kontrollerade; GitHub-CI inväntas. Ett separat CCTV-fixtureprov verifierade knappens valda kamerakoordinater och spärr efter panelens disposal. Full fysisk kamerafelsökning över flera olika stationer är inte verifierad i denna etapp.
