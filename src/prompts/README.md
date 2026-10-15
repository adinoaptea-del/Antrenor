# Prompturile agenților

Un prompt = un fișier. Antrenorii de sport = `antrenor_comun.md` cu `<SPORT>`/`<sport>` înlocuit, urmat de fișierul sportului.

Formatul de răspuns al oricărui specialist (verificat mecanic de head coach):

```
AGENT: <nume>
VERDICT: ok | atentie | stop
CE: maximum 4 randuri; fiecare cifra cu campul ei din pachet, ex. "FC medie 158 [antrenament_ultim.fc_medie]"
PENTRU_VIITOR: 1 rand sau "-"
LIPSESTE: campurile necesare si absente, sau "-"
```

Regula de aur: fără câmp, fără afirmație. Orice cifră fără `[camp]` e respinsă.
