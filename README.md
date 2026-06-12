# AJKO

A mobile-first **React PWA** for a retail jewelry store — private vendor & team
communication plus order management. Built with Create React App, Firebase
(Auth, Firestore, Storage, Cloud Messaging) and React Router.

## Roles

| Role | Sees | Can do |
| --- | --- | --- |
| **Admin** | Everything — all channels, orders, members | Create orders, manage members/vendors, settings, WhatsApp share, move stages |
| **Team member** | Same dashboard as admin | Create orders, chat in channels, track stages (no member mgmt, no settings, no WhatsApp on detail) |
| **Vendor** | Only their 1–2 channels (peers shown as codes, e.g. `V-01`) | Move their own order stages forward/back, chat, WhatsApp-forward to karigar |

## Order model

- **Stages:** New (gray/orange) → In progress (blue) → Ready (green), shown as a pulsing pipeline.
- **Urgency** (layered on top): Overdue (red), Due today, Due in 1/2/3 days, On track.
- Cards glow + pulse in their stage/urgency color; overdue cards get a red border + glow.

## Run locally

```bash
npm install
npm start          # dev server at http://localhost:3000
npm run build      # production build into /build
```

## First run

Nobody can self-register — the admin creates everyone. To create the very first
admin, open the app → **Set up first admin** (only works while the `users`
collection is empty). After that:

1. Admin → **Members** → add vendors / team members (generates `V-01`, `TM-01` …).
2. Each new member opens the app → **First time setup** → enters their phone →
   receives an OTP → sets a password. Future logins use phone/email + password.

## Firebase Console setup required

The code is wired up, but these must be enabled in the Firebase Console:

1. **Authentication → Sign-in methods:** enable **Email/Password** and **Phone**.
   - Phone Auth (OTP/SMS) requires the **Blaze** plan beyond the free quota and a
     reCAPTCHA; add your domain under **Authentication → Settings → Authorized domains**.
2. **Firestore:** create the database and paste `firestore.rules` (Rules tab).
   Collections used: `users`, `channels`, `orders`, `messages`, `notifications`.
3. **Storage:** enable Cloud Storage (order images/videos + voice notes).
4. **Cloud Messaging (push):** generate a **Web Push certificate (VAPID key)** under
   Project settings → Cloud Messaging, then paste it into `VAPID_KEY` in
   `src/firebase.js`. Stage-change / new-order / due-date triggers are best sent
   from a Cloud Function (Admin SDK) reading each user's `fcmTokens`.

## PWA

`public/manifest.json` (standalone, theme `#ff6b35`, bg `#faf7f4`), an offline
app-shell worker (`public/service-worker.js`), and the FCM background worker
(`public/firebase-messaging-sw.js`). Installable on iPhone (Add to Home Screen)
and Android.

## Project structure

```
src/
  firebase.js                 Firebase init (app, auth, db, storage, VAPID)
  App.js                      Router + role-based route guards
  context/AuthContext.js      Auth state + live profile (matched by authUid)
  hooks/useCollections.js     Real-time Firestore listeners (role-scoped)
  utils/                      format, auth, actions (writes), upload
  components/                 OrderCard, StagePipeline, Badges, BottomNav, Icons…
  screens/                    Login, Home, Orders, OrderDetail, CreateOrder,
                              Channels, Channel, Notifications, Search,
                              Profile, Settings, Members
  styles/theme.css            Design system (colors, glows, pulses, layout)
```
