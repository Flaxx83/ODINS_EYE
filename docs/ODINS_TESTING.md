# Testgrund för ODINS EYE

## Kontroller

- `npm ci` installerar låsta Node-beroenden.
- `npm run doctor -- --json` kontrollerar utvecklingsmiljön.
- `npm run format:check` kontrollerar antagna runtimefiler; `npm run format` korrigerar formattering.
- `npm run check:boundaries` kontrollerar importriktning och modulägarskap.
- `npm run layer-token:check -- --base-ref origin/main` kontrollerar publicerade lagertoken.
- `npm test` upptäcker tester under både src och server. Högst fyra testfiler körs samtidigt. Node 24 kör dessutom de två separata allokeringsproverna; Node 26 hoppar över dessa kalibrerade budgetar enligt befintlig policy.
- `npm run test:integrations` kör riktade offlineprover för svenska resefrågor, trafikstatus, AI-källkontext, Trafikverkskameror, kartgeometri och upptäckt av servertester.
- `npm run test:setup` kontrollerar runtimeval, GTFS-fixture och saknade importer.
- `npm run test:imports` kör Python-importprover. Installera requirements-geo.txt; använd GEV_PYTHON eller lokal .venv enligt installationsguiden.
- `npm run build` verifierar produktionsbygget.

CI kör den breda Node-sviten på Linux med Node 24 och 26. ODINS-gaten kör riktade integrationer och offlineimporter på Windows och Linux med Node 24 och Python 3.12. Den separata browser-gaten för Street Level och paneler är fortsatt kvar. Inga privata API-nycklar behövs i CI.

## Regressionskontrakt

Saknad resegeometri visar ändpunkter men ritar ingen fågelväg. Ogiltiga koordinater skickas inte till globen. Saknad jämförbar realtidsprognos är okänd, inte i tid. Luftmätningens ålder och hämtfel följer med AI-kontexten; källfel betyder inte noll händelser. Datumprov täcker svensk tid, nästa kalenderdag och byte till sommartid. Kameraprover avvisar ogiltiga positioner/bildvärdar och kontrollerar att den konfigurerade nyckeln inte följer med till kameradata.

Den fria AI-verktygsloopen byggs i #1 och får egna argument-/kontextprover där. Dessa tester verifierar nuvarande strukturerade dataväg; de ska inte beskrivas som tester av en färdig generell agent. Stop-/turmatchning utökas i respektive rese- och Trafikverksissue när implementationen tillkommer.

## Fel som identifierats och åtgärdats i #6

- 43 antagna filer behövde formattering; ändringarna hålls i en separat commit där möjligt.
- Modulägarskap saknades för svensk radiodata och lokala kartlager.
- AI-panelens CSS-import bröt Node-testernas import av lagerkatalogen. Stilen importeras nu via den gemensamma stylesheeten.
- Äldre katalogfixtures förväntade 30 lager, medan ODINS-versionen har 52.
- En Codex-executable-fixture förutsatte POSIX-sökvägar; jämförelsen använder nu plattformens sökvägsseparator.
- README saknade beskrivning av det befintliga Draw-verktyget som dokumentationskontraktet kontrollerar.

Slutliga körresultat och CI-länkar registreras i issue #6. Alla testsvar är fixtures; automatiska testresultat bevisar inte aktuell datatäckning hos externa tjänster.

Ytterligare kontraktsfel i den breda sviten åtgärdades: lokala karttexter använder nu det gemensamma world-overlay-lagret med separata ägare och städning. Röstmanifestet deklarerar de 22 lokala lagren som voice-off tills verktygen finns. Cyber-stilen är åter sista stilimporten. Providerordningsprovet kontrollerar den ursprungliga providergruppen samtidigt som ODINS-leverantörerna finns kvar. Dokumentationskontraktet använder ODINS_README i stället för originalets lagerantal. Samtidig reparation av MCP-nyckelfiler återförsöker endast övergående Windows-delningfel inom befintlig tvåsekundersgräns.

67 riktade kontraktsprover passerade efter korrigeringarna. AI-panelens utseende verifierades i en separat webbläsarflik efter CSS-flytten. Dessa riktade resultat kompletterar den fulla CI-körningen, som måste vara grön på senaste commit före sammanfogning.
