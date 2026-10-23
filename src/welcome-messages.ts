// Mesajele de întâmpinare, după ziua sportivului (cererea proprietarului, 23.10.2026): în zi de odihnă (fără ședință
// în plan, sau zi roșie / stop) mesaje despre relaxare și recuperare; în zi de antrenament mesaje care motivează.
// Logica e aici (testată în tests/welcome-messages.test.ts); telefonul doar ține minte ultimul mesaj ales.

export type WelcomeKind = 'antrenament' | 'odihna';

export const TRAINING_MESSAGES: string[] = [
  'Fiecare antrenament de azi e o bucată din linia de sosire.',
  'Nu trebuie să fie perfect. Trebuie doar să fie făcut.',
  'Corpul tău ține minte fiecare kilometru. Azi mai adaugi unul.',
  'Progresul nu face zgomot. Dar se vede în cifre.',
  'Ești mai departe decât erai acum o lună.',
  'Ziua de azi contează. Și cea de ieri a contat.',
  'Drumul până la cursă e făcut din zile obișnuite ca asta.',
  'Constanța bate intensitatea. Vino și azi.',
  'Cursa se câștigă în dimineți ca asta.',
  'Mic azi, mare la sosire.',
  'Ai început. Asta a fost partea cea mai grea.',
  'Fiecare zonă 2 făcută cum trebuie e o cărămidă în plus.',
  'Respiră, zâmbește, pornește.',
  'Nu te compara cu alții. Compară-te cu tine de săptămâna trecută.',
  'Datele nu mint: ești pe drum.',
  'Oboseala de azi e forma de mâine.',
  'Un pas mai departe decât ieri. Atât.',
  'Cei care termină sunt cei care au continuat.',
  'Linia de sosire e mai aproape cu o zi.',
  'Ai ales ceva greu. De aceea o să fie frumos.',
  'Azi e o zi bună să-ți faci viitorul mai ușor.',
  'Ritmul tău e ritmul bun.',
  'Inima ta se face mai puternică cu fiecare ședință.',
  'Nu contează cât de repede. Contează că nu te oprești.',
  'Fiecare metru de azi se adună la sosire.',
  'Picioarele obosesc. Hotărârea nu.',
  'Ce faci constant devine ce ești.',
  'Pregătirea ta, regulile tale, sosirea ta.',
  'Azi construiești sportivul care o să treacă linia.',
  'Câteva minute în plus azi, mulți kilometri în plus la cursă.',
  'Ești exact unde trebuie să fii în plan.',
  'Fă azi ce o să-ți mulțumească tu cel de la start.',
  'Disciplina e un cadou pe care ți-l faci singur.',
  'O zi ratată nu strică nimic. Ziua de azi le repară pe toate.',
  'Sosirea se simte de acum. Continuă.',
  'Fiecare zi e un nou început de antrenament.',
  'Nu trebuie să-ți placă fiecare ședință. Trebuie să le duci.',
  'Mai puternic, mai rezistent, mai liniștit. Pas cu pas.',
  'Ai deja mai mulți kilometri în picioare decât crezi.',
  'Azi contează puțin. Toate zilele la un loc contează enorm.',
  'Progresul se adună în liniște, apoi apare dintr-odată.',
  'Ești mai aproape de cursă decât de ziua în care ai început.',
  'Bucură-te de drum. Sosirea vine oricum.',
  'Mintea limpede, inima puternică, pașii siguri.',
  'Fiecare ședință e un vot pentru omul care vrei să fii.',
  'Hai, încă o zi bună pentru cifrele tale.',
  'Tu ai pornit. Restul e doar continuare.',
];

export const REST_MESSAGES: string[] = [
  'Azi e zi de odihnă. Și odihna te duce la cursă.',
  'Corpul se face mai puternic acum, cât te odihnești.',
  'Recuperarea de azi e viteza de mâine.',
  'Fără ceas, fără ritm de urmărit. Doar odihnă.',
  'Somn bun, mâncare bună, picioare sus. Atât azi.',
  'Ce ai muncit zilele astea se așază acum în corp.',
  'Odihna face parte din plan. Ia-o în serios.',
  'O plimbare ușoară, puțină mobilitate, nimic mai mult.',
  'Azi nu se câștigă nimic forțând. Se câștigă odihnindu-te.',
  'Lasă corpul să-și facă treaba. Tu doar relaxează-te.',
  'Mintea are și ea nevoie de pauză. Fă ceva ce îți place.',
  'Bea apă, dormi devreme, zâmbește. Mâine se continuă.',
  'Zilele de pauză sunt cele în care cresc mușchii.',
  'Respiră adânc. Azi nu ai nimic de dovedit.',
  'O zi liniștită acum înseamnă o ședință bună mâine.',
  'Te-ai antrenat. Acum lasă adaptarea să vină.',
  'Pauza nu e timp pierdut. E timp câștigat pentru cursă.',
  'Azi îți încarci bateriile pentru ce urmează.',
  'Liniște, odihnă, recuperare. Și asta e tot antrenament.',
  'Bucură-te de zi. Planul te așteaptă mâine.',
];

/** Ziua de azi: odihnă când nu e nicio ședință activă (în afara „odihnă”), sau ziua e roșie / stop / marcată odihnă. */
export function welcomeKind(i: { sessions: { type: string; status: string }[]; day?: { level: string; rest?: boolean } | null }): WelcomeKind {
  if (i.day && (i.day.rest || i.day.level === 'rosu' || i.day.level === 'stop')) return 'odihna';
  const active = i.sessions.filter((w) => w.type !== 'odihna' && (w.status === 'planificat' || w.status === 'mutat'));
  return active.length ? 'antrenament' : 'odihna';
}

/** Un mesaj din lista zilei, diferit de ultimul ales pentru același tip de zi. */
export function pickWelcome(kind: WelcomeKind, last: number | null, rnd: () => number = Math.random): { index: number; text: string } {
  const list = kind === 'odihna' ? REST_MESSAGES : TRAINING_MESSAGES;
  let i = Math.floor(rnd() * list.length) % list.length;
  if (i === last) i = (i + 1) % list.length;
  return { index: i, text: list[i]! };
}
