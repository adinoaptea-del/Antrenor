# Integrarea brățărilor — starea la 16 oct 2026 și pașii concreți

## Ce s-a schimbat față de plan

- **Garmin direct nu se poate.** Programul Garmin Connect Developer nu mai procesează aplicații noi din primăvara lui 2026 („redesign and modernisation of the API program”), fără dată de redeschidere; cereri din martie erau încă în așteptare în septembrie. Partenerii deja aprobați (AthleteData, Strava, intervals.icu) merg mai departe. Surse: [the5krunner, 14 sept 2026](https://the5krunner.com/2026/09/14/garmin-developer-api-access-paused/), [Rook](https://tryrook.io/blog/garmin-connect-api-access/), [Sahha](https://sahha.ai/blog/garmin-developer-program-paused/).
- **WHOOP merge direct.** API v2 (iulie 2025), OAuth 2.0, webhook-uri pentru somn / recovery / antrenamente, iar accesul „development” acoperă **10 membri** fără aprobare — destul pentru pilot. Sursa: [developer.whoop.com](https://developer.whoop.com/docs/developing/getting-started/), rezumat în [Terra, 2026](https://tryterra.co/blog/whoop-api-data-access-permissions-limitations-2026).
- **Activitățile Garmin intră prin Strava** (ceasul sincronizează deja acolo). Strava API: OAuth 2.0, scope `activity:read_all`, webhook la activitate nouă. Limita: o aplicație nouă poate conecta un singur sportiv (dezvoltatorul) până la o cerere de mărire; Strava și-a strâns regulile de două ori din noiembrie 2024.
- **Oura** are API v2 deschis, pentru prietenii cu inel.

Arhitectura pilotului:

```
Whoop (somn, HRV, puls, recovery, antrenamente)  ─┐
Strava ← Garmin (activități: durată, FC, distanță)  ├─► colector (src/collector) ─► pachet ─► agenți
Oura (somn, readiness)                             ─┘        ▲
Formularele din aplicație (dimineața, seara, intrare) ───────┘
```

Cât timp aplicația n-are OAuth, pachetul lui Cuza se poate construi din Claude prin conectorul AthleteData (așa s-a făcut testul din 16 oct): un task programat dimineața care scrie pachetul în Supabase. Pentru prieteni nu merge: conectorul vede un singur sportiv.

## Ce ai de făcut tu (30 de minute, o singură dată)

1. **WHOOP** — la [developer.whoop.com](https://developer.whoop.com) (cu contul tău WHOOP): *Create app*. Nume: Antrenor. Redirect URL: `https://<domeniul-aplicației>/api/oauth/whoop/callback` (pe Vercel, domeniul proiectului). Scopes: `read:recovery read:cycles read:sleep read:workout read:body_measurement read:profile offline`. Webhook URL: `https://<domeniu>/api/webhooks/whoop`. Îmi dai Client ID și Client Secret (secretul intră doar în variabilele de mediu de pe server, niciodată în aplicație). Privacy policy: o pagină simplă pe același domeniu (o scriu eu).
2. **Strava** — la [strava.com/settings/api](https://www.strava.com/settings/api): *My API Application*. Website: domeniul aplicației. Authorization Callback Domain: același domeniu, fără `https://`. Îmi dai Client ID și Client Secret. Mai târziu, din aceeași pagină, ceri mărirea limitei de sportivi pentru prieteni.
3. **Oura** (doar dacă vreun prieten are inel) — [cloud.ouraring.com/oauth/applications](https://cloud.ouraring.com/oauth/applications): aplicație nouă, redirect `https://<domeniu>/api/oauth/oura/callback`.
4. **AthleteData** — un e-mail: „Oferiți API/OAuth pentru aplicații terțe care vor să citească datele agregate ale propriilor utilizatori?” Dacă da, înlocuiește tot de mai sus cu o singură conexiune, inclusiv Garmin.
5. **Supabase (UE) + Vercel** — conturile; fără ele n-are unde să ajungă token-urile.

## Matricea surselor (verificată în cod la 20.10.2026, auditul v93 A96)

| Sursă | Cale | Ce aduce | Fereastra la sincronizare | Ștergeri | La AI |
| --- | --- | --- | --- | --- | --- |
| WHOOP | OAuth + webhook (HMAC, 5 min) | somn (episoadele din aceeași zi adunate), HRV rMSSD, puls de repaus, recovery, antrenamente | 3 zile (cron 15 min, webhook) | nu se aplică (doar upsert) | da |
| Strava (Garmin prin Strava) | OAuth + webhook (fără semnătură; token de verificare obligatoriu) | activități: durată, distanță, FC, cadență, putere, ture | 42 de zile | **da** din v105: `delete` scoate activitatea | **da, până apar date Apple Health / Health Connect** (regula 15, risc asumat de proprietar) |
| Oura | OAuth | noaptea principală, HRV, puls, readiness, temperatura pielii | 3 zile | nu | da |
| Apple Health (Health Auto Export) | webhook cu token personal (antet `x-airon-token` sau `?t=`) | zile (puls, somn; HRV SDNN exclus), antrenamente | ce trimite exportul | nu | da |
| Health Connect (Android) | webhook cu același token | zile, antrenamente | ce trimite exportul | nu | da |
| Formularele AIRON | aplicația | dimineața, seara, nefăcut, teste, analize, intrare | — | — | da (textele tăiate la 300 de caractere, tratate ca date) |

Ce NU există: Garmin direct (programul închis), latența garantată pe sursă, starea de completitudine pe interval (A20, parțial), ștergerile WHOOP/Oura/Apple.

## Ce face codul (gata, testat)

| Fișier | Rol |
| --- | --- |
| `src/collector/types.ts` | formele normalizate: `SourceDaily` (o noapte / o zi de la o sursă), `SourceActivity`, formularele, zonele, analizele |
| `src/collector/packet.ts` | pachetul agenților: arbitraj între surse (o singură sursă pe metrică — cea cu cele mai multe zile, fără medie între brățări; HRV Apple/SDNN exclus), dedupe Garmin+Strava, media7 / baseline60 / sd60, ACWR total și pe sport, ore pe sport în 7 zile, ultima ședință + chestionarul ei, planul zilei și al săptămânii |
| `src/collector/providers/oauth.ts` | OAuth 2.0 comun: URL de autorizare, schimb de cod, refresh, ora locală din ISO + offset |
| `src/collector/providers/whoop.ts` | WHOOP v2: scope-uri, endpoint-uri cu paginare, normalizarea nopții (ziua trezirii, culcarea, minutele dormite, HRV, puls, recovery) și a antrenamentului |
| `src/collector/providers/strava.ts` | Strava: activități → sport, minute, km, FC, cadență (×2 la alergare), putere |
| `src/collector/providers/oura.ts` | Oura v2: somn lung → noapte normalizată, readiness |
| `src/agents/verify.ts` | verificarea mecanică a răspunsurilor JSON ale specialiștilor, înaintea head coach-ului; testul-canar |

Ce lipsește pentru a porni: serverul care ține token-urile și rulează colectorul (Supabase Edge Functions sau Vercel Functions), endpoint-urile `/api/oauth/*/callback`, `/api/webhooks/*`, `/api/sync`, și cheile de la pașii 1–3.

## Citirea datelor în aplicație

- Butonul **„citit HH:MM”** (Acasă sus-dreapta, Recuperare, Profil) cheamă `POST /api/sync`: serverul trage Whoop și Strava pentru ultimele 3 zile, recalculează pachetul și întoarce ora pe sursă.
- Automat: la deschidere, la revenirea în aplicație și la 15 minute cât e deschisă. Închisă, aplicația nu poate citi singură (iOS nu lasă PWA-urile să ruleze în fundal); citește serverul, la 15 minute, plus webhook-urile Whoop și Strava care anunță imediat o noapte sau o ședință nouă.

## Activitățile din afara planului

O ședință venită de pe ceas fără pereche în plan apare albastră și primește întrebarea „ce a fost?” (cursă / antrenament liber / altceva). Regula din `src/calendar/adapt.ts` o cuantifică fără să adauge peste plan: volumul ei înlocuiește ședințele aceluiași sport din săptămână; după cursă, două zile ușoare și cheile din 72 h coboară la Z1–Z2 cu −25%; o cursă de peste 60 min oprește progresia săptămânii următoare. Teste în `tests/adapt.test.ts`.

## Samsung Watch (Galaxy Watch) — adăugat 18 oct 2026

Samsung nu are un API în cloud pentru Samsung Health, deci nu există OAuth ca la Whoop sau Strava. Două căi, amândouă în Profil → Dispozitive → Samsung:

1. **Prin Strava** (cea mai simplă): Samsung Health → Setări → Conturi conectate → Strava. Ajung doar antrenamentele cu GPS (alergare, bicicletă, înot în ape libere); înotul în bazin, somnul și HRV nu trec prin Strava.
2. **Prin Health Connect** (Android): aplicația „Health Connect Webhook” (`com.hcwebhook.app`) citește din Health Connect (unde scrie Samsung Health) și trimite către `POST /api/webhooks/android?t=<token>`. Token-ul e același cu cel de la Apple Health (`users.apple_token`), afișat în Profil. Serverul (`server/_lib/android.ts`, `server/webhooks/android.ts`) acceptă formate variate (listă de înregistrări sau obiect pe tipuri), scrie wellness cu sursa `android` (somn, HRV nocturn, FC repaus), activități (`android-<user>-…`), și notează în `sync_log` tipurile pe care nu le-a recunoscut, ca să le adăugăm după primul telefon real.

Dedupe: o ședință venită și prin Strava și prin Health Connect e una singură (interval de timp suprapus, aceeași probă); prioritatea surselor e în `src/collector/packet.ts`.

## Obiective pe un singur sport — adăugat 18 oct 2026

`Goal` are acum patru familii: triatlon (`sprint`, `olimpic`, `70.3`), alergare (`5k`, `10k`, `semimaraton`, `maraton`), înot (`inot-1500`, `inot-1900`, `inot-3800`), bicicletă (`bike-50`, `bike-100`, `bike-160`). `goalKind()`/`goalSports()` din `src/calendar/phases.ts` decid: ce sporturi apar în Plan, ce antrenori primesc pachetul (`src/agents/runner.ts` scoate antrenorii sporturilor absente), ce repere intră în „Gata de cursă”, ce insigne există. Chestionarul la alergare: distanța → nivelul de acum (inclusiv „n-am alergat niciodată distanța asta”, cu un timp pe 5/10 km dacă există) → ținta, judecată pe loc (`src/goals/run-target.ts`: praguri de elită, Riegel, ≤1,5 %/lună realist, ≤2,5 %/lună ambițios, altfel nerealist). Biblioteca de antrenamente (`src/knowledge/workouts.ts`) intră în promptul fiecărui antrenor, filtrată pe sport, obiectiv și fază. Baza de date primește constrângerile noi prin `/api/setup` (schema 4).

## Forța: programul AIRON adaptiv — adăugat 18 oct 2026

Sursa: „AIRON_Program_Forta_PPL_Adaptiv” (18.10.2026). Motorul determinist e în `src/strength/ppl.ts`: catalogul cu ID-uri stabile, Push/Pull/Legs A/B (3 ședințe/săpt.) sau tot corpul A/B (1–2 ședințe), completările, înlocuirea unilaterală la Legs din bază, blocurile de 26 de săptămâni strânse sau extinse după data cursei (`strengthBlocks`), doza pe bloc (RIR, seturi), descărcarea din planul de anduranță, picioare ușoare în ajunul ședinței-cheie și fără picioare în ultimele 10 zile. `prescribe(spec, minute)` potrivește ședința în timpul din calendar: cad completările, apoi accesoriile; pauzele principale rămân. Textul din plan („Push A · Bază, săpt. 2/4 · 2–3 repetări în rezervă”) se citește înapoi exact (`parseStrength`); planurile vechi se recalculează (`src/strength/plan-specs.ts`). Antrenorul de forță primește în pachet prescripția următoarei ședințe și expunerile din 21 de zile. A treia ședință (PPL) apare în fazele de bază de la 5 h/săpt. (un sport) sau 12 h (triatlon). Lipsește încă jurnalul de seturi și greutăți (progresia dublă cere înregistrarea fiecărui set).

## Antrenorul de alergare — ediția integrată (18 oct 2026)

Sursa: „AIRON_Agent_Alergare_5_10_21_42km”. Implementat: ramurile „finalizare” / „timp” (chestionar: „Ce urmărești?”); debutant (< 3 km cea mai lungă) → mers-alergare și fără ședințe rapide în bază; modulele V5/V5b/V10a/V10/T1/T2/H/M/D1/R* în `src/calendar/run-modules.ts`, cu toate minutele în total și rescrise când ședința se scurtează (`fitStructure`); un singur stimul greu pe săptămână (lunga cu final la efort de cursă sau testul înlocuiesc modulul); ritmul de antrenament ancorat în nivelul actual (ținta ambițioasă nu dictează ritmurile; fără rezultat → doar RPE); ieșirea lungă crește după două expuneri, cu cel mult 10 min; taper după distanță (5/10 km 1 săpt., semi 2, maraton 3); verificarea distanței înaintea timpului (`distanceFeasibility`); în pachet `alergare_lunga` (saltul față de maximul real din 30 de zile) și `ramura_alergare`; promptul antrenorului rescris pe regulile documentului. Neimplementat: scorul ședinței pe scop (alergarea ușoară prea rapidă) și raportul minute-în-zone cu minute neclasificabile.
