// Mesajele de la deschiderea aplicației: scurte, pozitive, despre drumul până la cursă. Unul la întâmplare, de fiecare dată.

export const MOTIVATION: string[] = [
  'Fiecare antrenament de azi e o bucată din linia de sosire.',
  'Nu trebuie să fie perfect. Trebuie doar să fie făcut.',
  'Corpul tău ține minte fiecare kilometru. Azi mai adaugi unul.',
  'Progresul nu face zgomot. Dar se vede în cifre.',
  'Ești mai departe decât erai acum o lună.',
  'Ziua de azi contează. Și cea de ieri a contat.',
  'Drumul până la cursă e făcut din zile obișnuite ca asta.',
  'Constanța bate intensitatea. Vino și azi.',
  'Odihna e tot antrenament. Și ea te duce la cursă.',
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
  'Corpul se adaptează. Lasă-l să-și facă treaba.',
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
  'Recuperarea de azi e viteza de mâine.',
  'Tu ai pornit. Restul e doar continuare.',
];

/** Un mesaj la întâmplare, diferit de cel de data trecută (când browserul păstrează alegerea). */
export function randomMotivation(): string {
  let last = -1;
  try {
    last = Number(localStorage.getItem('airon.motivatie') ?? -1);
  } catch {
    /* fără stocare: doar la întâmplare */
  }
  let i = Math.floor(Math.random() * MOTIVATION.length);
  if (i === last) i = (i + 1) % MOTIVATION.length;
  try {
    localStorage.setItem('airon.motivatie', String(i));
  } catch {
    /* ignorat */
  }
  return MOTIVATION[i]!;
}
