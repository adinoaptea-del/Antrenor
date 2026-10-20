import { runTargetProblem, type RunTargetLike } from '../../src/goals/intake-check.js';
import { describeChange, thresholdChanges, type ThresholdSet } from '../../src/goals/thresholds.js';
import { reassessGoal } from '../_lib/feasibility.js';
import { STRENGTH_LOG_CONFLICT, cleanEntry, strengthLogRow, strengthLogRowLegacy } from '../../src/strength/log.js';
import { fail, json, readJson, requireUser, todayIn, HttpError } from '../_lib/auth.js';
import { q, type Req, type Res } from '../_lib/http.js';
import { insert, one, remove, select, update, upsert } from '../_lib/db.js';
import { geocode } from '../_lib/weather.js';
import { readTest } from '../_lib/test-extract.js';
import { readLabs } from '../_lib/labs-extract.js';
import { saveSettings } from '../_lib/settings.js';
import { newAppleToken } from '../webhooks/apple.js';
import { ingestAndroid } from '../webhooks/android.js';
import { hasConsent } from '../_lib/consent.js';
import { disconnect } from '../_lib/tokens.js';
import { ENV } from '../_lib/env.js';
import type { BodyForm, LabsForm, TestsForm } from '../../src/api-types.js';
import type { PlannedWorkout, Sport } from '../../src/types.js';
import { undoWeatherSwap } from '../../src/calendar/weather-swap.js';
import { loadUser } from '../_lib/collect.js';
import { generateAndStore, reevaluateAfterImport, saveIntake, type IntakeLike } from '../_lib/plan.js';
import { rescore } from '../_lib/score.js';
import { reactToActivities } from '../_lib/react.js';
import { applyPlanEvents, executedIds, runAgents } from '../_lib/agents.js';
import { loadForms, loadPlan, toWorkoutRow } from '../_lib/collect.js';
import { activePain, sportsBlockedByPain, morningSafetyEvents, painSafetyEvents, urgentText, withIncidents, type MorningSafety } from '../../src/calendar/safety.js';
import { addDays, diffDays, localDayStartUtc, weekStart } from '../../src/util/dates.js';
import { AWAY_LABEL, applyAway, changeSport, easyWorkout, moveWorkout, restoreAway, type Away, type FixedMeet } from '../../src/calendar/actions.js';
import { currentAway, loadPrefs, savePrefs, walkProfileOf } from '../_lib/prefs.js';
import { markBadgesSeen } from '../_lib/badges.js';
import { MANUAL_TYPES } from '../../src/recovery/recovery.js';
import { isGoal, isRunGoal, isWalkGoal } from '../../src/calendar/phases.js';
import { walkForm } from '../_lib/walk-forms.js';
import type { WalkProfile } from '../../src/walking/plan.js';
import { shortenWorkout } from '../../src/calendar/validate.js';
import { outcomeFeedback, type Outcome, type OutcomeMotiv } from '../../src/calendar/outcomes.js';
import { ALL_ALLERGENS, FOODS } from '../../src/nutrition/foods.js';
import { RECIPE, type Slot } from '../../src/nutrition/recipes.js';
import { LOG_KEEP_DAYS, pruneLog, recordChoice, recordConsumed, recordSuggested, type MealLog } from '../../src/nutrition/log.js';

