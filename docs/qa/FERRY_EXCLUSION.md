# Verifiering av strikt färjeuteslutning – #56

2026-10-18. Körning med projektets installerade pyvalhalla och aktivt underlag
`sweden-20261012-v1`. Inga produktionsinställningar eller kartdata ändrades.

## Resultat

| Prov | Standard | use_ferry=0 | exclude_ferries=true |
|---|---|---|---|
| Två syntetiska öar, endast färja mellan | Rutt med färja | Fortfarande rutt med färja | Ingen rutt |
| Mål på andra ön inom 30-minuterspolygon | Ja | Ja | Nej |
| Lindholmspiren → Stenpiren, gång | 1,325 km / 13,44 min | Inledande prov valde landväg | 4,263 km / 42,94 min |
| Stenpiren → Lindholmspiren, gång | 1,325 km / 13,44 min | Inte separat regressionsprov | 4,263 km / 42,92 min |
| Göteborgsmål inom 15 min, båda riktningar | Ja | Inte separat regressionsprov | Nej |

Ruttgeometrins kanter kontrollerades med trace_attributes: standardproven i
Göteborg använder ferry way-id 733390174; de strikt uteslutande proven har inga
färjekanter. Modelltiderna är statiska och är inte verkliga färjerestider.

På den syntetiska färjans mitt korreleras normalt två riktade färjekanter.
Med platsfiltret `search_filter.exclude_ferry=true` blir antalet noll inom
30 meters sökgräns. Kostnadsinställningen måste kombineras med platsfiltret
för start/mål; en start mitt på vattnet får inte flyttas långt bort till land.

## Teknisk slutsats för piloten

- Använd `costing_options.pedestrian.exclude_ferries=true` för landdelarna,
  inte enbart `use_ferry=0` som är en preferens.
- Använd `search_filter.exclude_ferry=true` i locate och efterföljande
  rutt/isokronanrop. Behåll explicit avståndsgräns och avvisa saknad landanslutning.
- Proven använder en egen kopia av konfigurationen med
  `service_limits.allow_hard_exclusions=true`. Den sparade konfigurationen ändras inte.
  Ett diagnostiskt prov med flaggan false uteslöt också färjan i installerad
  version; lita därför inte på flaggan som en åtkomstkontroll. Servern måste
  själv validera vilka val som tillåts.
- Detta gäller gångprofilen. Cykel/elsparkcykel/bil har inte verifierats här.
- Den befintliga produktionsarbetaren har ännu inte kopplats till dessa val.
  Nästa implementation ska föra med färjepolicy i validering, cacheidentitet,
  locate, isokronanrop och resultatets antaganden. Ändra inte befintlig standard
  tyst; piloten ska använda en uttrycklig landprofil.

[Valhallas API-dokumentation](https://github.com/valhalla/valhalla/blob/master/docs/docs/api/route/api-reference.md)
beskriver både exkludering och undantag vid start/mål på färja. Dokumentationen
följer master; det är därför de lokala proven, inte enbart dokumentationens
löfte, som används för beslutet om denna installation.

## Återskapa

Kör `.venv/Scripts/python.exe scripts/qa-ferry-exclusion.py` från reporoten.
Kräver installerad pyvalhalla/osmium och aktiv svensk graf. Skriptet bygger
ett tillfälligt litet nät, provar route/isochrone/locate och kontrollerar sedan
båda riktningarna i Göteborg. Tillfällig graf städas automatiskt. Rapport
skrivs i `work/ferry-exclusion-results.json`.

[Resultat från körningen](ferry-exclusion-results.json).
Polygonkontrollerna gäller valda målpunkter, inte varje punkt i polygonen.
En interpolerad yta kan fortfarande överlappa vatten även utan färjelänkar.
Färjeuteslutning verifierar inte hissdrift eller övrig aktuell framkomlighet.
