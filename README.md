# Sedentary Coach (Android companion for Huawei Watch GT 7 Pro)

A non-medical "move more, sit less" coach. The reminder engine runs natively on the phone in an
always-on foreground service; reminders reach the GT 7 Pro through **Huawei Health notification
mirroring**.

## What runs where

| Piece | Where | Notes |
|---|---|---|
| Reminder engine (movement, water, follow-up, snooze, focus, day rollover) | `android/.../Engine.kt` | One exact alarm drives everything; state in SharedPreferences, survives kill/reboot |
| Always-on service | `CoachService.kt` | Foreground service (`specialUse`), `START_STICKY`, restarted on boot/update/time change and on every alarm |
| Smart inactivity reset | `CoachService.kt` | Phone `TYPE_STEP_COUNTER`, batched (60 s) for low battery use |
| Ledger | `CoachDb.kt` | Append-only SQLite events with UUIDs; daily/weekly/monthly views are derived, history is never deleted |
| Consistency score | `src/services/score.ts` | Isolated, versioned (`SCORE_VERSION`), unit tested |
| UI | `App.tsx`, `src/screens/*` | Today, History (+ day detail), Trends, Settings, Watch & setup |
| Native adapter | `src/native/coach.ts` | The only file that talks to the native module |

## Watch capability (documented limitation)

A **direct phone-to-watch link is not in this build**. Huawei restricts phone-to-watch messaging to
apps approved for its Wear Engine programme (developer account with identity verification, per-app
permission approval, signing-certificate registration, and a companion app installed on the watch).
Fallback in use: **phone-generated notifications mirrored by Huawei Health** (spec section 10,
fallback 3). The watch's own motion data is not readable by third-party phone apps, so smart reset
uses the phone's step counter.

To add a direct link later, implement it behind `src/native/coach.ts` / a new native adapter; the
engine and UI do not need to change.

## Build

```
npm install
cd android
gradlew assembleRelease
```

APK: `android/app/build/outputs/apk/release/app-release.apk`

Release signing uses `android/app/sedentary-release.keystore` with passwords in
`android/keystore.properties`. **Back both files up**: updates must be signed with the same key or
Android refuses to install them over the existing app.

## Tests

```
npx tsc --noEmit
npx jest
```
