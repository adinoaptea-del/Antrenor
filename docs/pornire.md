# Pornirea de la zero — aplicația reală, pas cu pas

Ce iese la final: aplicația la o adresă a ta (Vercel), cu cont pe e-mail, baza de date și autentificarea în Supabase (UE),
brățările conectate cu un buton, agenții rulând dimineața la 05:30 și seara, pe datele tale. Zero date demo.

Timp: ~1 oră pentru pașii tăi; restul e automat.

## 1. Conturile (15 min)

| Cont | Unde | Ce iei de acolo |
| --- | --- | --- |
| Supabase | [supabase.com](https://supabase.com) → New project, regiunea **EU (Frankfurt)**; parolă de DB păstrată | Project Settings → API: `Project URL`, `anon public`, `service_role` |
| Vercel | [vercel.com](https://vercel.com) → Add New Project → importă repo-ul (GitHub) | domeniul `https://<nume>.vercel.app` |
| Anthropic | [console.anthropic.com](https://console.anthropic.com) → API Keys | `ANTHROPIC_API_KEY` |
| WHOOP | [developer.whoop.com](https://developer.whoop.com) → Create app | Client ID, Client Secret (vezi `docs/integrari.md` pentru redirect și scope-uri) |
| Strava | [strava.com/settings/api](https://www.strava.com/settings/api) | Client ID, Client Secret |

Repo-ul: pune folderul `antrenor-app` pe GitHub (privat) — Vercel face deploy la fiecare push.

## 2. Baza de date (5 min)

În Supabase → SQL Editor → New query → lipește conținutul din `supabase/migrations/0001_init.sql` → Run.
Creează tabelele, politicile de securitate pe rânduri (fiecare sportiv își vede doar datele) și trigger-ul care face
profilul la primul login.

Apoi Authentication → Providers → Email: **Enable email provider**, **Confirm email** oprit (intrarea e cu link, nu cu parolă).
Authentication → URL Configuration: Site URL = domeniul Vercel; Redirect URLs: adaugă același domeniu.

## 3. Variabilele de mediu (10 min)

În Vercel → Project → Settings → Environment Variables, din `.env.example`, toate. Două sunt șiruri aleatoare pe care le
inventezi tu (`OAUTH_STATE_SECRET`, `CRON_SECRET`; în terminal: `openssl rand -hex 32`). `APP_URL` = domeniul Vercel.
`VITE_SUPABASE_URL` și `VITE_SUPABASE_ANON_KEY` sunt aceleași valori ca `SUPABASE_URL` / `SUPABASE_ANON_KEY`, dar intră în aplicație.

Redeploy după ce le-ai pus (Deployments → ⋯ → Redeploy).

## 4. Brățările (10 min, după ce aplicația e sus)

- WHOOP: în aplicația de developer, Redirect URL exact `https://<domeniu>/api/oauth/whoop/callback`, Webhook URL `https://<domeniu>/api/webhooks/whoop`.
- Strava: Authorization Callback Domain = `<domeniu>` (fără https). Webhook: o singură dată, din terminal:
  ```bash
  curl -X POST https://www.strava.com/api/v3/push_subscriptions \
    -F client_id=$STRAVA_CLIENT_ID -F client_secret=$STRAVA_CLIENT_SECRET \
    -F callback_url=https://<domeniu>/api/webhooks/strava -F verify_token=$STRAVA_VERIFY_TOKEN
  ```
- În aplicație: Profil → Conectează, la fiecare. Prima citire trage 5 săptămâni.

## 5. Prima zi

1. Deschizi aplicația pe telefon, pui e-mailul, apeși linkul din e-mail. (Safari → Partajează → Adaugă pe ecranul principal, ca să fie aplicație.)
2. Chestionarul de intrare (3 minute) → planul se generează de lunea următoare.
3. Profil → Conectează Whoop și Strava.
4. Dimineața la 05:30 rulează colectorul și agenții; mesajul head coach-ului apare în Antrenor, mementoul la deschidere.
   Pentru test imediat: Antrenor → „Rulează acum”.

## Cum rulează, pe scurt

```
telefon (PWA) ──/api/me──► Vercel Functions ──PostgREST──► Supabase (Postgres + Auth)
                 /api/forms/*           │
                 /api/sync              ├── WHOOP API v2, Strava API, Oura API (OAuth, token-uri pe server)
                 /api/oauth/*           └── Anthropic Messages API (agenții, răspuns JSON pe schemă)
cron Vercel: */15 sync · 05:30 dimineața · 21:00 seara (ora României; în vercel.json e UTC)
webhook-uri: WHOOP, Strava → sync imediat
```

Tot ce decide ceva e cod testat (`npm test`, 68 de teste): calendarul, scorul, bara, pachetul, verificarea agenților.
Modelul scrie doar textul mesajelor și verdictele, pe schemă JSON, și fiecare cifră trece prin `src/agents/verify.ts`.

## Costuri estimate (pilot, 5 persoane)

Supabase Free sau Pro (25 $/lună dacă vrei backup-uri), Vercel Hobby (0) sau Pro (20 $), modelul: ~8 apeluri pe sportiv pe zi,
câteva mii de tokeni fiecare — ordinul a 5–10 $/lună la 5 sportivi cu Sonnet. WHOOP și Strava API: gratuite.

## Dezvoltare locală

```bash
npm install
npm test                      # nucleul + colectorul + agenții (model fals)
npm run build -w apps/web     # aplicația
# funcțiile din api/ rulează local cu `npx vercel dev` (cere contul Vercel) sau se testează pe un deploy de preview
```
