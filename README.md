# Antrenor

Aplicația de pregătire pentru Ironman 70.3 a lui Cuza și a prietenilor lui: un plan din datele reale (brățări + chestionare), un calendar viu care se rescrie după execuție, o bară de pregătire care nu se umple fără date, și o echipă de agenți (fiziolog, antrenori, nutriționist, fizio, minte) condusă de un head coach care decide și e singurul care scrie sportivului. Fiecare cifră pe care o spune un agent e verificată de cod față de pachetul de date.

**Pornirea de la zero, cu conturi și chei: `docs/pornire.md`. Integrarea brățărilor: `docs/integrari.md`.**

```
src/            nucleul determinist + colectorul + agenții (TypeScript, 68 de teste)
api/            serverul: funcții Vercel (Node) — /api/me, formulare, OAuth, webhook-uri, sync, agenți, cron
apps/web/       aplicația (PWA, Vite + React), în culorile Ironman, Acasă după desenul lui Cuza
supabase/       schema Postgres + RLS (migrations/0001_init.sql)
docs/           pornire.md, integrari.md
```

## Rulare

Cerințe: Node 20+.

```bash
npm install
npm test        # 68 de teste (node:test prin tsx); regenerează și src/prompts/bundle.ts
npm run demo    # un calendar de două săptămâni, un scor, o adaptare, bara
npm run typecheck
```

## Ce e aici

| Fișier | Ce face | Secțiunea din document |
| --- | --- | --- |
| `src/types.ts` | tipurile comune: antrenament propus, activitate, chestionar de seară, bloc liber | Aplicația · Pachetul de date |
| `src/scoring/match.ts` | leagă o activitate de antrenamentul propus: același sport, aceeași zi sau următoarea, cea mai apropiată durată; brick = bicicletă + alergare la ≤ 30 min | Scorul unui antrenament |
| `src/scoring/score.ts` | verde / galben / portocaliu / roșu / gri / albastru, cu motivele și cu `final` (se mai poate schimba o dată, dacă vine chestionarul în 24 h) | Scorul unui antrenament |
| `src/calendar/budget.ts` | bugetul de ore din blocurile libere (≥ 45 min) × 0,8 | De la chestionare la primul calendar |
| `src/calendar/phases.ts` | fazele înapoi de la cursă (evaluare, bază 1, bază 2, build, peak, taper), orele pe faze, săptămâna a 4-a de descărcare | Structura planului |
| `src/calendar/generate.ts` | primul calendar: progresie +10%/săpt. până la ținta fazei, antrenamente-cheie în zile diferite, plasare în blocurile reale; refuză planul când orele nu ajung | De la chestionare la primul calendar |
| `src/calendar/adapt.ts` | regulile calendarului viu: treaptă repetată / coborâtă, −20% după două chei slabe, readiness roșu → gri (+ mutare cu o zi), durere → fără impact 5 zile, febră, activitate / cursă în afara planului (înlocuiește volumul, zile ușoare, progresie oprită) | Calendarul viu |
| `src/bar/bar.ts` | bara de pregătire: 5 componente din ultimele 6 săptămâni, „fără date” în loc de 0, blocată la semnale deschise | Bara de pregătire |
| `src/prompts/*.md` | prompturile celor 8 agenți; `format.md` = răspunsul JSON obligatoriu al specialiștilor | Agenți |
| `src/agents/verify.ts` | verificarea mecanică a răspunsurilor (număr ↔ câmp ↔ valoare), rulată înaintea head coach-ului; testul-canar | Agenți |
| `src/collector/` | pachetul de date din brățări + formulare: arbitraj între surse, dedupe, medii, ACWR pe sport; adaptoare Whoop v2, Strava, Oura (`docs/integrari.md`) | Aplicația · Pachetul de date |
| `db/schema.sql` | tabelele PostgreSQL, cu `user_id` pe fiecare rând | Aplicația · Tehnic |
| `scripts/demo.ts` | exemplul din `npm run demo` | — |

Culorile și pragurile sunt cele din document; dacă le schimbi acolo, le schimbi și aici (`score.ts`, `adapt.ts`, `bar.ts`) — e intenționat să fie cod, nu configurație, ca să fie testate.

## Ce urmează (Sprint 1, săptămânile 1–2)

