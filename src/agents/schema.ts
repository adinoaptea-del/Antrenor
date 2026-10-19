// Schemele JSON pentru răspunsurile structurate ale modelului (Messages API, output_config.format = json_schema).
// Fără constrângeri numerice sau de lungime (nu sunt suportate); limitele se verifică în verify.ts.

export const SPECIALIST_SCHEMA = {
  type: 'object',
  properties: {
    agent: { type: 'string', enum: ['fiziolog', 'antrenor_inot', 'antrenor_bicicleta', 'antrenor_alergare', 'antrenor_forta', 'nutritionist', 'fizioterapeut', 'minte'] },
    verdict: { type: 'string', enum: ['ok', 'atentie', 'stop', 'tacere', 'verde', 'galben', 'rosu'] },
    ce: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          cifre: {
            type: 'array',
            items: {
              type: 'object',
              properties: { valoare: { type: ['number', 'string'] }, camp: { type: 'string' } },
              required: ['valoare', 'camp'],
              additionalProperties: false,
            },
          },
        },
        required: ['text', 'cifre'],
        additionalProperties: false,
      },
    },
    mese: { type: 'array', items: { type: 'string' } },
    pentru_viitor: { type: 'string' },
    lipseste: { type: 'array', items: { type: 'string' } },
  },
  required: ['agent', 'verdict', 'ce', 'mese', 'pentru_viitor', 'lipseste'],
  additionalProperties: false,
} as const;

export const HEAD_SCHEMA = {
  type: 'object',
  properties: {
    decizie: { type: 'string', enum: ['verde', 'galben', 'rosu', 'stop'] },
    mesaj: { type: 'string' },
    memento: { type: 'string' },
    jurnal: { type: 'array', items: { type: 'string' } },
    intrebare: { type: ['string', 'null'] },
    optiune: { type: ['string', 'null'] },
    propunere: {
      type: ['object', 'null'],
      properties: {
        actiune: { type: 'string', enum: ['usureaza', 'scurteaza'] },
        tinta: { type: 'string', enum: ['azi', 'maine'] },
        index: { type: 'integer' },
        minute: { type: ['integer', 'null'] },
        dovezi: { type: 'array', items: { type: 'string' } },
        motiv: { type: 'string' },
      },
      required: ['actiune', 'tinta', 'index', 'minute', 'dovezi', 'motiv'],
      additionalProperties: false,
    },
  },
  required: ['decizie', 'mesaj', 'memento', 'jurnal', 'intrebare', 'optiune', 'propunere'],
  additionalProperties: false,
} as const;

export interface HeadResponse {
  decizie: 'verde' | 'galben' | 'rosu' | 'stop';
  mesaj: string;
  memento: string;
  jurnal: string[];
  intrebare: string | null;
  /** Doar când pachetul are acoperire_azi.stare = partial: id-ul variantei alese pentru restul zilei. */
  optiune?: string | null;  /** O observație a antrenorului transformată în propunere structurată; validatorul o acceptă sau o respinge. */
  propunere?: Proposal | null;
}

export interface Proposal {
  actiune: 'usureaza' | 'scurteaza';
  tinta: 'azi' | 'maine';
  /** Indexul ședinței în plan_azi_toate / plan_maine_toate. */
  index: number;
  minute: number | null;
  /** Câmpurile din pachet care susțin propunerea (ex. „hrv.azi”, „somn.durata_min”). */
  dovezi: string[];
  motiv: string;
}
