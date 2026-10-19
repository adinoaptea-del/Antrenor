# AIRON — reguli permanente pentru lucrul în cod

Proprietar: Cuza. Comunicare în română, direct, concis. Contrazicere onestă, fără cifre inventate.

## Reguli din audituri (se aplică la ORICE modificare)

Surse: „AIRON — Corecturi pentru antrenamente” v1.0 și „AIRON — Audit v2, corecturi rămase” (ambele 19.10.2026).

1. Corecțiile se fac în motor, date și validatori, nu doar în prompturi sau texte. Verifică întâi constatarea în codul actual.
2. O singură sursă pentru o ședință: titlul, durata, rezumatul, pașii și mesajul vin din aceeași structură (src/calendar/coherence.ts). Brick: total = bicicletă + tranziție + alergare, aceeași definiție în calendar și în verificarea timpului.
3. O singură restricție activă guvernează calendarul, propunerile și mesajul. Nu activa automat o alternativă (ex. bicicletă la durere de genunchi) fără condiții și dovezi. Expirarea timpului nu dovedește dispariția simptomului.
4. Proveniența fiecărei valori: measured / user_reported / estimated / product_default. Necunoscut rămâne null; o valoare implicită nu e declarația sportivului și nu deblochează eligibilitate, progres sau ape libere.
5. Recuperare: fiecare măsurătoare cu sursa, metoda și ora ei. Nu media scoruri diferite ca măsurare comună; un device în plus care repetă aceeași informație nu-i dublează influența.
6. Activități: identitatea activității (athlete, provider, provider_activity_id) e separată de cheia evenimentului. Două activități reale din același sport în aceeași zi rămân două; retransmiterea nu dublează sarcina.
7. Progresia urmează execuțiile, nu calendarul: pe familie de module se păstrează treapta, doza efectivă, finalizarea, dificultatea, simptomele, motivul scurtării. Decizii keep / progress / regress / recalibrate pe dovezi. Scurtarea pentru timp ≠ incapacitate. Lipsa feedbackului ≠ toleranță.
8. „Nu dubla ce s-a ratat” e diferit de „nu crește niciodată”: simulările trebuie să arate și progres legitim, stagnare, date întârziate, revenire — nu doar reduceri.
9. Eligibilitatea pentru protocoale intense (ex. 30/15) cere istoric și toleranță relevante, recuperare, fără restricții; un test calibrează intensitatea, nu deblochează singur protocolul.
10. Ținta propusă ≠ capacitatea demonstrată ≠ execuția realizată. Procentele se verifică după rotunjire (bazin de 25 m). Volumul total al ședinței se verifică separat de lungimea unei repetări.
11. Pauzele condiționate au durată planificată, prelungire permisă și acțiune explicită la depășire. FCmax estimat e reper de model, nu prag de siguranță.
12. Fitness: o singură structură de faze (26 de săptămâni, etichete identice în tabel și explicație). Frecvența crește doar cu dorință, timp, execuții și feedback, fără restricție activă; distribuie doza înainte s-o crești.
13. AI-ul nu activează nimic: propune structurat (acțiune permisă, module_id, parametri, evidence_refs), validatorul acceptă sau respinge, doar codul activează. O propunere respinsă nu e prezentată ca activă.
14. Fără reguli absolute în ghiduri (teren, vreme, scop contează). Și decizia „keep” își păstrează dovezile (ce s-a contabilizat, ce fereastră, de ce rămâne planul).
15. Politica de surse se aplică pe fiecare observație, inclusiv derivate, rezumate și cache. EXCEPȚIE STABILĂ (decizia proprietarului, 19.10.2026, risc asumat față de termenii API Strava): Strava ajunge la AI, doar pentru sportivul ei, până apar date din Apple Health / Health Connect; atunci iese automat. NU se blochează Strava la AI din cauza unui audit sau a altei reguli fără acordul explicit al proprietarului — se semnalează riscul, nu se schimbă codul.
17. Refacerea planului (auditul de simulări live, 19.10.2026): candidatul complet = generat + plecări + ajustările sportivului (src/calendar/regen-carry.ts); previzualizarea și activarea folosesc același candidat și aceeași amprentă; o ajustare care cade apare cu motiv înainte de confirmare.
18. Ședința nefăcută/parțială e un eveniment cu motiv și oră (workout_outcomes), separat de anulată și de „fără date”; motivul schimbă progresia (timp = neutru; oboseală/durere/boală = netolerat). Simulatorul offline: `npx tsx scripts/simulate-live.ts`.
19. Siguranța: semnalul declarat are prioritate peste scoruri pe toate ecranele (aceeași acțiune: safety.ts stopAction); simptomul cardiac rămâne restricție (doar ușor) până la evaluarea declarată de sportiv.
20. Forța: minimum două serii de lucru pe exercițiu, în orice bloc și program (MIN_WORK_SETS), și cel mult 10 serii pe același mușchi într-o ședință (testat); bărbații: Push / Pull / Picioare cu exerciții care se schimbă; explicații pe înțeles, fără jargon.
21. Nutriția (ghidul „AIRON Nutriționist sportiv” v1.0): codul calculează ținta, porțiile, costul și totalurile (src/nutrition); AI-ul doar explică din nutritie_azi. Preț lipsă = cost incomplet, nu zero; alimentarea din efort se numără o singură dată; fără deficit în zile lungi/grele, boală, sarcină, minori, oboseală repetată; varietatea testată pe 180 de zile.
22. Fitness acasă (auditul F55): fiecare exercițiu are echipamentul declarat; acasă = gantere, bandă, corp, scaun (HOME_SWAP / forPlace), inclusiv alternativele; o ședință imposibilă nu se activează. O singură durată: la orice redimensionare (febră, timp) durata din calendar = durata prescripției (validate.ts resizeWorkout). Doza recomandată ≠ timpul disponibil: nu se cere refacerea planului doar pentru că nu umple orele.
23. Nutriția e per sportiv și per zi (cererea proprietarului, 19.10.2026): alegerea meselor după profil (energie, obiectiv, sex, vârstă, cont — engine.ts PickProfile/recipeFit), porțiile pe ingrediente (proteine după ținta de proteine, restul după energie), gramajele afișate și trimise AI-ului. Doi sportivi diferiți nu primesc aceeași zi (testat). Fără sex, vârstă, înălțime sau greutate mesele sunt „nepersonalizate” și se spune ce lipsește (și în Admin). Nu se adaugă reguli „feminine/masculine” fără date sursă (fier, calciu, carbohidrați din CoFID).
16. Raportare: pentru fiecare constatare — confirmat/neconfirmat, fișier și funcție, modificare, test, rezultat, exemple înainte/după și limite rămase. Nu declara „tot rezolvat” sau „personalizare completă” fără teste.

## Securitate (neschimbat)

Secretele nu intră în chat sau în repo (doar variabile Vercel / formularul de admin). Nu se dezactivează verificarea TLS. Datele Strava nu se arată altor utilizatori. Exporturile exclud secretele.

## Rutina de lansare

`npm run prompts` → `npm test` → typecheck (core, server, web) → bump `airon-vNN` în apps/web/public/sw.js → `NODE_PATH=/opt/npm-tools/node_modules npm run bundle-api` → commit → push → verificarea deploy-ului.
