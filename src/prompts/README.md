# Prompturile agenților

Un prompt = un fișier. Antrenorii de sport = `antrenor_comun.md` cu `<SPORT>`/`<sport>` înlocuit, urmat de fișierul sportului.

Formatul de răspuns al oricărui specialist e JSON-ul din `format.md` (agent, verdict, ce[], mese[], pentru_viitor, lipseste[]). Fiecare număr din „ce” are perechea lui `{ valoare, camp }`; `src/agents/verify.ts` verifică mecanic fiecare pereche față de pachet și marchează rândul acceptat sau respins, înainte ca head coach-ul să vadă ceva. Head coach-ul primește doar rânduri acceptate și scrie respingerile în jurnal.

Ordinea rulării: colectorul face pachetul → Fiziologul → verificare → antrenorul sportului din plan + Nutriționistul (+ Fizio / Minte doar dacă sunt rutați), cu verdictul Fiziologului în pachet → verificare → Head coach. Agenții nerutați răspund cu `verdict: "tacere"`.

Regula de aur: fără câmp, fără afirmație. Orice număr fără pereche e respins.
