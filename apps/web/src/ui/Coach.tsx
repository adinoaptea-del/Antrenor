import { useState } from 'react';
import { Icons, fmtDayMonth } from './common';
import { useData, useMe } from '../data/store';
import { SPORT_LABEL, TYPE_LABEL, cleanRefs, dayOf, fmtMinutes, todayMessage, workoutsOn } from '../data/model';
import { AptQuestion, Sources } from './Today';
import { AppHeader, PageTitle } from './Shell';

// Coach: o singură voce, o decizie explicabilă. Întâi decizia din plan (aceeași ca pe Acasă), apoi mesajul
// antrenorului în 3–4 propoziții, apoi secțiuni la cerere: datele folosite, mesajele anterioare.

const PLAIN: Record<string, string> = { z2: 'ușor, să poți vorbi', tehnica: 'tehnică', calitate: 'intensitate', lung: 'ieșire lungă, ușor', brick: 'bicicletă apoi alergare', forta: 'forță', odihna: 'odihnă' };
const KIND_LABEL = { dimineata: 'Dimineața', dupa_antrenament: 'După antrenament', saptamanal: 'Săptămâna', memento: 'Memento', avertisment: 'Atenție', uman: 'Antrenorul' } as const;
const MEDICAL = /medic|cardiolog|analiz|feritin|hemoglobin|laborator|doctor/i;
const FOOD = /mănânc|mânc|carbo|proteine|hidrat|nutri|alimenta|hrăni|gel|calorii/i;

/** Împarte mesajul în: decizia (primele propoziții), nutriția și ce e de discutat cu medicul (la cerere). */
function splitMessage(body: string): { main: string[]; food: string[]; medical: string[] } {
  const paras = cleanRefs(body)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const main: string[] = [];
  const food: string[] = [];
  const medical: string[] = [];
  for (const p of paras) {
    if (MEDICAL.test(p) && main.length > 0) medical.push(p);
    else if (FOOD.test(p) && main.length > 0) food.push(p);
    else main.push(p);
  }
  return { main, food, medical };
}