/**
 * POST /api/forms/intrare   → salvează chestionarul, programul, avizul, consimțământul; generează planul.
 * POST /api/forms/dimineata → { date, hooper, semnale }
 * POST /api/forms/seara     → { date, activityId, rpe, … , tip_neplanificat } → rescorează; dacă e în afara planului, rulează „dupa_antrenament” pentru calendar.
 * POST /api/forms/saptamanal → { weekStart, … }
 * POST /api/forms/analize → LabsForm (cinci valori) · /teste → TestsForm (+ zonele) · /corp → greutate, grăsime (rând „manual”)
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST');
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    const today = todayIn(user.tz);
    const kind = q(req, 'kind');
    const body = await readJson<Record<string, unknown>>(req);
    // Mersul pe jos: plimbări, ținta (cu jurnal), profilul.
    const walk = await walkForm(kind, body, { userId: u.id, tz: user.tz || 'Europe/Bucharest', today, goal: (user.goal as string | null) ?? null });
    if (walk) {
      json(res, 200, walk);
      return;
    }

    if (kind === 'intrare') {
      const intake = body as unknown as IntakeLike & { consimtamant?: boolean };
      if (!intake.consimtamant) throw new HttpError(400, 'fără consimțământ nu se salvează date de sănătate');
      // Același set de obiective în aplicație, server și bază; Ironman complet nu e încă disponibil.
      if (!isGoal(String(intake.obiectiv))) throw new HttpError(400, 'obiectiv indisponibil deocamdată: triatlon (sprint, olimpic, 70.3), alergare (5 km, 10 km, semimaraton, maraton), înot (1.500 / 1.900 / 3.800 m) sau bicicletă (50 / 100 / 160 km); fitness; mers pe jos');
      if (!isDate(intake.dataCursa) || intake.dataCursa <= today) throw new HttpError(400, 'data cursei trebuie să fie în viitor');
      // Auditul v93, A101: ramura „timp” fără țintă citibilă nu trece; „finalizare” nu cere timp.
      if (isRunGoal(String(intake.obiectiv))) {
        const problem = runTargetProblem((intake as { alergare?: RunTargetLike }).alergare);
        if (problem) throw new HttpError(400, problem);
      }
      // Auditul v93, A56: aceeași regulă ca la profil și în aplicație — AIRON e pentru adulți (18+).
      if (intake.anNastere != null && Number(today.slice(0, 4)) - Number(intake.anNastere) < 18) throw new HttpError(400, 'AIRON e pentru adulți (18 ani sau mai mult): planurile și mesele sunt calculate pentru adulți');
      await saveIntake(u.id, today, intake);
      // Alimentația declarată în chestionar devine preferința meselor (aceeași sursă ca ecranul „Mese recomandate”).
      const diet = (intake as { alimentatie?: unknown }).alimentatie;
      if (diet === 'omnivor' || diet === 'vegetarian' || diet === 'vegan') {
        const prefs = await loadPrefs(u.id);
        await savePrefs(u.id, { ...prefs, nutritie: { ...prefs.nutritie!, diet } });
      }
      // Mersul: ținta inițială, capacitatea și mersul alert devin profilul de mers (jurnalul țintei rămâne).
      if (isWalkGoal(intake.obiectiv)) {
        const m = (intake as { mers?: { tinta?: unknown; capacitate?: unknown; alert?: unknown } }).mers ?? {};
        const prefs = await loadPrefs(u.id);
        const profile = walkProfileOf({ ...prefs.mers, initial: Number(m.tinta), capacityMin: Number(m.capacitate), brisk: m.alert as WalkProfile['brisk'] });
        await savePrefs(u.id, { ...prefs, mers: profile });
      }
      const plan = await generateAndStore(u.id, today, intake);
      json(res, 200, { ok: true, plan });
      return;
    }
    if (kind === 'dimineata') {
      const date = formDate(body.date, today);
      await upsert('questionnaires', { user_id: u.id, kind, for_date: date, activity_id: null, answers: body }, 'user_id,kind,for_date,activity_id');
      // Protecția din cod, imediat la salvare, fără să aștepte agenții: febră, simptom cardiac, boală.
      const sem0 = (body.semnale as Record<string, unknown> | undefined) ?? {};
      // Auditul v93, A64: un simptom urgent scris în notă oprește calendarul imediat, ca bifa „simptom cardiac”.
      const safety = morningSafetyEvents(date, urgentText(typeof sem0.nota === 'string' ? sem0.nota : null) ? { ...sem0, simptom_cardiac: true } : sem0);
      const changes = await protect(u.id, today, user.tz, safety);
      json(res, 200, { ok: true, protectie: safety.events.length ? { verdict: safety.verdict, changes } : null });
      return;
    }
    if (kind === 'seara') {
      const date = formDate(body.date, today);
      const activityId = typeof body.activityId === 'string' ? body.activityId : null;
      await upsert('questionnaires', { user_id: u.id, kind, for_date: date, activity_id: activityId, answers: body }, 'user_id,kind,for_date,activity_id');
      // Durerea mare schimbă zilele următoare imediat, din cod, chiar dacă agenții nu rulează.
      await protect(u.id, today, user.tz, painSafetyEvents(date, body.durere));
      // Auditul v93, A64: simptomul urgent scris seara oprește și calendarul, nu doar ecranul.
      if (urgentText(typeof body.comentariu === 'string' ? body.comentariu : null)) await protect(u.id, today, user.tz, morningSafetyEvents(today, { simptom_cardiac: true }));
      const goal = user.goal && user.goal !== 'full' ? user.goal : '70.3';
      await rescore(u.id, today, goal);
      // RPE ≥ 7 sau tipul ales (cursă / altceva) schimbă reacția calendarului imediat.
      await reactToActivities(u.id, today).catch(() => undefined);
      let agents = null;
      // Antrenorul (activitate în afara planului) nu mai ține formularul deschis: aplicația îl pornește separat,
      // după ce fereastra s-a închis (apelul la model poate dura până la un minut).
      if (body.tip_neplanificat && body.tip_neplanificat !== 'altceva' && body.agentiSincron === true) agents = await runAgents(u.id, today, 'dupa_antrenament', true).catch((e: Error) => ({ error: e.message }));
      json(res, 200, { ok: true, agents });
      return;
    }
    if (kind === 'saptamanal') {
      const weekStart = typeof body.weekStart === 'string' && isDate(body.weekStart) ? body.weekStart : today;
      const prev = await one<{ answers: Record<string, unknown> }>('questionnaires', { user_id: `eq.${u.id}`, kind: 'eq.saptamanal', for_date: `eq.${weekStart}` }).catch(() => null);
      // Bilanțul de duminică, pe reguli: obosit (energie 1–2 din 5, „oboseala” a oprit săptămâna sau efort 9–10 la o
      // ședință) = săptămâna viitoare fără creștere și o intensitate mai puțin. Altfel planul merge înainte.
      const forms = await loadForms(u.id, today);
      const hardRpe = forms.evenings.filter((e) => e.date >= weekStart && e.date <= today && (e.rpe ?? 0) >= 9);
      const energie = typeof body.energie === 'number' ? body.energie : null;
      const motiv = energie != null && energie <= 2 ? `energie ${energie}/5` : body.aOprit === 'oboseala' ? 'oboseala a oprit săptămâna' : hardRpe.length ? `efort ${hardRpe[0]!.rpe}/10 la o ședință` : null;
      let changes: string[] = [];
      if (motiv) {
        const { planId, workouts } = await loadPlan(u.id, addDays(today, -7), addDays(today, 14));
        if (planId) changes = await applyPlanEvents(u.id, today, planId, workouts, [{ kind: 'bilant', date: today, obosit: true, motiv }]);
      }
      // Decizia se salvează lângă răspuns (auditul F55, F05): la redeschidere se vede ce s-a salvat și de ce planul s-a
      // schimbat sau nu. O corectare suprascrie răspunsul săptămânii; versiunea anterioară rămâne în „corectari”.
      const decizie = motiv ? { obosit: true, motiv, schimbari: changes.length, text: changes.length ? `săptămâna viitoare fără creștere și o intensitate mai puțin (${motiv})` : `oboseală notată (${motiv}), dar nu era nimic de redus în plan` } : { obosit: false, text: 'planul merge înainte: niciun semn de oboseală care să ceară o reducere' };
      const corectari = [...(((prev?.answers?.corectari as unknown[]) ?? []) as unknown[]), ...(prev ? [{ ...prev.answers, corectari: undefined }] : [])].slice(-5);
      await upsert('questionnaires', { user_id: u.id, kind, for_date: weekStart, activity_id: null, answers: { ...body, decizie, salvatLa: new Date().toISOString(), ...(corectari.length ? { corectari } : {}) } }, 'user_id,kind,for_date,activity_id');
      json(res, 200, { ok: true, bilant: motiv ? { obosit: true, motiv, changes } : { obosit: false }, decizie });
      return;
    }
    if (kind === 'forta-jurnal') {
      // Jurnalul de forță: ce s-a făcut efectiv (auditul v93, A57/A58). „declarat_conform” confirmă prescripția (nu e
      // măsurătoare; rezerva rămâne nescrisă), „ajustat” are valorile reale, pe serie. Cheia: ziua + exercițiul + ședința +
      // apariția în ședință, ca două ședințe în aceeași zi să nu se suprascrie; o notare nouă pentru aceeași apariție o
      // înlocuiește pe cea veche.
      const date = isDate(body.date) ? (body.date as string) : today;
      if (date > today) throw new HttpError(400, 'nu se notează o ședință din viitor');
      const items = (Array.isArray(body.items) ? body.items : []).map((e) => cleanEntry(e, date)).filter((e): e is NonNullable<typeof e> => !!e);
      if (!items.length) throw new HttpError(400, 'niciun exercițiu valid');
      try {
        await upsert('strength_log', items.map((e) => strengthLogRow(u.id, e)), STRENGTH_LOG_CONFLICT);
      } catch {
        // Baza încă la schema 10 (fără coloanele noi): forma veche, ca notarea să nu se piardă până la „Pregătește”.
        await upsert('strength_log', items.map((e) => strengthLogRowLegacy(u.id, e)), 'user_id,date,exercise');
      }
      json(res, 200, { ok: true, saved: items.length });
      return;
    }
    if (kind === 'analize') {
      const l = body as unknown as LabsForm;
      const vals = { feritina: n(l.feritina), vitamina_d: n(l.vitamina_d), hemoglobina: n(l.hemoglobina), ck: n(l.ck), crp: n(l.crp) };
      if (Object.values(vals).every((v) => v == null) && !l.alte?.length) throw new HttpError(400, 'cel puțin o valoare');
      const drawn = isDate(l.data) ? l.data : today;
      await remove('labs', { user_id: `eq.${u.id}`, drawn_at: `eq.${drawn}` });
      await insert('labs', { user_id: u.id, drawn_at: drawn, ...vals, other: l.alte?.length ? { laborator: l.laborator ?? null, valori: l.alte } : null });
      // Planul se reface cu analizele noi (pot limita sau elibera intensitatea).
      const intakeRow = await one<{ answers: IntakeLike }>('questionnaires', { user_id: `eq.${u.id}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
      const plan = intakeRow ? await generateAndStore(u.id, today, intakeRow.answers) : null;
      json(res, 200, { ok: true, plan });
      return;
    }
    if (kind === 'teste') {
      const t = body as unknown as TestsForm;
      if (!isDate(t.data)) throw new HttpError(400, 'data testului');
      // Auditul v93, A44: un CSS imposibil (sub 1:00 sau peste 4:00 pe 100 m) nu se salvează ca prag de înot.
      if (t.css != null && (!Number.isFinite(Number(t.css)) || Number(t.css) < 60 || Number(t.css) > 240)) throw new HttpError(400, 'CSS-ul se scrie în secunde pe 100 m (între 60 și 240), din testul 400 m + 200 m');
      // Zonele: numere pozitive, în ordine crescătoare; altfel nu se salvează (nu stricăm zonele existente).
      const zones = (z: (number | null)[] | undefined) => (z && z.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 260) && z.every((v, i) => i === 0 || (v as number) > (z[i - 1] as number)) ? z : null);
      await remove('tests', { user_id: `eq.${u.id}`, tested_at: `eq.${t.data}` });
      await insert('tests', { user_id: u.id, kind: t.tip, results: t, tested_at: t.data });
      // Doar zonele prezente în testul ăsta se schimbă: un test de alergare nu șterge FTP-ul sau CSS-ul de dinainte.
      const measured = {
        run_hr_zones: zones(t.alergare_z),
        run_threshold_pace_sec_km: paceSec(t.pace_prag),
        bike_ftp_w: n(t.ftp),
        bike_hr_zones: zones(t.bicicleta_z),
        swim_css_sec_100m: n(t.css),
        hr_max_test: n(t.fcmax),
      };
      const present = Object.fromEntries(Object.entries(measured).filter(([, v]) => v != null));
      if (Object.keys(present).length) {
        // Q10: un prag care sare cu peste 15% față de cel salvat nu rescrie zonele fără confirmarea sportivului
        // (vechi → nou, cu procentul); confirmarea vine cu `confirmat: true` din același formular.
        const prevZ = await one<ThresholdSet>('zones', { user_id: `eq.${u.id}` }, { select: 'run_threshold_pace_sec_km,bike_ftp_w,swim_css_sec_100m,hr_max_test,run_hr_zones,bike_hr_zones' }).catch(() => null);
        const changes = thresholdChanges(prevZ, present as ThresholdSet);
        if (changes.length && (body as { confirmat?: unknown }).confirmat !== true) {
          json(res, 200, { ok: false, confirmare: changes.map((c) => ({ camp: c.field, text: describeChange(c) })), mesaj: 'Pragurile noi diferă mult de cele salvate. Dacă testul e corect, confirmă; altfel verifică valorile.' });
          return;
        }
        await upsert('zones', { user_id: u.id, ...present, source: t.tip === 'altul' ? 'teren' : t.tip, tested_at: t.data, updated_at: new Date().toISOString() }, 'user_id');
        await insert('journal', { user_id: u.id, date: today, entry: `calendar: praguri din testul din ${t.data} (${t.tip}): ${Object.keys(present).join(', ')}${changes.length ? `; schimbări mari confirmate de sportiv: ${changes.map(describeChange).join('; ')}` : ''}` }).catch(() => undefined);
      }
      // Fezabilitatea obiectivului se rejudecă explicit la fiecare test (cum promite aplicația), nu doar la afișare.
      const fez = await reassessGoal(u.id, today, 'test').catch(() => null);
      json(res, 200, { ok: true, fezabilitate: fez });
      return;
    }
    if (kind === 'corp') {
      const b = body as unknown as BodyForm;
      if (n(b.greutate) == null) throw new HttpError(400, 'greutatea');
      const date = isDate(b.data) ? b.data : today;
      await upsert('wellness_daily', { user_id: u.id, date, source: 'manual', weight_kg: n(b.greutate), body_fat_pct: n(b.grasime_pct) }, 'user_id,date,source');
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'analize-citire') {
      // Doar citire: nu salvează nimic; sportivul verifică valorile și apoi salvează prin „analize”.
      const file = typeof body.file === 'string' ? body.file : '';
      const mediaType = typeof body.mediaType === 'string' ? body.mediaType : '';
      if (!file) throw new HttpError(400, 'lipsește fișierul');
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) throw new HttpError(400, 'doar PDF sau poză (JPG, PNG)');
      json(res, 200, { ok: true, citire: await readLabs(file, mediaType, u.id) });
      return;
    }
    if (kind === 'teste-citire') {
      // Doar citire: raportul clinicii; sportivul verifică și salvează prin „teste”.
      const file = typeof body.file === 'string' ? body.file : '';
      const mediaType = typeof body.mediaType === 'string' ? body.mediaType : '';
      if (!file) throw new HttpError(400, 'lipsește fișierul');
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) throw new HttpError(400, 'doar PDF sau poză (JPG, PNG)');
      json(res, 200, { ok: true, citire: await readTest(file, mediaType, u.id) });
      return;
    }
    if (kind === 'sugestie') {
      // Sportivul alege: varianta ușoară (intră în calendar) sau ședința din plan. Se revalidează pe starea de acum.
      const id = String(body.workoutId ?? '');
      const accept = body.accept === true;
      const row = await one<{ id: string; date: string; status: string; sport: string; type: string; key: boolean; planned_minutes: number; target_zones: number[]; structure: string | null; intervals: unknown; suggestion: { minutes: number; zones: number[]; structure: string; reason: string; accepted: boolean | null; sport?: string; original?: { minutes: number; zones: number[]; structure: string | null; intervals?: unknown; sport?: string; type?: string; key?: boolean } } | null }>('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}` });
      if (!row?.suggestion) throw new HttpError(404, 'nu există sugestie pentru ședința asta');
      const s = row.suggestion;
      if (row.status !== 'planificat' && row.status !== 'mutat') throw new HttpError(409, 'ședința nu mai e activă (anulată sau înlocuită); planul s-a schimbat');
      if (row.date < today) throw new HttpError(409, 'sugestia era pentru o zi trecută');
      // Aceeași alegere de două ori = nimic nou.
      if (s.accepted === accept) {
        json(res, 200, { ok: true, neschimbat: true });
        return;
      }
      if (accept) {
        const original = s.original ?? { minutes: row.planned_minutes, zones: row.target_zones, structure: row.structure, intervals: row.intervals ?? null, sport: row.sport, type: row.type, key: row.key };
        await update('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}`, status: 'in.(planificat,mutat)' }, { planned_minutes: s.minutes, target_zones: s.zones, structure: s.structure, intervals: null, ...(s.sport ? { sport: s.sport, type: 'z2', key: false } : {}), note: `varianta aleasă de tine (în loc de ${original.minutes} min${s.sport && original.sport && s.sport !== original.sport ? ` de ${original.sport}` : ''})`, suggestion: { ...s, accepted: true, original } });
      } else if (s.accepted === true && s.original) {
        // Revine la ședința din plan: prescripția originală se pune înapoi.
        await update('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}` }, { planned_minutes: s.original.minutes, target_zones: s.original.zones, structure: s.original.structure, intervals: s.original.intervals ?? null, ...(s.original.sport ? { sport: s.original.sport } : {}), ...(s.original.type ? { type: s.original.type, key: !!s.original.key } : {}), note: null, suggestion: { ...s, accepted: false } });
      } else {
        await update('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}` }, { suggestion: { ...s, accepted: false } });
      }
      await insert('journal', { user_id: u.id, date: today, entry: `calendar (sportivul): ${accept ? `a ales varianta ușoară pentru ${row.date} (${s.minutes} min „${s.structure.slice(0, 80)}”, în loc de ${row.planned_minutes} min)` : `rămâne pe planul din ${row.date} (${row.planned_minutes} min), nu pe varianta ușoară`}` }).catch(() => undefined);
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'admin-chei') {
      // Doar adminul (primul cont): cheile aplicațiilor de la producători, ca să nu fie nevoie de Vercel.
      const me = await one<{ role: string }>('users', { id: `eq.${u.id}` });
      if (me?.role !== 'admin') throw new HttpError(403, 'doar adminul poate pune cheile');
      const p = String(body.provider ?? '').toUpperCase();
      if (!['WHOOP', 'STRAVA', 'OURA'].includes(p)) throw new HttpError(400, 'producător necunoscut');
      const id = String(body.clientId ?? '').trim();
      const secret = String(body.clientSecret ?? '').trim();
      if (!id || !secret) throw new HttpError(400, 'lipsește Client ID sau Client Secret');
      await saveSettings({ [`${p}_CLIENT_ID`]: id, [`${p}_CLIENT_SECRET`]: secret } as never);
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'aviz') {
      // Trei stări: „da” = sportivul declară că are aviz; „nu” = medicul i-a limitat efortul (planul rămâne la Z1–Z2);
      // „necunoscut” = nu știm (nu blochează antrenamentul obișnuit și nu e prezentat ca aviz).
      const v = body.aviz === 'da' ? 'da' : body.aviz === 'nu' ? 'nu' : 'necunoscut';
      const da = v === 'da';
      await upsert('clearances', { user_id: u.id, cardiology: da, cleared_at: da ? today : null, intensity_allowed: v === 'nu' ? 'Z2' : 'toate' }, 'user_id');
      const intake = await one<{ id: string; answers: { sanatate?: Record<string, unknown> } }>('questionnaires', { user_id: `eq.${u.id}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
      let plan = null;
      if (intake) {
        const answers = { ...intake.answers, sanatate: { ...(intake.answers.sanatate ?? {}), avizCardiolog: v === 'necunoscut' ? null : v, limitareMedic: v === 'nu' } };
        await update('questionnaires', { id: `eq.${intake.id}`, user_id: `eq.${u.id}` }, { answers });
        // Intensitatea permisă schimbă planul: îl refacem de la lunea următoare, păstrând restul răspunsurilor.
        plan = await generateAndStore(u.id, today, answers as unknown as IntakeLike);
      }
      json(res, 200, { ok: true, plan });
      return;
    }
    if (kind === 'profil' && ('sex' in body || 'anNastere' in body)) {
      const sex = body.sex === 'm' || body.sex === 'f' ? body.sex : null;
      const year = Number(body.anNastere);
      const maxYear = Number(today.slice(0, 4)) - 18;
      if (!sex) throw new HttpError(400, 'alege sexul');
      if (!Number.isInteger(year) || year < 1930 || year > maxYear) throw new HttpError(400, `anul nașterii între 1930 și ${maxYear}`);
      const h = Number(body.inaltime);
      if (body.inaltime != null && body.inaltime !== '' && (!Number.isFinite(h) || h < 120 || h > 230)) throw new HttpError(400, 'înălțimea în cm, între 120 și 230');
      await update('users', { id: `eq.${u.id}` }, { sex, birth_year: year, ...(Number.isFinite(h) && h >= 120 && h <= 230 ? { height_cm: Math.round(h) } : {}) });
      // Vârsta schimbă structura planului (descărcare mai des de la 40 de ani): planul se reface.
      const intakeRow = await one<{ answers: IntakeLike }>('questionnaires', { user_id: `eq.${u.id}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
      const plan = intakeRow ? await generateAndStore(u.id, today, intakeRow.answers) : null;
      json(res, 200, { ok: true, plan });
      return;
    }
    if (kind === 'profil') {
      const city = typeof body.oras === 'string' ? body.oras.trim() : '';
      if (!city) {
        await update('users', { id: `eq.${u.id}` }, { city: null, lat: null, lon: null });
        json(res, 200, { ok: true, oras: null });
        return;
      }
      const g = await geocode(city);
      if (!g) throw new HttpError(400, `nu găsesc orașul „${city}”`);
      await update('users', { id: `eq.${u.id}` }, { city: g.name, lat: g.lat, lon: g.lon });
      json(res, 200, { ok: true, oras: g.name });
      return;
    }
    if (kind === 'activitate') {
      // Corectura sportivului: { activityId, sport?: 'inot'|'bicicleta'|'alergare'|'forta', ignored?: boolean, reset?: boolean }
      const id = String(body.activityId ?? '');
      if (!id) throw new HttpError(400, 'lipsește ședința');
      const own = await one<{ id: string }>('activities', { id: `eq.${id}`, user_id: `eq.${u.id}` });
      if (!own) throw new HttpError(404, 'ședință inexistentă');
      if (body.reset) {
        await remove('activity_overrides', { user_id: `eq.${u.id}`, activity_id: `eq.${id}` });
      } else {
        const sport = ['inot', 'bicicleta', 'alergare', 'forta', 'mers'].includes(String(body.sport)) ? String(body.sport) : null;
        await upsert('activity_overrides', { user_id: u.id, activity_id: id, sport, ignored: body.ignored === true, updated_at: new Date().toISOString() }, 'user_id,activity_id');
      }
      await rescore(u.id, today, ((user.goal as string | null) ?? '70.3') as '70.3').catch(() => undefined);
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'timp') {
      // „Am doar X minute azi”: scurtează ședința de azi corect; restul săptămânii nu se încarcă în plus.
      const id = String(body.workoutId ?? '');
      const minutes = Number(body.minutes);
      const row = await one<Record<string, unknown> & { id: string; date: string; status: string; planned_minutes: number; type: string; structure: string | null; note: string | null }>('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}` });
      if (!row) throw new HttpError(404, 'ședință inexistentă');
      if (row.status !== 'planificat' && row.status !== 'mutat') throw new HttpError(409, 'ședința nu mai e activă');
      if (row.date !== today) throw new HttpError(409, 'se poate scurta doar ședința de azi');
      // Aceeași regulă ca în mesaj: între 15 și durata din plan − 5 (sub 15 nu e ședință; peste − 5 nu e scurtare).
      if (!Number.isInteger(minutes) || minutes < 15 || minutes > row.planned_minutes - 5) throw new HttpError(400, `alege între 15 și ${row.planned_minutes - 5} min`);
      const { workouts } = await loadPlan(u.id, today, today);
      const w = workouts.find((x) => x.id === id);
      if (!w) throw new HttpError(404, 'ședință inexistentă');
      const shorter = shortenWorkout(w, minutes);
      await update('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}` }, { planned_minutes: shorter.plannedMinutes, type: shorter.type, target_zones: shorter.targetZones, intervals: shorter.intervals ?? null, structure: shorter.structure ?? null, note: shorter.note ?? null, is_key: shorter.key });
      // Jurnalul de decizie: înainte/după, ca orice altă schimbare a planului.
      await insert('journal', { user_id: u.id, date: today, entry: `calendar (sportivul): timp scurt — ${w.sport} ${w.type} ${w.plannedMinutes} min „${(w.structure ?? '').slice(0, 80)}” → ${shorter.plannedMinutes} min ${shorter.type} „${(shorter.structure ?? '').slice(0, 80)}”` }).catch(() => undefined);
      json(res, 200, { ok: true, structura: shorter.structure ?? null });
      return;
    }
    if (kind === 'nefacut') {
      // { workoutId, status: 'ratat' | 'partial', motiv, minute?, nota? }: declarată de sportiv, cu motiv; separată de
      // „anulată” (sistem / plecare) și de „fără date”. Retransmiterea suprascrie aceeași declarație, nu o dublează.
      const id = String(body.workoutId ?? '');
      // Răzgândirea (cererea lui Cuza, 20.10.2026): „nu am făcut-o” declarat azi se poate retrage tot azi — programul
      // s-a schimbat și ședința se mai face. Declarația dispare, ședința redevine de făcut, iar o ușurare pusă de
      // declarația asta revine la plan. Semnalele de sănătate (febră, durere) declarate rămân: siguranța nu se retrage.
      if (body.anuleaza === true) {
        const row0 = await one<{ id: string; date: string }>('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}` }, { select: 'id,date' });
        if (!row0) throw new HttpError(404, 'ședință inexistentă');
        if (row0.date !== today) throw new HttpError(409, 'se poate retrage doar în ziua ședinței');
        const prevOut = await one<{ status: string; motiv: string; reported_at: string }>('workout_outcomes', { user_id: `eq.${u.id}`, workout_id: `eq.${id}` });
        if (!prevOut) throw new HttpError(409, 'nu e nimic declarat pentru ședința asta');
        await remove('workout_outcomes', { user_id: `eq.${u.id}`, workout_id: `eq.${id}` });
        const left = await select<{ workout_id: string; date: string; status: 'ratat' | 'partial'; motiv: OutcomeMotiv }>('workout_outcomes', { user_id: `eq.${u.id}`, date: `gte.${addDays(today, -7)}` }, { limit: 50 }).catch(() => []);
        const stillTired = left.filter((o) => o.motiv === 'oboseala' || o.motiv === 'durere' || o.motiv === 'boala').length >= 2;
        let restored = 0;
        if (!stillTired) {
          const { planId, workouts } = await loadPlan(u.id, today, addDays(today, 8));
          const at = new Date().toISOString();
          const back = workouts
            .filter((w) => w.original && (w.note ?? '').startsWith('ușurată:') && (w.changedAt ?? '') >= prevOut.reported_at.slice(0, 10) && w.date >= today)
            .map((w) => ({ ...w, sport: w.original!.sport ?? w.sport, type: w.original!.type, plannedMinutes: w.original!.plannedMinutes, targetZones: [...w.original!.targetZones], structure: w.original!.structure ?? undefined, key: w.original!.key, intervals: w.original!.intervals ?? undefined, note: undefined, original: null, changedAt: at }));
          if (planId && back.length) await upsert('workouts_planned', back.map((w) => toWorkoutRow(w, u.id, planId)), 'id');
          restored = back.length;
        }
        await insert('journal', { user_id: u.id, date: today, entry: `declarat de sportiv: a retras „nefăcută” pentru ${id}; ședința redevine de făcut azi${restored ? `, ${restored} ședințe ușurate revin la plan` : ''}` }).catch(() => undefined);
        await rescore(u.id, today, ((user.goal as string | null) ?? '70.3') as '70.3').catch(() => undefined);
        const health = prevOut.motiv === 'durere' || prevOut.motiv === 'boala';
        json(res, 200, { ok: true, mesaj: `Gata: ședința e din nou în planul de azi.${restored ? ' Ce se ușurase din cauza ei a revenit la plan.' : ''}${health ? ' Ce ai spus despre durere sau boală rămâne valabil: dacă azi e zi galbenă sau roșie, ea decide.' : ''}` });
        return;
      }
      const status = body.status === 'partial' ? 'partial' : body.status === 'ratat' ? 'ratat' : null;
      const motiv = ['timp', 'oboseala', 'durere', 'boala', 'altul'].includes(String(body.motiv)) ? (String(body.motiv) as OutcomeMotiv) : null;
      if (!status || !motiv) throw new HttpError(400, 'alege ce s-a întâmplat și motivul');
      const row = await one<{ id: string; date: string; status: string; planned_minutes: number }>('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}` }, { select: 'id,date,status,planned_minutes' });
      if (!row) throw new HttpError(404, 'ședință inexistentă');
      if (row.date > today) throw new HttpError(409, 'ședința n-a avut loc încă; pentru zilele viitoare folosește Mută sau Plecat');
      if (row.status === 'anulat_sistem' || row.status === 'sters') throw new HttpError(409, 'ședința era deja anulată: nu e nimic de declarat');
      const minutes = status === 'partial' ? Number(body.minute) : null;
      if (status === 'partial' && (!Number.isInteger(minutes) || minutes! < 1 || minutes! >= row.planned_minutes)) throw new HttpError(400, `câte minute ai făcut? între 1 și ${row.planned_minutes - 1}`);
      const nota = typeof body.nota === 'string' ? body.nota.trim().slice(0, 300) : null;
      const reportedAt = new Date().toISOString();
      await upsert('workout_outcomes', { user_id: u.id, workout_id: id, date: row.date, status, motiv, minutes, nota, reported_at: reportedAt }, 'user_id,workout_id');
      const rows = await select<{ workout_id: string; date: string; status: 'ratat' | 'partial'; motiv: OutcomeMotiv; minutes: number | null }>('workout_outcomes', { user_id: `eq.${u.id}`, date: `gte.${addDays(today, -14)}` }, { limit: 50 }).catch(() => []);
      const outcomes: Outcome[] = rows.map((r) => ({ workoutId: r.workout_id, date: r.date, status: r.status, motiv: r.motiv, minutes: r.minutes }));
      const { planId, workouts } = await loadPlan(u.id, addDays(today, -14), addDays(today, 14));
      const fb = outcomeFeedback(workouts, outcomes, { workoutId: id, date: row.date, status, motiv, minutes, reportedAt }, today, reportedAt);
      if (planId && fb.changed.length) await upsert('workouts_planned', fb.changed.map((w) => toWorkoutRow(w, u.id, planId)), 'id');
      await insert('journal', { user_id: u.id, date: today, entry: `declarat de sportiv: ${fb.message}` }).catch(() => undefined);
      // Auditul v93, A03: boala sau durerea declarate aici intră în ACEEAȘI evaluare de siguranță ca formularele de
      // dimineață/seară, imediat, fără alt formular și fără AI. Semnalele se adaugă la ziua de azi (nu se șterg).
      const safety = await nefacutTriage(u.id, today, user.tz, motiv, body, nota);
      await rescore(u.id, today, ((user.goal as string | null) ?? '70.3') as '70.3').catch(() => undefined);
      json(res, 200, { ok: true, mesaj: safety.message ? `${safety.message} ${fb.message}` : fb.message, decizie: fb.decision, protectie: safety.events.length ? { verdict: safety.verdict, changes: safety.changes } : null });
      return;
    }
    if (kind === 'actiune') {
      // Acțiunile sportivului pe o ședință: { workoutId, op: 'muta', date }, { workoutId, op: 'usor' } sau { workoutId, op: 'sport', sport }.
      const id = String(body.workoutId ?? '');
      const op = String(body.op ?? '');
      const row = await one<{ date: string }>('workouts_planned', { id: `eq.${id}`, user_id: `eq.${u.id}` }, { select: 'date' });
      if (!row) throw new HttpError(404, 'ședință inexistentă');
      if (row.date < today) throw new HttpError(409, 'ședința e în trecut');
      const ws = weekStart(row.date);
      // Vecinii reali, inclusiv peste granița săptămânii (duminică–luni): planul se citește cu o zi înainte și după
      // (auditul de coaching, ch. 05/20). Opțiunile de mutare rămân în aceeași săptămână (moveOptions).
      const { planId, workouts } = await loadPlan(u.id, addDays(ws, -1), addDays(ws, 7));
      const w = workouts.find((x) => x.id === id);
      if (!planId || !w) throw new HttpError(404, 'ședința nu e în planul activ');
      const done = await executedIds(u.id, today, workouts);
      if (done.includes(id)) throw new HttpError(409, 'ședința e deja făcută');
      const at = new Date().toISOString();
      let next;
      try {
        if (op === 'vreme-inapoi') {
          // „Lasă-le cum erau”: inversarea după vreme se anulează pentru ambele ședințe.
          let back: PlannedWorkout[];
          try {
            const all = (await loadPlan(u.id, addDays(today, -1), addDays(today, 10))).workouts;
            back = undoWeatherSwap(all, id, today, at);
          } catch (e) {
            throw new HttpError(409, e instanceof Error ? e.message : String(e));
          }
          await upsert('workouts_planned', back.map((x) => toWorkoutRow(x, u.id, planId)), 'id');
          await insert('journal', { user_id: u.id, date: today, entry: 'calendar (sportivul): a lăsat ședințele în zilele din plan, fără inversarea după vreme' }).catch(() => undefined);
          await rescore(u.id, today, ((user.goal as string | null) ?? '70.3') as '70.3').catch(() => undefined);
          json(res, 200, { ok: true, note: 'înapoi în zilele din plan' });
          return;
        }
        if (op === 'inapoi') {
          // Răzgândirea la „Mută”: ședința amânată de tine revine în ziua din plan, dacă ziua aceea e azi sau mai târziu.
          const o = w.original;
          if (!o || !(w.note ?? '').startsWith('mutată de tine')) throw new HttpError(409, 'ședința n-a fost mutată de tine');
          if (o.date < today) throw new HttpError(409, 'ziua inițială a trecut');
          const onlyDate = w.type === o.type && w.plannedMinutes === o.plannedMinutes && (w.sport === (o.sport ?? w.sport));
          next = onlyDate ? { ...w, date: o.date, note: undefined, original: null, changedAt: at } : { ...w, date: o.date, note: 'pusă înapoi în ziua din plan', changedAt: at };
        } else if (op === 'muta') {
          // A65: mutarea se validează și pe programul liber și pe plecările anunțate.
          const [forms, prefsM] = await Promise.all([loadForms(u.id, today), loadPrefs(u.id)]);
          const program = (forms.intake as { program?: { day: number; startMin: number; endMin: number }[] } | null)?.program;
          next = moveWorkout(workouts, id, String(body.date ?? ''), today, at, done, { freeBlocks: Array.isArray(program) ? program : undefined, away: currentAway(prefsM, today) });
        }
        else if (op === 'usor') next = easyWorkout(w, at);
        else if (op === 'sport') {
          const forms = await loadForms(u.id, today);
          const pain = activePain(withIncidents(forms.evenings, forms.incidents.evenings), today);
          next = changeSport(w, String(body.sport ?? '') as Sport, at, pain);
        }
        else throw new HttpError(400, 'acțiune necunoscută');
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(409, e instanceof Error ? e.message : String(e));
      }
      await upsert('workouts_planned', toWorkoutRow(next, u.id, planId), 'id');
      await insert('journal', { user_id: u.id, date: today, entry: `calendar (sportivul): ${next.note ?? op}` }).catch(() => undefined);
      await rescore(u.id, today, ((user.goal as string | null) ?? '70.3') as '70.3').catch(() => undefined);
      json(res, 200, { ok: true, note: next.note ?? null });
      return;
    }
    if (kind === 'plecat') {
      // { dela, panala, ce } adaugă o plecare; { anuleaza: index } o scoate și pune planul la loc.
      const prefs = await loadPrefs(u.id);
      const at = new Date().toISOString();
      if (body.anuleaza != null) {
        const i = Number(body.anuleaza);
        const away = prefs.plecari[i];
        if (!away) throw new HttpError(404, 'plecare inexistentă');
        const { planId, workouts } = await loadPlan(u.id, today, addDays(away.panala, 7));
        const back = planId ? restoreAway(workouts, away, today, at) : [];
        if (back.length) await upsert('workouts_planned', back.map((x) => toWorkoutRow(x, u.id, planId!)), 'id');
        prefs.plecari.splice(i, 1);
        await savePrefs(u.id, prefs);
        await insert('journal', { user_id: u.id, date: today, entry: `plecat ${away.dela}–${away.panala} anulat: ${back.length} ședințe revin la plan` }).catch(() => undefined);
        json(res, 200, { ok: true, inapoi: back.length });
        return;
      }
      const dela = String(body.dela ?? '');
      const panala = String(body.panala ?? '');
      const ce = String(body.ce ?? '') as Away['ce'];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dela) || !/^\d{4}-\d{2}-\d{2}$/.test(panala)) throw new HttpError(400, 'alege datele plecării');
      if (panala < dela) throw new HttpError(400, 'întoarcerea e înainte de plecare');
      if (panala < today) throw new HttpError(400, 'plecarea e deja în trecut');
      if (diffDays(dela, panala) > 42) throw new HttpError(400, 'cel mult 6 săptămâni; pentru o pauză mai lungă, planul se reface');
      if (!(ce in AWAY_LABEL)) throw new HttpError(400, 'alege ce ai la dispoziție');
      const away: Away = { dela, panala, ce };
      if (prefs.plecari.some((a) => a.panala >= dela && a.dela <= panala)) throw new HttpError(409, 'se suprapune cu o plecare deja anunțată; anuleaz-o întâi');
      const { planId, workouts } = await loadPlan(u.id, dela < today ? today : dela, panala);
      const done = planId ? await executedIds(u.id, today, workouts) : [];
      const formsA = planId ? await loadForms(u.id, today) : null;
      const painA = formsA ? activePain(withIncidents(formsA.evenings, formsA.incidents.evenings), today) : null;
      const blockedA = (painA && painA.scor >= 3 ? sportsBlockedByPain(painA.loc) : []) as Sport[];
      const changed = planId ? applyAway(workouts, away, today, at, done, blockedA) : [];
      if (changed.length) await upsert('workouts_planned', changed.map((x) => toWorkoutRow(x, u.id, planId!)), 'id');
      prefs.plecari = [...currentAway(prefs, today), away].sort((a, b) => (a.dela < b.dela ? -1 : 1));
      await savePrefs(u.id, prefs);
      await insert('journal', { user_id: u.id, date: today, entry: `plecat ${dela}–${panala} (${AWAY_LABEL[ce]}): ${changed.length} ședințe schimbate` }).catch(() => undefined);
      json(res, 200, { ok: true, schimbate: changed.length });
      return;
    }
    if (kind === 'fixe') {
      // Întâlnirile fixe: [{ zi, sport, tip, eticheta }]. Planul se reface de la lunea viitoare ca să le respecte.
      const list = Array.isArray(body.fixe) ? (body.fixe as Record<string, unknown>[]) : [];
      if (list.length > 3) throw new HttpError(400, 'cel mult 3 întâlniri fixe');
      const fixe: FixedMeet[] = list.map((f) => {
        const zi = Number(f.zi);
        const sport = String(f.sport);
        const tip = String(f.tip);
        if (!Number.isInteger(zi) || zi < 0 || zi > 6) throw new HttpError(400, 'zi greșită');
        if (!['inot', 'bicicleta', 'alergare'].includes(sport)) throw new HttpError(400, 'sport greșit');
        if (!['lung', 'calitate', 'usor'].includes(tip)) throw new HttpError(400, 'tip greșit');
        const eticheta = typeof f.eticheta === 'string' ? f.eticheta.trim().slice(0, 40) : '';
        return { zi, sport: sport as FixedMeet['sport'], tip: tip as FixedMeet['tip'], ...(eticheta ? { eticheta } : {}) };
      });
      const prefs = await loadPrefs(u.id);
      await savePrefs(u.id, { ...prefs, fixe });
      const intakeRow = await one<{ answers: IntakeLike }>('questionnaires', { user_id: `eq.${u.id}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
      const plan = intakeRow ? await generateAndStore(u.id, today, intakeRow.answers) : null;
      const program = (intakeRow?.answers as { program?: { day: number }[] } | undefined)?.program ?? [];
      const outside = fixe.filter((f) => !program.some((b) => b.day === f.zi)).map((f) => f.zi);
      json(res, 200, { ok: true, plan, inAfaraProgramului: outside });
      return;
    }
    if (kind === 'nutritie') {
      // Preferințele de mese: { diet, exclude, allergiesConfirmed, budget, meals, mealTimes, snacksOk, proteinPowder,
      // indications } sau o alegere „Schimbă”: { alegere: { date, slot, recipeId, suggested } } (recipeId null = revine la
      // propunere), sau jurnalul (auditul v93, A84): { jurnal: { date, meals: [{ slot, recipeId }] } } = ce s-a propus azi;
      // { consumat: { date, slot, da } } = ce a mâncat. Alergiile nu se relaxează aici. Zilele trecute nu se rescriu.
      const prefs = await loadPrefs(u.id);
      const cur = prefs.nutritie!;
      const SLOTS = ['mic_dejun', 'pranz', 'cina', 'gustare'];
      const isDate = (d: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(d));
      const keepLog = (l: MealLog) => pruneLog(l, addDays(today, -LOG_KEEP_DAYS));
      if (body.jurnal) {
        const j = body.jurnal as { date?: string; meals?: { slot?: string; recipeId?: string }[] };
        if (!isDate(j.date) || !Array.isArray(j.meals)) throw new HttpError(400, 'jurnal greșit');
        // Doar ziua de azi (în fusul sportivului): o zi trecută nu se mai rescrie.
        if (String(j.date) !== today) throw new HttpError(400, 'jurnalul se scrie doar pentru azi');
        const meals = j.meals.filter((m) => SLOTS.includes(String(m.slot)) && RECIPE[String(m.recipeId)]).slice(0, 8).map((m) => ({ slot: String(m.slot) as Slot, recipeId: String(m.recipeId) }));
        await savePrefs(u.id, { ...prefs, nutritie: { ...cur, log: keepLog(recordSuggested(cur.log ?? {}, today, meals, today)) } });
        json(res, 200, { ok: true });
        return;
      }
      if (body.consumat) {
        // „Am mâncat” vine cu instantaneul cantităților (rețeta și gramajele de pe ecran în acel moment): masa mâncată nu
        // se mai recalculează (ch. 18). Instantaneul se validează: alimente din catalog, cantități 1–2000.
        const c = body.consumat as { date?: string; slot?: string; da?: boolean | null; recipeId?: string; items?: { food?: string; qty?: number }[] };
        if (!isDate(c.date) || !SLOTS.includes(String(c.slot))) throw new HttpError(400, 'consumat greșit');
        if (String(c.date) > today || String(c.date) < addDays(today, -7)) throw new HttpError(400, 'doar ultimele 7 zile');
        const items = Array.isArray(c.items) ? c.items.filter((i) => FOODS[String(i.food)] && Number.isFinite(Number(i.qty)) && Number(i.qty) >= 1 && Number(i.qty) <= 2000).slice(0, 20).map((i) => ({ food: String(i.food), qty: Math.round(Number(i.qty)) })) : [];
        const snapshot = c.da === true && items.length && RECIPE[String(c.recipeId)] ? { recipeId: String(c.recipeId), items } : null;
        await savePrefs(u.id, { ...prefs, nutritie: { ...cur, log: keepLog(recordConsumed(cur.log ?? {}, String(c.date), String(c.slot) as Slot, c.da === true ? true : c.da === false ? false : null, new Date().toISOString(), snapshot)) } });
        json(res, 200, { ok: true });
        return;
      }
      if (body.alegere) {
        const a = body.alegere as { date?: string; slot?: string; recipeId?: string | null; suggested?: string | null };
        if (!isDate(a.date) || !SLOTS.includes(String(a.slot))) throw new HttpError(400, 'alegere greșită');
        if (a.recipeId != null && !RECIPE[String(a.recipeId)]) throw new HttpError(400, 'rețetă necunoscută');
        const choices = Object.fromEntries(Object.entries(cur.choices ?? {}).filter(([d]) => d >= addDays(today, -28)));
        const day = { ...(choices[String(a.date)] ?? {}) } as Record<string, string>;
        if (a.recipeId == null) delete day[String(a.slot)];
        else day[String(a.slot)] = String(a.recipeId);
        choices[String(a.date)] = day;
        // Jurnalul: înlocuirea se scrie separat de propunere (propunerea rămâne cum a fost).
        const sug = a.suggested != null && RECIPE[String(a.suggested)] ? String(a.suggested) : null;
        const log = String(a.date) === today ? keepLog(recordChoice(cur.log ?? {}, today, String(a.slot) as Slot, a.recipeId == null ? null : String(a.recipeId), sug)) : cur.log;
        await savePrefs(u.id, { ...prefs, nutritie: { ...cur, choices, ...(log ? { log } : {}) } });
        json(res, 200, { ok: true });
        return;
      }
      const diet = ['omnivor', 'vegetarian', 'vegan'].includes(String(body.diet)) ? (String(body.diet) as 'omnivor') : cur.diet;
      const allowed: string[] = ALL_ALLERGENS;
      const exclude = Array.isArray(body.exclude) ? (body.exclude as unknown[]).map(String).filter((x) => allowed.includes(x)) : cur.exclude;
      const other = Array.isArray(body.other) ? (body.other as unknown[]).map((x) => String(x).trim().slice(0, 30)).filter((x) => x.length >= 2).slice(0, 10) : (cur.other ?? []);
      const budget = body.budget == null || body.budget === '' ? null : Number(body.budget);
      if (budget != null && (!Number.isFinite(budget) || budget < 20 || budget > 150)) throw new HttpError(400, 'bugetul: între 20 și 150 RON pe zi');
      const mn = Number(body.meals);
      const meals = ([1, 2, 3, 4].includes(mn) ? mn : 4) as 1 | 2 | 3 | 4;
      const cm = Number(body.currentMeals);
      const currentMeals = [1, 2, 3, 4, 5].includes(cm) ? cm : null;
      // Orele aproximative ale meselor (minute de la miezul nopții), câte una pe masă (la 1–2 decid slotul, A81; la 3–4
      // leagă mesele de orele ședințelor). Mai puține decât mesele = se folosesc orele implicite, spuse ca atare.
      const mealTimes = Array.isArray(body.mealTimes) ? (body.mealTimes as unknown[]).map(Number).filter((t) => Number.isInteger(t) && t >= 0 && t < 24 * 60).slice(0, meals) : (cur.mealTimes ?? null);
      const ind = (body.indications ?? cur.indications ?? {}) as { iron?: unknown; vitaminD?: unknown };
      await savePrefs(u.id, { ...prefs, nutritie: { ...cur, diet, exclude: exclude as never, other, allergiesConfirmed: body.allergiesConfirmed === true, budget, meals, currentMeals, mealTimes: mealTimes && mealTimes.length ? mealTimes.slice(0, meals) : null, snacksOk: body.snacksOk !== false, proteinPowder: body.proteinPowder === true, indications: { iron: ind.iron === true, vitaminD: ind.vitaminD === true } } });
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'inot-mediu') {
      // Bazin | Ape libere: se salvează explicit; schimbă ședințele viitoare de înot afișate, nu istoricul.
      const prefs = await loadPrefs(u.id);
      // Auditul v93, A43: confirmarea condițiilor pe zi (apa, supravegherea, locul cu ieșire, valurile/curenții).
      if (body.confirm) {
        const c = body.confirm as { date?: string; apa?: boolean; supraveghere?: boolean; loc?: boolean; conditii?: boolean };
        if (!isDate(c.date) || c.date < today) throw new HttpError(400, 'ziua confirmării nu e validă');
        if (!(c.apa && c.supraveghere && c.loc && c.conditii)) throw new HttpError(400, 'toate cele patru condiții trebuie confirmate; altfel rămâi la bazin azi');
        await savePrefs(u.id, { ...prefs, apeConfirmat: [...new Set([...(prefs.apeConfirmat ?? []).filter((d) => d >= addDays(today, -30)), c.date])] });
        json(res, 200, { ok: true });
        return;
      }
      const mediu = body.mediu === 'ape' ? 'ape' : body.mediu === 'bazin' ? 'bazin' : null;
      if (!mediu) throw new HttpError(400, 'mediu: bazin sau ape');
      await savePrefs(u.id, { ...prefs, mediuInot: mediu });
      json(res, 200, { ok: true, mediu });
      return;
    }
    if (kind === 'ore-sport') {
      // Câte ore pe săptămână are sportivul pentru sport (separat de timpul liber). Nu reface planul singur:
      // planul se reface din Profil, după previzualizare.
      const ore = Number(body.ore);
      if (!Number.isFinite(ore) || ore < 2 || ore > 30) throw new HttpError(400, 'între 2 și 30 de ore pe săptămână');
      const row = await one<{ id: string; answers: Record<string, unknown> }>('questionnaires', { user_id: `eq.${u.id}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
      if (!row) throw new HttpError(400, 'fără chestionar de intrare');
      await update('questionnaires', { id: `eq.${row.id}`, user_id: `eq.${u.id}` }, { answers: { ...row.answers, oreSport: Math.round(ore * 2) / 2 } });
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'recuperare') {
      // Adăugare manuală: { tip, minute, date? } sau ștergere: { sterge: id } (doar ce a adăugat sportivul).
      if (body.sterge) {
        await remove('other_activities', { id: `eq.${String(body.sterge)}`, user_id: `eq.${u.id}`, source: 'eq.manual' });
        json(res, 200, { ok: true });
        return;
      }
      const tip = String(body.tip ?? '');
      const minute = Number(body.minute);
      const date = formDate(body.date, today);
      if (!(MANUAL_TYPES as readonly string[]).includes(tip)) throw new HttpError(400, 'alege tipul de recuperare');
      if (!Number.isInteger(minute) || minute < 1 || minute > 300) throw new HttpError(400, 'minutele între 1 și 300');
      const id = `manual-${u.id.slice(0, 8)}-${Date.now().toString(36)}`;
      await insert('other_activities', { id, user_id: u.id, source: 'manual', external_id: id, date, start_local: null, kind: 'recuperare', name: tip, minutes: minute, avg_hr: null, max_hr: null });
      json(res, 200, { ok: true, id });
      return;
    }
    if (kind === 'insigne-vazute') {
      await markBadgesSeen(u.id);
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'deconectare') {
      // Deconectarea unei brățări: tokenul se șterge, importul se oprește. Datele importate deja rămân (ștergerea lor e separată).
      const p = String(body.provider ?? '');
      if (p === 'apple') await update('users', { id: `eq.${u.id}` }, { apple_token: null });
      else if (['whoop', 'strava', 'oura'].includes(p)) await disconnect(u.id, p as 'whoop' | 'strava' | 'oura');
      else throw new HttpError(400, 'brățară necunoscută');
      json(res, 200, { ok: true });
      return;
    }
    if (kind === 'samsung-import') {
      // Istoricul din exportul Samsung Health („Descărcare date personale”), citit în browser și trimis pe bucăți,
      // în formatul Health Connect: trece prin același parser ca datele zilnice de pe telefon.
      if (!(await hasConsent(u.id))) throw new HttpError(403, 'consimțământul pentru date de sănătate lipsește sau a fost retras');
      const b = body as { exercise?: unknown[]; sleep?: unknown[]; weight?: unknown[] };
      const n = (b.exercise?.length ?? 0) + (b.sleep?.length ?? 0) + (b.weight?.length ?? 0);
      if (n > 5000) throw new HttpError(413, 'prea multe înregistrări într-o singură trimitere');
      const r = await ingestAndroid({ id: u.id, tz: user.tz ?? null }, { ...body, app_version: 'samsung-health-export', timezone: user.tz || 'Europe/Bucharest' }, { history: true });
      json(res, 200, { ok: true, ...r });
      return;
    }
    if (kind === 'reevaluare') {
      // După un import de istoric: nivelul se recalculează și planul se reface de la luni doar dacă diferența contează.
      const r = await reevaluateAfterImport(u.id, today);
      json(res, 200, { ok: true, ...r });
      return;
    }
    if (kind === 'apple-arata') {
      // Arată adresa existentă fără s-o schimbe (o creează doar dacă nu există): altfel, o a doua apăsare strica adresa
      // deja lipită în telefon.
      const cur = await one<{ apple_token: string | null }>('users', { id: `eq.${u.id}` });
      let token = cur?.apple_token ?? null;
      if (!token) {
        token = newAppleToken();
        await update('users', { id: `eq.${u.id}` }, { apple_token: token });
      }
      json(res, 200, { ok: true, url: `${ENV.appUrl()}/api/webhooks/apple?t=${token}` });
      return;
    }
    if (kind === 'apple') {
      // Un token personal nou: adresa veche nu mai primește date.
      const token = newAppleToken();
      await update('users', { id: `eq.${u.id}` }, { apple_token: token });
      json(res, 200, { ok: true, url: `${ENV.appUrl()}/api/webhooks/apple?t=${token}` });
      return;
    }
    throw new HttpError(404, `formular necunoscut: ${kind}`);
  } catch (e) {
    fail(res, e);
  }
}

/** Aplică pe plan evenimentele de siguranță (o singură dată fiecare) și scrie avertismentul din cod, o dată pe zi. */
/**
 * Triajul din „Nu am făcut-o” (auditul v93, A03). Boală: febră / simptom cardiac / boală se adaugă la semnalele de azi
 * (aceleași reguli ca dimineața). Durere: scorul și locul intră ca raportare de durere (aceeași regulă ca seara). Nota
 * liberă trece prin detectorul de simptome urgente. Nimic nu așteaptă alt formular.
 */
