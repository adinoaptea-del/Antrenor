// Biblioteca de preparate din ghidul nutriționistului (§15): 28 de rețete, porții de referință (nu porții universale),
// gătite prin fierbere, abur sau cuptor, fără prăjire. Gramajele sunt pentru starea scrisă (uscat, crud, scurs).
// Energia și proteinele NU sunt scrise aici: se calculează din ingrediente (foods.ts), ca suma ingredientelor să fie
// egală cu rețeta și cu totalul zilei.

export type Slot = 'mic_dejun' | 'pranz' | 'cina' | 'gustare';

export interface Recipe {
  id: string;
  name: string;
  /** Unde se potrivește: micul dejun (B), fel principal (M, prânz sau cină), gustare (G). */
  kind: 'B' | 'M' | 'G';
  /** Familia culinară: aceeași familie nu apare la prânz și la cină în aceeași zi. */
  family: string;
  ingredients: { food: string; qty: number }[];
  steps: string;
  /** Observația din ghid (toleranță, păstrare). */
  note?: string;
  minutes: number;
  /** Fibre multe: departe de start. */
  highFiber?: boolean;
  /** Potrivit înaintea efortului (familiar, puține fibre și grăsimi), după toleranță. */
  preOk?: boolean;
}

export const RECIPES: Recipe[] = [
  { id: 'B01', name: 'Terci cu măr și iaurt', kind: 'B', family: 'terci', ingredients: [{ food: 'ovaz', qty: 60 }, { food: 'lapte', qty: 200 }, { food: 'mar', qty: 150 }, { food: 'iaurt', qty: 150 }], steps: 'Fierbi ovăzul cu laptele și puțină apă; adaugi mărul și iaurtul după ce s-a răcit puțin.', note: 'Mai departe de start dacă fibrele te deranjează.', minutes: 12, highFiber: true },
  { id: 'B02', name: 'Ouă la cuptor, pâine și roșii', kind: 'B', family: 'oua', ingredients: [{ food: 'ou', qty: 110 }, { food: 'paine', qty: 90 }, { food: 'rosii', qty: 200 }, { food: 'ulei', qty: 5 }], steps: 'Coci ouăle până sunt bine făcute; le servești cu pâinea și roșiile.', note: 'Gramajul oului e fără coajă (cam 2 ouă).', minutes: 20 },
  { id: 'B03', name: 'Iaurt cu banană, ovăz și nucă', kind: 'B', family: 'iaurt-bol', ingredients: [{ food: 'iaurt', qty: 250 }, { food: 'banana', qty: 120 }, { food: 'ovaz', qty: 40 }, { food: 'nuca', qty: 15 }], steps: 'Tai banana, toci nucile și amesteci totul.', note: 'Nu e o gustare mică.', minutes: 5 },
  { id: 'B04', name: 'Cottage cu pâine și căpșuni', kind: 'B', family: 'branza-paine', ingredients: [{ food: 'cottage', qty: 200 }, { food: 'paine', qty: 90 }, { food: 'capsuni', qty: 200 }], steps: 'Pui brânza pe pâine; fructele alături.', minutes: 5 },
  { id: 'B05', name: 'Orez cu lapte și iaurt', kind: 'B', family: 'orez-lapte', ingredients: [{ food: 'orez', qty: 70 }, { food: 'lapte', qty: 250 }, { food: 'iaurt', qty: 150 }, { food: 'banana', qty: 100 }], steps: 'Fierbi orezul în lapte și apă; adaugi iaurtul după răcire și banana la servire.', note: 'Bun de încercat înainte de efort, după cum îl tolerezi.', minutes: 25, preOk: true },
  { id: 'B06', name: 'Toast cu unt de arahide și lapte', kind: 'B', family: 'toast-arahide', ingredients: [{ food: 'paine', qty: 100 }, { food: 'arahide', qty: 25 }, { food: 'banana', qty: 120 }, { food: 'lapte', qty: 250 }], steps: 'Întinzi untul de arahide pe pâine; banana și laptele alături.', note: 'Verifică dacă untul de arahide are adaosuri.', minutes: 5, preOk: true },
  { id: 'B07', name: 'Omletă coaptă cu cartof și spanac', kind: 'B', family: 'oua-cartof', ingredients: [{ food: 'ou', qty: 120 }, { food: 'cartof', qty: 200 }, { food: 'spanac', qty: 100 }, { food: 'ulei', qty: 10 }, { food: 'iaurt', qty: 100 }], steps: 'Fierbi cartoful, îl amesteci cu ouăle și spanacul, apoi coci; iaurtul e sosul rece.', note: 'Cartoful se cântărește crud, curățat.', minutes: 30 },
  { id: 'M01', name: 'Pui cu orez și legume', kind: 'M', family: 'pui-cereale', ingredients: [{ food: 'pui', qty: 150 }, { food: 'orez', qty: 90 }, { food: 'mix-mexican', qty: 200 }, { food: 'ulei', qty: 10 }], steps: 'Coci puiul; fierbi orezul separat; gătești legumele și adaugi uleiul.', note: 'Puiul și orezul se cântăresc crude. Nu adăuga ulei în plus fără să-l notezi.', minutes: 30, preOk: true },
  { id: 'M02', name: 'Tocană de linte cu orez', kind: 'M', family: 'leguminoase', ingredients: [{ food: 'linte', qty: 80 }, { food: 'orez', qty: 60 }, { food: 'rosii-conserva', qty: 200 }, { food: 'morcov', qty: 100 }, { food: 'ulei', qty: 10 }], steps: 'Fierbi lintea cu morcovul și roșiile, după ambalaj; o servești cu orez.', note: 'Fibre multe: nu imediat înainte de alergare.', minutes: 40, highFiber: true },
  { id: 'M03', name: 'Somon cu cartof și spanac', kind: 'M', family: 'peste-cartof', ingredients: [{ food: 'somon', qty: 150 }, { food: 'cartof', qty: 300 }, { food: 'spanac', qty: 100 }, { food: 'ulei', qty: 5 }], steps: 'Coci somonul și cartofii; spanacul îl gătești cu puțină apă.', minutes: 35 },
  { id: 'M04', name: 'Paste integrale cu ton', kind: 'M', family: 'paste-peste', ingredients: [{ food: 'paste', qty: 100 }, { food: 'ton', qty: 120 }, { food: 'rosii-conserva', qty: 200 }, { food: 'ulei', qty: 10 }], steps: 'Fierbi pastele; încălzești roșiile, adaugi tonul scurs și uleiul.', note: 'Sarea depinde de conservă.', minutes: 20 },
  { id: 'M05', name: 'Cușcuș cu năut și iaurt', kind: 'M', family: 'cuscus-naut', ingredients: [{ food: 'cuscus', qty: 70 }, { food: 'naut', qty: 150 }, { food: 'rosii', qty: 200 }, { food: 'iaurt', qty: 100 }, { food: 'ulei', qty: 10 }], steps: 'Hidratezi cușcușul; îl amesteci cu năutul încălzit, roșiile și sosul de iaurt.', note: 'Năutul se cântărește scurs.', minutes: 15 },
  { id: 'M06', name: 'Tofu cu orez și legume', kind: 'M', family: 'tofu', ingredients: [{ food: 'tofu', qty: 250 }, { food: 'orez', qty: 100 }, { food: 'mix-mexican', qty: 250 }, { food: 'ulei', qty: 10 }], steps: 'Gătești tofu la abur, fierbi orezul și legumele; uleiul la final.', note: 'Tofu diferă mult între mărci: verifică eticheta.', minutes: 25 },
  { id: 'M07', name: 'Cartof copt cu cottage și fasole', kind: 'M', family: 'cartof-branza', ingredients: [{ food: 'cartof', qty: 300 }, { food: 'cottage', qty: 200 }, { food: 'fasole', qty: 100 }, { food: 'rosii', qty: 150 }, { food: 'ulei', qty: 5 }], steps: 'Coci cartoful; adaugi fasolea încălzită, brânza și roșiile.', minutes: 40 },
  { id: 'M08', name: 'Pui cu cușcuș și morcov', kind: 'M', family: 'pui-cereale', ingredients: [{ food: 'pui', qty: 150 }, { food: 'cuscus', qty: 85 }, { food: 'morcov', qty: 200 }, { food: 'iaurt', qty: 100 }, { food: 'ulei', qty: 10 }], steps: 'Coci puiul și morcovul; hidratezi cușcușul; iaurtul e sosul.', note: 'Se poate pregăti dinainte.', minutes: 30 },
  { id: 'M09', name: 'Chili de fasole, fără prăjire', kind: 'M', family: 'leguminoase', ingredients: [{ food: 'fasole', qty: 220 }, { food: 'orez', qty: 70 }, { food: 'rosii-conserva', qty: 200 }, { food: 'mix-mexican', qty: 150 }, { food: 'ulei', qty: 10 }], steps: 'Fierbi roșiile cu legumele, adaugi fasolea scursă și servești cu orez.', note: 'Fibre multe; condimente doar dacă le tolerezi.', minutes: 30, highFiber: true },
  { id: 'M10', name: 'Frittata cu cartof și cottage', kind: 'M', family: 'oua-cartof', ingredients: [{ food: 'ou', qty: 120 }, { food: 'cottage', qty: 150 }, { food: 'cartof', qty: 250 }, { food: 'spanac', qty: 100 }, { food: 'ulei', qty: 5 }], steps: 'Fierbi cartoful; pui totul într-un vas și coci până oul e bine făcut.', minutes: 30 },
  { id: 'M11', name: 'Paste cu linte și roșii', kind: 'M', family: 'leguminoase', ingredients: [{ food: 'paste', qty: 90 }, { food: 'linte', qty: 60 }, { food: 'rosii-conserva', qty: 250 }, { food: 'morcov', qty: 100 }, { food: 'ulei', qty: 10 }], steps: 'Fierbi lintea și pastele separat; le amesteci cu roșiile și morcovul gătite.', note: 'Fibre multe.', minutes: 40, highFiber: true },
  { id: 'M12', name: 'Salată consistentă cu ton și cartof', kind: 'M', family: 'salata-ton', ingredients: [{ food: 'ton', qty: 120 }, { food: 'cartof', qty: 300 }, { food: 'rosii', qty: 200 }, { food: 'ou', qty: 55 }, { food: 'ulei', qty: 10 }], steps: 'Fierbi cartoful și oul; după răcire amesteci cu tonul scurs și roșiile.', note: 'Ține-o la rece.', minutes: 25 },
  { id: 'M13', name: 'Somon cu orez și legume', kind: 'M', family: 'peste-cereale', ingredients: [{ food: 'somon', qty: 150 }, { food: 'orez', qty: 90 }, { food: 'mix-mexican', qty: 200 }, { food: 'ulei', qty: 5 }], steps: 'Coci somonul; fierbi orezul și gătești legumele separat.', minutes: 30 },
  { id: 'M14', name: 'Tocană de năut și tofu', kind: 'M', family: 'tofu', ingredients: [{ food: 'naut', qty: 160 }, { food: 'tofu', qty: 200 }, { food: 'rosii-conserva', qty: 200 }, { food: 'orez', qty: 60 }, { food: 'ulei', qty: 10 }], steps: 'Încălzești năutul și tofu în roșii; servești cu orez fiert.', note: 'Mai multe fibre: departe de start.', minutes: 25, highFiber: true },
  { id: 'G01', name: 'Iaurt și măr', kind: 'G', family: 'g-iaurt', ingredients: [{ food: 'iaurt', qty: 200 }, { food: 'mar', qty: 150 }], steps: 'Tai mărul și îl servești cu iaurt.', minutes: 3 },
  { id: 'G02', name: 'Lapte și banană', kind: 'G', family: 'g-lapte', ingredients: [{ food: 'lapte', qty: 250 }, { food: 'banana', qty: 120 }], steps: 'Separat sau mixate.', note: 'Nu înlocuiește o masă.', minutes: 3, preOk: true },
  { id: 'G03', name: 'Cottage și roșii', kind: 'G', family: 'g-branza', ingredients: [{ food: 'cottage', qty: 200 }, { food: 'rosii', qty: 150 }, { food: 'paine', qty: 40 }], steps: 'Pe pâine sau într-un bol.', minutes: 5 },
  { id: 'G04', name: 'Ou și pâine integrală', kind: 'G', family: 'g-ou', ingredients: [{ food: 'ou', qty: 55 }, { food: 'paine', qty: 60 }, { food: 'morcov', qty: 100 }], steps: 'Fierbi oul bine; îl servești cu pâine și morcov.', minutes: 12 },
  { id: 'G05', name: 'Iaurt, căpșuni și ovăz', kind: 'G', family: 'g-iaurt', ingredients: [{ food: 'iaurt', qty: 200 }, { food: 'capsuni', qty: 150 }, { food: 'ovaz', qty: 20 }], steps: 'Amesteci la servire.', minutes: 3 },
  { id: 'G06', name: 'Banană cu unt de arahide', kind: 'G', family: 'g-arahide', ingredients: [{ food: 'banana', qty: 120 }, { food: 'arahide', qty: 20 }], steps: 'Tai banana și adaugi untul de arahide.', note: 'Puține proteine față de o masă.', minutes: 3, preOk: true },
  { id: 'G07', name: 'Măr, nuci și lapte', kind: 'G', family: 'g-nuci', ingredients: [{ food: 'mar', qty: 150 }, { food: 'nuca', qty: 20 }, { food: 'lapte', qty: 200 }], steps: 'Ca gustare; laptele păstrat după ambalaj.', minutes: 3 },
];

export const RECIPE: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/** Rotația demonstrativă pe 14 zile din ghid (§16): mic dejun, prânz, cină, gustare. */
export const ROTATION_14: [string, string, string, string][] = [
  ['B01', 'M01', 'M09', 'G04'],
  ['B02', 'M02', 'M08', 'G05'],
  ['B03', 'M03', 'M11', 'G06'],
  ['B04', 'M04', 'M10', 'G07'],
  ['B05', 'M05', 'M12', 'G01'],
  ['B06', 'M06', 'M13', 'G02'],
  ['B07', 'M07', 'M14', 'G03'],
  ['B01', 'M08', 'M02', 'G04'],
  ['B02', 'M09', 'M01', 'G05'],
  ['B03', 'M10', 'M04', 'G06'],
  ['B04', 'M11', 'M03', 'G07'],
  ['B05', 'M12', 'M05', 'G01'],
  ['B06', 'M13', 'M06', 'G02'],
  ['B07', 'M14', 'M07', 'G03'],
];
