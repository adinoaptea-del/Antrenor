# Pornire de la zero

Aplicația rulează pe **Vercel** (aplicația + serverul) cu **Supabase** (baza de date și conturile), adăugat din Vercel.
Singura cheie lipită de mână e cea Anthropic. Restul se configurează singur.

## 1. Vercel + Supabase (≈10 minute)

1. https://vercel.com/new → Import pe repo-ul `Antrenor` → **Deploy**. Primul deploy merge, dar aplicația spune „serverul nu e gata”.
2. În proiect: **Storage** → **Create Database** → **Supabase** → regiunea **Frankfurt (eu-central-1)** → Create → Connect la proiect.
   Integrarea pune singură în proiect: `SUPABASE_URL`, cheile `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`, `POSTGRES_URL*`.
3. **Settings → Environment Variables** → `ANTHROPIC_API_KEY` = cheia de la https://console.anthropic.com/settings/keys
   (pune și o limită lunară: https://console.anthropic.com/settings/limits).
4. **Deployments → Redeploy**.
5. Deschide adresa aplicației → **Pregătește** (creează tabelele și programările) → **Cont nou**. Primul cont e adminul.

Prietenii: deschid adresa → Cont nou → chestionarul. Implicit maximum 10 conturi (`MAX_USERS`).

## 2. Brățările (după ce ai adresa, ex. `https://antrenor-703.vercel.app`)

**WHOOP** — https://developer-dashboard.whoop.com → Create App
- Redirect URL: `https://<adresa>/api/oauth/whoop/callback`
- Scopes: read:recovery, read:cycles, read:sleep, read:workout, read:body_measurement, read:profile, offline
- Webhook URL (opțional): `https://<adresa>/api/webhooks/whoop`
- În Vercel: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` → Redeploy

**Garmin prin Strava** — https://www.strava.com/settings/api
- Authorization Callback Domain: `<adresa>` fără https://
- În Vercel: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` → Redeploy
- Aplicațiile Strava noi pornesc cu un singur atlet (tu); pentru prieteni se cere mărirea limitei din pagina API.

Fiecare om apasă apoi în Profil → Conectează și „Allow” la producător.

## Ce face singură aplicația

- **Programări** (pg_cron în Supabase, gratuit): citirea brățărilor la 15 minute, dimineața 02:30 UTC, seara 18:00 UTC.
- **Secretele interne** (state OAuth, cron) sunt derivate din cheia secretă Supabase; nu trebuie generate.
- **Adresa** vine din `VERCEL_PROJECT_PRODUCTION_URL`. Dacă pui un domeniu propriu, setează `APP_URL` și apasă din nou
  „Pregătește” din contul de admin (rescrie programările cu adresa nouă).

## Variabile opționale

| Variabilă | Implicit | Ce face |
|---|---|---|
| `MAX_USERS` | 10 | câte conturi se pot crea |
| `MODEL_SPECIALIST`, `MODEL_HEAD` | claude-sonnet-5-5 | modelul agenților |
| `APP_URL` | domeniul de producție Vercel | adresa publică |
| `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET` | – | Oura |