export function Coach({ onOpen }: { onBack: () => void; onOpen: (screen: string) => void }) {
  const me = useMe();
  const { runAgents, local } = useData();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showOld, setShowOld] = useState(false);
  const [showData, setShowData] = useState(false);
  const [showFood, setShowFood] = useState(false);
  const [showMed, setShowMed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const today = me.today;
  const plan = workoutsOn(me, today);
  const doneToday = me.activities.some((a) => a.date === today);
  const day = dayOf(me);
  const { msg: latest, stale } = todayMessage(me);
  const older = me.messages.filter((m) => m !== latest).slice(0, 10);
  const parts = latest ? splitMessage(latest.body) : null;
  const tomorrow = me.plan
    .filter((w) => (w.status === 'planificat' || w.status === 'mutat') && w.date > today && w.type !== 'odihna')
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  // „Ce s-a schimbat?”: un mesaj nou doar dacă există date sau o decizie nouă; altfel spunem că nu e nimic nou.
  const ask = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (latest && !stale && !doneToday) {
        setNote(`Nimic nou de la ${localTime(latest.createdAt)}: mesajul e scris pe decizia de acum (${day?.title.toLowerCase() ?? 'fără decizie'}).`);
        return;
      }
      setNote(await runAgents(doneToday ? 'dupa_antrenament' : 'dimineata', true));
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader name={me.user.name} onProfile={() => onOpen('profil')} />
      <PageTitle title="Head coach" sub="O singură voce. O decizie explicabilă." />

      <div className="stack">
        <section className="card coach-dec">
          <div className="eyebrow">Decizia din plan · {fmtDayMonth(today)}</div>
          <h2 className="h-xl">{day ? `${day.rest ? 'Astăzi, odihnă' : day.title}.` : me.plan.length ? 'Astăzi' : 'Fără plan încă'}</h2>
          {day && <p className="tc-action">{day.action}</p>}
          {day?.ask && <AptQuestion />}
          {plan.filter((w) => w.type !== 'odihna').length > 0 && (
            <div className="coach-plan">
              {plan
                .filter((w) => w.type !== 'odihna')
                .map((w) => (
                  <div key={w.id} className={`cp-row ${w.status === 'anulat_sistem' || (day && (day.level === 'rosu' || day.level === 'stop')) ? 'off' : ''}`}>
                    <span className="cp-s">{SPORT_LABEL[w.sport]}</span>
                    <span className="cp-t">
                      {w.type === 'forta' && w.structure ? cleanRefs(w.structure) : `${PLAIN[w.type] ?? TYPE_LABEL[w.type]}${w.structure ? ` · ${cleanRefs(w.structure)}` : ''}`}
                    </span>
                    <span className="cp-m">{fmtMinutes(w.plannedMinutes)}</span>
                  </div>
                ))}
            </div>
          )}
          {tomorrow && (
            <p className="small muted" style={{ marginTop: 8 }}>
              Urmează: {SPORT_LABEL[tomorrow.sport].toLowerCase()}, {fmtMinutes(tomorrow.plannedMinutes)}, {tomorrow.date === addDay(today) ? 'mâine' : fmtDayMonth(tomorrow.date)}.
            </p>
          )}
          {day?.reason && <blockquote className="coach-why">{cleanRefs(day.reason)}</blockquote>}
        </section>

        <section className="card">
          <div className="eyebrow">{latest ? `${kindLabel(latest.kind, latest.createdAt)} · ${localTime(latest.createdAt)}` : 'Mesajul antrenorului'}</div>
          {parts ? (
            <div className="coach-msg">
              {(showAll ? parts.main : parts.main.slice(0, 2)).map((l, i) => (
                <p key={i}>{l}</p>
              ))}
              {parts.main.length > 2 && (
                <button className="link-btn" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
                  {showAll ? 'Mai puțin' : 'Tot mesajul'}
                </button>
              )}
            </div>
          ) : (
            <p className="small muted">{stale ? 'Mesajul de azi a fost scris pe date mai vechi; decizia s-a schimbat între timp. Cere unul nou.' : 'Încă nu ți-a scris azi. Scrie singur la 05:30 și după fiecare antrenament sincronizat.'}</p>
          )}
          {!local && me.intakeComplete && !day?.ask && (
            <div className="wk-btns" style={{ marginTop: 12 }}>
              <button className="btn sm" disabled={busy} onClick={() => void ask()}>
                {busy ? 'Se gândește… (până la un minut)' : doneToday ? 'Cum a fost antrenamentul?' : stale || !latest ? 'Scrie mesajul de azi' : 'Ce s-a schimbat?'}
              </button>
              <button className="pill" onClick={() => onOpen('calendar')}>
                Vreau să adaptez planul
              </button>
              <button className="pill" onClick={() => onOpen('dimineata')}>
                Am o durere
              </button>
            </div>
          )}
          {note && note !== 'Gata.' && <p className="tiny muted" style={{ marginTop: 8 }}>{note}</p>}
        </section>

        <section className="card tight">
          <button className="exp-row" onClick={() => setShowData(!showData)} aria-expanded={showData}>
            <span>
              <b>Pe ce se bazează mesajul</b>
              <small>brățările citite azi și decizia aplicației</small>
            </span>
            {showData ? Icons.chevronDown : Icons.chevronRight}
          </button>
          {showData && (
            <div className="exp-body">
              <Sources />
              <p className="tiny muted">Antrenorul primește decizia aplicației (din brățări, chestionar și plan) și o explică; nu schimbă singur culoarea zilei. Datele Strava ajung doar la antrenorul tău, nu la alți sportivi.</p>
            </div>
          )}
          {parts && parts.food.length > 0 && (
            <>
              <button className="exp-row" onClick={() => setShowFood(!showFood)} aria-expanded={showFood}>
                <span>
                  <b>Nutriție</b>
                  <small>ce a scris antrenorul despre mâncare și hidratare</small>
                </span>
                {showFood ? Icons.chevronDown : Icons.chevronRight}
              </button>
              {showFood && (
                <div className="exp-body coach-msg">
                  {parts.food.map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                </div>
              )}
            </>
          )}
          {parts && parts.medical.length > 0 && (
            <>
              <button className="exp-row" onClick={() => setShowMed(!showMed)} aria-expanded={showMed}>
                <span>
                  <b>De discutat cu medicul</b>
                  <small>observații din analize, separat de plan</small>
                </span>
                {showMed ? Icons.chevronDown : Icons.chevronRight}
              </button>
              {showMed && (
                <div className="exp-body coach-msg">
                  {parts.medical.map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                  <p className="tiny muted">Nu e sfat medical. Analizele se interpretează cu medicul tău.</p>
                </div>
              )}
            </>
          )}
          {older.length > 0 && (
            <button className="exp-row" onClick={() => setShowOld(!showOld)} aria-expanded={showOld}>
              <span>
                <b>Mesaje anterioare</b>
                <small>{older.length} mesaje</small>
              </span>
              {showOld ? Icons.chevronDown : Icons.chevronRight}
            </button>
          )}
        </section>

        {showOld &&
          older.map((m) => (
            <section key={m.id} className="card tight">
              <div className="eyebrow">
                {kindLabel(m.kind, m.createdAt)} · {localStamp(m.createdAt)}
              </div>
              <div className="coach-msg old">
                {cleanRefs(m.body)
                  .split('\n')
                  .filter((l) => l.trim())
                  .map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
              </div>
            </section>
          ))}
      </div>
    </>
  );
}

function addDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/** Ora mesajului în fusul telefonului (serverul o salvează în UTC). */
function localStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ');
  return `${fmtDayMonth(localDay(iso))} ${localTime(iso)}`;
}

/** Eticheta după ora la care a fost scris mesajul, nu după tipul tehnic: un mesaj de „dimineață” cerut la 22:00 e de seară. */
function kindLabel(kind: keyof typeof KIND_LABEL, iso: string): string {
  if (kind !== 'dimineata') return KIND_LABEL[kind];
  const h = new Date(iso).getHours();
  return h < 11 ? 'Dimineața' : h < 18 ? 'Azi' : 'Seara';
}