async function nefacutTriage(userId: string, today: string, tz: string | null | undefined, motiv: string, body: Record<string, unknown>, nota: string | null): Promise<MorningSafety & { changes: string[] }> {
  const urgent = urgentText(nota);
  const sick = motiv === 'boala' || urgent != null;
  let out: MorningSafety & { changes: string[] } = { verdict: null, events: [], message: null, changes: [] };
  if (sick) {
    const add: Record<string, unknown> = { boala: motiv === 'boala' || undefined, febra: body.febra === true || undefined, simptom_cardiac: body.simptom_cardiac === true || urgent != null || undefined };
    const prev = await one<{ answers: Record<string, unknown> }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.dimineata', for_date: `eq.${today}`, activity_id: 'is.null' }).catch(() => null);
    const answers = prev?.answers ?? { date: today };
    const sem = { ...((answers.semnale as Record<string, unknown> | undefined) ?? {}) };
    for (const [k, v] of Object.entries(add)) if (v === true) sem[k] = true;
    if (nota) sem.nota = [typeof sem.nota === 'string' ? sem.nota : null, nota].filter(Boolean).join(' · ');
    await upsert('questionnaires', { user_id: userId, kind: 'dimineata', for_date: today, activity_id: null, answers: { ...answers, semnale: sem } }, 'user_id,kind,for_date,activity_id');
    const safety = morningSafetyEvents(today, sem);
    out = { ...safety, changes: await protect(userId, today, tz, safety) };
  }
  if (motiv === 'durere') {
    const scor = typeof body.scor === 'number' && body.scor >= 0 && body.scor <= 10 ? Math.round(body.scor) : null;
    const loc = typeof body.loc === 'string' ? body.loc.trim().slice(0, 60) : null;
    if (scor != null) {
      // Ca raportare de seară separată (fără să suprascrie formularul de seară al unei ședințe).
      await upsert('questionnaires', { user_id: userId, kind: 'seara', for_date: today, activity_id: `nefacut-${today}`, answers: { date: today, durere: { scor, loc }, comentariu: nota } }, 'user_id,kind,for_date,activity_id');
      const pain = painSafetyEvents(today, { scor, loc });
      const changes = await protect(userId, today, tz, pain);
      if (pain.events.length && (out.verdict == null || pain.verdict === 'rosu')) out = { ...pain, verdict: out.verdict === 'stop' ? 'stop' : pain.verdict, events: [...out.events, ...pain.events], message: out.message ?? pain.message, changes: [...out.changes, ...changes] };
    }
  }
  return out;
}

