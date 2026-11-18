# Class Timer

A static class timer that works locally and can optionally sync each user's profiles and settings through Supabase.

## What's included

- `index.html`, `style.css`, `script.js`: the timer application.
- `data.js`: **public, generic starter data only**. Do not add personal profiles here.
- `supabase-config.js`: the Supabase Project URL and anon/public key go here.
- `supabase-setup.sql`: creates the private per-account database table and Row Level Security policies.

## Local use

Keep the files together. The timer continues to save to browser `localStorage` whether cloud sync is configured or not. Opening the HTML directly works for local-only use; use a local static server or GitHub Pages for Supabase authentication and cloud sync.

## Enable free-tier Supabase cloud sync

1. Create a Supabase project at <https://supabase.com/>.
2. In the Supabase dashboard, open **SQL Editor**, paste the contents of `supabase-setup.sql`, and run it.
3. In **Project Settings → API**, copy the **Project URL** and the **anon / publishable key**.
4. Open `supabase-config.js` and paste those values into `url` and `anonKey`.
5. In **Authentication → URL Configuration**, set the Site URL to your deployed GitHub Pages address. Add that same address to the allowed Redirect URLs. If you test on localhost, add your localhost URL too.
6. In **Authentication → Sign In / Providers**, make sure Email is enabled.
7. In **Authentication → URL Configuration**, confirm your deployed URL is allowed as a redirect.
8. Push the app files to GitHub Pages.

**Important email-auth limitation on Supabase's default free email service:** it currently sends only to addresses belonging to your Supabase organization's team, with a project-wide limit of 2 emails per hour. That means ordinary visitors cannot receive signup confirmation emails unless you configure a custom SMTP provider. See [Supabase's official SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

You have two choices:

- **Verified accounts (recommended for a public launch):** configure a custom SMTP provider in Supabase Auth. Then leave email confirmation enabled. The email provider may have its own free tier and limits.
- **Quick no-email testing:** turn off **Confirm email** in Supabase Auth. Signups will create a session immediately, so no confirmation email is needed. This does not verify email ownership, and password recovery by email will not work until SMTP is configured. Users should keep their passwords safe.

The Project URL and anon/publishable key are designed to be used in browser code. **Never put a `service_role` or secret key in this project, GitHub, or any browser file.** The database's Row Level Security policies enforce that a signed-in user can only read, insert, or update the row whose `user_id` matches their own account ID.

## How syncing behaves

- No account is required. Local profiles and settings continue working in `localStorage`.
- Signing in enables cloud sync. Supabase keeps the session in the browser, so users normally stay signed in between visits.
- Changes are saved locally first, then uploaded after a short debounce.
- The app loads the cloud copy on another device. If both this browser and the cloud already have data that may differ, it asks which copy to keep before replacing either one.
- Signing out does not delete the local copy.
- If offline, local changes remain available. When the browser comes back online, pending local changes are queued for sync.

Cloud sync currently uses a **single latest-saved snapshot per account**. It does not merge simultaneous edits made on two devices. If someone edits on multiple devices at the same time, the last completed upload wins. The app prompts when it detects a difference during sign-in, but it is best to finish syncing on one device before editing on another.

## Existing personal data

The bundled `data.js` has deliberately been reset to a blank starter profile so personal schedules are not published in a public GitHub repository. If you have an older `data.js` with your profiles, keep it outside the repository. After opening the hosted app, use the profile menu's **Import data file…** action to import that private file. The imported data is saved locally and, once signed in, synced to your private account.

## Before publishing

- Check that `data.js` contains only generic starter data.
- Check that `supabase-config.js` contains only the Project URL and anon/publishable key, never a service-role/secret key.
- Do not commit exported personal `data.js` backups.