1. **Colectorul**: un job care trage activitățile și somnul/HRV-ul fiecărui sportiv, aplică arbitrajul Whoop/Garmin, calculează `timeInZonesMin` cu zonele sportivului și scrie `activities` + pachetul JSON. Codul de aici primește rezultatul lui.
2. **API + PostgreSQL** (Node): `db/schema.sql`, endpoint-uri pentru onboarding, calendar, scoruri, bară.
3. **PWA**: onboarding (chestionare + program), calendarul colorat, cardul de antrenament, bara cu formula deschisă.
4. **Agenții**: head coach + 7 specialiști, rulați de backend cu prompturile din `src/prompts`, cu testul anti-halucinare săptămânal (fiecare cifră citată trebuie să existe în pachet).

## Ce ai de făcut tu înainte de Sprint 1

- **Integrări**: vezi `docs/integrari.md` — Garmin nu mai primește developeri noi (program suspendat din primăvara 2026), deci activitățile Garmin intră prin Strava; WHOOP direct (API v2, 10 membri fără aprobare); Oura direct. De creat aplicațiile WHOOP și Strava (30 min) și de întrebat AthleteData de API.
- **Garmin, contul tău**: conexiunea actuală către AthleteData nu are permisiunea de „workouts”, deci antrenamentele nu pot fi trimise pe ceas. Reconectează Garmin din athletedata.health/dashboard/integrations cu toate permisiunile pornite.
- **Server**: un VPS în UE (Hetzner sau similar) + un domeniu; datele prietenilor nu stau pe Mac Mini.
- **Cheie API** pentru modelul care rulează agenții.
- **Decizii**: cine e head coach-ul uman după pilot; dacă bara de finisher e suficientă pentru prieteni sau unii au obiectiv de timp.
- **Consimțământ**: textul ecranului de consimțământ pentru date de sănătate (18+, nu e serviciu medical, ștergere la cerere), înainte de primul prieten.

## Aplicația web (`apps/web`)

PWA în Vite + React + TypeScript, în culorile Ironman (negru, roșu, alb; fără logo — doar paleta), cifre în serif, carduri rotunjite, butoane-pastilă. Importă nucleul prin alias-ul `@core` și, deocamdată, rulează pe date demo generate la pornire (`src/data/demo.ts`).

```bash
cd apps/web
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ — de pus pe Vercel
```

Navigare: bara-pastilă de jos are trei butoane, cu **Acasă la mijloc** (Antrenament · Acasă · Recuperare). Calendarul se deschide din butonul rotund din stânga-sus, profilul din avatarul din dreapta-sus, antrenorul din butonul plutitor „Antrenor”.

Ecrane:
- **Acasă** (după desenul lui Cuza): numele (atins → profil), bara de pregătire pentru 70.3 cu procentul și componentele, mesajul zilei din date, trei carduri Înot / Bicicletă / Alergare cu ilustrație și următoarea ședință (cardul zilei e marcat „azi”), zilele până la cursă, trei pătrate Recuperare / Forța / Calendar, avertismentele.
- **Antrenament**: Înot (bazin / ape deschise din pastila de pe hartă), Bicicletă, Alergare, Forță — carduri de statistică, următoarea ședință, ședințele săptămânii.
- **La deschidere**: mementoul pe tot ecranul — ziua X din Y și un fapt din datele tale; atingi, dispare în fade. Revine dacă aplicația a stat ascunsă peste 30 de minute.
- **Formulare** (`src/forms/`): chestionarul de intrare (9 pași, totul de atins: obiectiv, înot, bicicletă, alergare, echipament, programul pe o grilă zile × ferestre, sănătate, motivație, consimțământ), dimineața (4 note Hooper + 4 semnale, ~20 s), după antrenament (RPE, așteptări, durere + loc, ce a încurcat, fueling, comentariu; la o activitate din afara planului și „ce a fost?”), săptămânal (3 întrebări, duminica). Răspunsurile au exact forma din `@core/collector/types` și stau în localStorage în demo.
- **Citirea datelor** (`src/ui/sync.ts`): butonul „citit HH:MM”, plus automat la deschidere, la revenire și la 15 minute; real = `POST /api/sync`.
- **Recuperare**: inelul de recuperare (Whoop), apoi statisticile: ore / FC medie / ședințe cu sparkline, graficul „Ore pe săptămână”, „Execuție”, bara de pregătire cu cele 5 componente și formula, km alergare, observația zilei.
- **Calendar**: luna colorată + cardul zilei cu motivele. **Antrenor**: mesaje, live, programare. **Profil**: brățări cu „Conectează”, date, consimțământ.

Graficele și ilustrațiile sunt SVG desenat în cod (`src/ui/common.tsx`: `AreaChart`, `Spark`, `Ring`, `SwimArt`, `BikeArt`, `RunArt`), fără bibliotecă și fără poze; pozele sportivului le înlocuiesc când există. Următorul pas: Supabase (auth + Postgres cu `db/schema.sql`) în locul datelor demo.
