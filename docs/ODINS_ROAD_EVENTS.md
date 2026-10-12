# Väghändelser från Trafikverket

Implementerad första etapp av #22, 2026-10-12. Lager: **Data Layers → Infrastructure → Trafikverket · Väghändelser**. Slå på och zooma in över Sverige. Punkten är Trafikverkets rapporterade visningspunkt, inte en ritad händelseutbredning. Klick visar beskrivning, berörd väg, rapporterad påverkan, övergripande start/slut, ändringstid, hämtningstid och källstatus. Överlappande poster nära samma punkt kan väljas i kortets lista.

## Verifierad källa

Den tidigare planerade Situation-modellen i JSON-API:t svarade ObjectType does not exists på anslutningen. Ingen allmän avvecklingstid härleds från det felet. Aktuell anslutning har verifierats med riktiga svar från Trafikverkets DATEX II 3.1:

- `/v2/datex2/3.1/roadworks/sit:situation`
- `/v2/datex2/3.1/accident/sit:situation`
- `/v2/datex2/3.1/trafficmessage/sit:situation`

Alla anrop går till `https://api.trafikinfo.trafikverket.se`, serverlokalt med befintlig TRAFIKVERKET_API_KEY. Nyckeln finns inte i browseranrop, metadata eller källstatus. URL med authenticationkey får inte loggas. [Trafikverkets introduktion](https://www.trafikverket.se/e-tjanster/hamta-data-fran-trafikverket/) beskriver DATEX som väginformation i XML.

Vägarbeten, olyckor och trafikmeddelanden normaliseras; avstängning/kö klassificeras från rapporterad recordtyp och svensk beskrivning. Detta är ett urval ur tre produkter, inte alla Trafikverkets trafikprodukter eller komplett information om stadens köer. Flera record-ID:n kan tillhöra samma situation. Antalet är därför poster, inte säkert antal separata incidenter.

## Transport, cache och geografi

Den gemensamma Trafikverksklienten hanterar även de fasta DATEX-flödena: samma nyckelhantering, dag-/minutbudget, samtidig hämtgräns, retry/cooldown och källstatus. En ny serveradapter behövdes för XML-formatet; ingen godtycklig upstream-URL eller rå XML accepteras från browsern.

Nationella feed-snapshots hämtas högst när cache behöver förnyas: TTL 5 min, sista fungerande snapshot högst 15 min och markerad stale. Browsern uppdaterar vid kamerarörelse och med lagrets intervall 60 s; även cacheträff filtreras mot dagens tid. Bbox filtreras på servern före browserleverans, max 500 poster. Cache begränsas av gemensamma klientens 32 MB/32 nycklar. Stora råa DATEX-svar tillåts upp till 64 MiB per feed och normaliseras med SAX-parser; rå XML sparas inte i cache. Före större drift måste den faktiska feedstorleken/bandbredden beaktas. Sax-parsern är fastlåst i package-lock; DTD och felaktigt XML avvisas. Högst 20 000 records accepteras per feed.

Gräns för frågeområde: högst 30 längdgrader och 20 breddgrader, giltiga WGS84-koordinater. Okända browserparametrar avvisas. Tomt svar skiljs från otillgänglig källa. Källa som saknas/gammal cache redovisas; saknad källa ersätts inte med påhittade data. Geografin begränsar det levererade urvalet, inte upstream-snapshotens nationella omfattning.

## Giltighet och geometri

Nyaste ändring/version per record-ID ersätter äldre uppdateringar. Utgångna, framtida och suspended-poster ritas inte. Källmarkerade testposter visas inte som verkliga händelser. Starttid måste ha explicit tidszon. Poster med saknad/ogiltig visningspunkt ritas inte; summeringen av saknad geometri/okänd tid gäller hela hämtade underlaget, inte säkert det valda området.

Återkommande/detaljerade tidsperioder detekteras och märks i kortet. Första etappen utvärderar inte alla delperioder. En post inom övergripande giltighet är därför inte ett bevis för att arbetet pågår just nu. Senast ändrad är inte samma sak som hämtad, och en gammal ändringstid betyder inte att ett flerårigt vägarbete automatiskt är inaktuellt.

Punktkoordinater får inte användas som verifierad väg- eller resgeometri. Första etappen visar ingen automatisk resepåverkan, ingen uppskattad försening och ingen omruttning. Ingen sådan påverkan härleds enbart från närhet. Resekoppling med faktisk geometri är separat fortsättning.

## AI

`road_events` är ett validerat verktyg för vägarbeten, trafikolyckor, avstängningar och kömeddelanden. `traffic_status` avser fortsatt kollektivtrafikens avgångar. AI-verktyget återanvänder `/api/road-events` och visar ett bbox-urval ungefär 50 km runt vald ort/kartposition, högst 20 poster i textsvar, med källa, status och uttrycklig begränsning. Verktyget ger strukturerade källsvar, inte fritt genererade trafikfakta. Lagret har ingen OpenAI-röstadapter ännu och är uttryckligen voice-off i manifestet.

## Verifiering och kvarstående arbete

Riktiga HTTP-svar gav 293 poster i bbox 12,57,14,59 och alla tre feeds tillgängliga. Detta är ett tidsbundet provresultat. Riktigt Qwen/Bionic-prov med vägarbeten i Skövde valde road_events. Kartlagret gav 63 poster i ett webbläsarprov runt Skövde. Ett separat UI-prov med markerad fixture verifierade native pointer-pick, informationskort, varning för återkommande tider, attribution, stängning och disposal.

Offlineprov täcker XML/DTD, namespaces, slut/start/suspended, saknad zon, ogiltig geometri, deduplicering, överlappande rapporter, gamla/otillgängliga feeds och gemensam cache/budget. Totalt 170 integrationstester efter tillskotten. Paketgränser och build kontrolleras. Kvar: komplett delperiodstolkning, geometribaserad reseanknytning och vidare täckningsanalys för köer/avstängningar. Issue #22 hålls därför öppen för dessa uttryckliga delar.
