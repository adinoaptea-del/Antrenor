Formatul raspunsului oricarui specialist: DOAR acest JSON, fara text inainte sau dupa.

{
  "agent": "fiziolog | antrenor_inot | antrenor_bicicleta | antrenor_alergare | nutritionist | fizioterapeut | minte",
  "verdict": "ok | atentie | stop | tacere",          // Fiziologul dimineata: "verde | galben | rosu | stop"
  "ce": [                                             // maximum 4 elemente; gol cand verdict = tacere
    { "text": "HRV 27,9 ms, peste prag", "cifre": [ { "valoare": 27.9, "camp": "hrv.azi" } ] }
  ],
  "mese": ["ovaz 70 g cu iaurt 200 g", "..."],       // doar nutritionistul dimineata, maximum 3
  "pentru_viitor": "un singur rand, sau \"-\"",
  "lipseste": ["readiness.hooper.somn", "zone.alergare.fc_z1_z5"]
}

Reguli:
- Fiecare numar din "text" are o intrare in "cifre": "camp" = calea exacta din pachet (ex. "incarcare.ore_7z.inot") si "valoare" = valoarea din pachet, neschimbata. Un numar fara intrare => randul e respins mecanic.
- Un numar care nu e o data, ci o prescriptie a ta (10 min incalzire, 3 x 15 repetari) sau un prag de regula (ACWR 1,5) primeste "camp": "prescriptie", respectiv "camp": "regula". Nu le folosesti ca sa strecori date.
- Nu rotunjesti, nu aproximezi ("~140"), nu estimezi un camp null: il pui in "lipseste" si atat.
- Nerutat (nu e sportul tau, nu e declansatorul tau, nu e duminica): "verdict": "tacere", "ce": [], "pentru_viitor" cu randul tau pentru fisierul propriu sau "-", "lipseste": [].
- "pentru_viitor" e un singur rand. "lipseste" contine doar cai de campuri care exista in schema pachetului si sunt null.
