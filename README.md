# Antrenor — nucleul aplicației (v0.1)

Codul determinist din spatele aplicației descrise în documentul „Antrenor v2 — Protocol Ironman 70.3” (tab-urile **Agenți** și **Aplicația**): scorul pe culori, potrivirea activităților, generatorul de calendar, regulile calendarului viu și bara de pregătire. Nimic de aici nu apelează un model; agenții primesc rezultatele acestor funcții în pachetul de date.

## Rulare

Cerințe: Node 20+.

```bash
npm install
npm test        # 36 de teste (node:test prin tsx)
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
| `src/calendar/adapt.ts` | regulile calendarului viu: treaptă repetată / coborâtă, −20% după două chei slabe, readiness roșu → gri (+ mutare cu o zi), durere → fără impact 5 zile, febră, activitate neplanificată | Calendarul viu |
| `src/bar/bar.ts` | bara de pregătire: 5 componente din ultimele 6 săptămâni, „fără date” în loc de 0, blocată la semnale deschise | Bara de pregătire |
| `src/prompts/*.md` | prompturile celor 8 agenți, exact cum sunt în tab-ul Agenți | Agenți |
| `db/schema.sql` | tabelele PostgreSQL, cu `user_id` pe fiecare rând | Aplicația · Tehnic |
| `scripts/demo.ts` | exemplul din `npm run demo` | — |

Culorile și pragurile sunt cele din document; dacă le schimbi acolo, le schimbi și aici (`score.ts`, `adapt.ts`, `bar.ts`) — e intenționat să fie cod, nu configurație, ca să fie testate.

## Ce urmează (Sprint 1, săptămânile 1–2)

1. **Colectorul**: un job care trage activitățile și somnul/HRV-ul fiecărui sportiv, aplică arbitrajul Whoop/Garmin, calculează `timeInZonesMin` cu zonele sportivului și scrie `activities` + pachetul JSON. Codul de aici primește rezultatul lui.
2. **API + PostgreSQL** (Node): `db/schema.sql`, endpoint-uri pentru onboarding, calendar, scoruri, bară.
3. **PWA**: onboarding (chestionare + program), calendarul colorat, cardul de antrenament, bara cu formula deschisă.
4. **Agenții**: head coach + 7 specialiști, rulați de backend cu prompturile din `src/prompts`, cu testul anti-halucinare săptămânal (fiecare cifră citată trebuie să existe în pachet).

## Ce ai de făcut tu înainte de Sprint 1

- **Integrări**: AthleteData (TRAINER) agregă deja Strava, Garmin, Whoop, Oura, Withings, Apple Health, dar conectorul merge în Claude, nu într-o aplicație. De verificat cu ei dacă oferă API/OAuth pentru aplicații terțe. Dacă nu: Strava API (activități; acoperă și Apple Watch), Whoop API și Oura API (somn, HRV); Garmin Health API mai târziu (cere aprobare).
- **Garmin, contul tău**: conexiunea actuală către AthleteData nu are permisiunea de „workouts”, deci antrenamentele nu pot fi trimise pe ceas. Reconectează Garmin din athletedata.health/dashboard/integrations cu toate permisiunile pornite.
- **Server**: un VPS în UE (Hetzner sau similar) + un domeniu; datele prietenilor nu stau pe Mac Mini.
- **Cheie API** pentru modelul care rulează agenții.
- **Decizii**: cine e head coach-ul uman după pilot; dacă bara de finisher e suficientă pentru prieteni sau unii au obiectiv de timp.
- **Consimțământ**: textul ecranului de consimțământ pentru date de sănătate (18+, nu e serviciu medical, ștergere la cerere), înainte de primul prieten.

## Aplicația web (`apps/web`)

PWA în Vite + React + TypeScript, pe tokenii de design din document (dark, accent lime, cifre în serif, carduri de 24 px, butoane-pastilă). Importă nucleul prin alias-ul `@core` și, deocamdată, rulează pe date demo generate la pornire (`src/data/demo.ts`).

```bash
cd apps/web
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ — de pus pe Vercel
```

Navigare: bara-pastilă de jos are trei butoane, cu **Acasă la mijloc** (Antrenament · Acasă · Statistici). Calendarul se deschide din butonul rotund din stânga-sus, profilul din avatarul din dreapta-sus, antrenorul din butonul plutitor „Antrenor”.

Ecrane:
- **Acasă**: întâmpinare + mesajul din date, silueta cu lumină lime (locul pozei sportivului, vine din onboarding), cardul „Stare” (inelul barei de pregătire, somn, verdictul zilei), antrenamentul de azi cu hartă, zile până la cursă / vreme / condiții, „Trimite pe ceas”, săptămâna, avertismente, date disponibile.
- **Antrenament**: Înot (bazin / ape deschise din pastila de pe hartă), Bicicletă, Alergare, Forță — carduri de statistică, următoarea ședință, ședințele săptămânii.
- **Statistici**: inelul de recuperare (Whoop), ore / FC medie / ședințe cu sparkline, graficul „Ore pe săptămână”, „Execuție”, bara de pregătire cu cele 5 componente și formula, km alergare, observația zilei.
- **Calendar**: luna colorată + cardul zilei cu motivele. **Antrenor**: mesaje, live, programare. **Profil**: brățări cu „Conectează”, date, consimțământ.

Graficele sunt SVG desenat din date (`src/ui/common.tsx`: `AreaChart`, `Spark`, `Ring`), fără bibliotecă. Următorul pas: Supabase (auth + Postgres cu `db/schema.sql`) în locul datelor demo.
