// Seed-ul demo pentru auditul de layout: completează chestionarul în modul local, apoi pornește aplicația.
import { localServer } from '../../apps/web/src/data/local';
import { EMPTY_INTAKE } from '../../apps/web/src/forms/types';
(window as any).seedDemo = async () => {
  const intake = {
    ...EMPTY_INTAKE,
    nume: 'Cuza',
    sex: 'm',
    anNastere: 1985,
    inaltime: 180,
    alimentatie: 'omnivor',
    obiectiv: '70.3',
    dataCursa: '2027-09-12',
    inot: { nivel: 'continuu_400', apeDeschise: 'putin', bazin: true },
    bicicleta: { tip: 'sosea', trainer: true, putere: false, ceaMaiLungaOre: 2 },
    alergare: { ceaMaiLungaKm: 15, curseRecente: 'semimaraton', ramura: 'finalizare', ritmActual: '6:00' },
    echipament: { ceas: 'garmin', whoop: true, oura: false, cantar: true },
    program: [1, 2, 3, 4, 5].map((day) => ({ day, startMin: 17 * 60, endMin: 20 * 60 })).concat([{ day: 6, startMin: 8 * 60, endMin: 12 * 60 }, { day: 0, startMin: 8 * 60, endMin: 12 * 60 }]),
    oreSport: 8,
    oreRecente: 5,
    sanatate: { avizCardiolog: 'da', accidentari: '', limitareMedic: false },
    minte: { motiveaza: 'cursa', aOprit: 'timpul' },
    consimtamant: true,
  };
  return localServer.form('intrare', intake);
};