async function protect(userId: string, today: string, tz: string | null | undefined, safety: MorningSafety): Promise<string[]> {
  if (!safety.events.length) return [];
  const { planId, workouts } = await loadPlan(userId, addDays(today, -7), addDays(today, 14));
  const changes = planId ? await applyPlanEvents(userId, today, planId, workouts, safety.events) : [];
  if (safety.message) {
    const dayStart = localDayStartUtc(today, tz || 'Europe/Bucharest');
    const said = await one('messages', { user_id: `eq.${userId}`, kind: 'eq.avertisment', body: `eq.${safety.message}`, created_at: `gte.${dayStart}` });
    if (!said) await insert('messages', { user_id: userId, kind: 'avertisment', body: safety.message, decision: safety.verdict });
  }
  return changes;
}

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
/** Dată calendaristică reală (2026-02-30 nu trece). */
const isDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
/** Data unui formular: reală, nu în viitor, nu mai veche de 60 de zile; altfel ziua de azi. */
const formDate = (v: unknown, today: string): string => {
  if (v == null || v === '') return today;
  if (!isDate(v) || v > today || v < addDays(today, -60)) throw new HttpError(400, 'data formularului nu e validă');
  return v;
};
function paceSec(p: string | null | undefined): number | null {
  const m = p ? /^(\d{1,2}):([0-5]\d)$/.exec(p.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
