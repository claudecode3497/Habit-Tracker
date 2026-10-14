# Cadence (mobile)

Your habit tracker, running fully on your phone. All data is stored on the device (IndexedDB) and the app works offline. Use **Data → Back up** regularly, because phone-only storage is lost if the app is uninstalled.

## Easiest: install as an app from the browser (no tools needed)
1. Upload the contents of the `dist/` folder to any static host (Netlify Drop, Cloudflare Pages, GitHub Pages, Vercel).
2. Open the URL on your phone. Android Chrome: menu → *Install app*. iPhone Safari: Share → *Add to Home Screen*.

## Real Android APK (free, no Android Studio)
1. Create a GitHub repo and push this folder.
2. Open the *Actions* tab → *Build Android APK* → run it.
3. Download the `cadence-apk` artifact, unzip it, and open `app-debug.apk` on your phone (allow "install unknown apps").

## Build locally
```bash
npm install
npm run dev          # browser dev server
npm run android      # build + sync + open Android Studio, then press Run
npm run ios          # macOS + Xcode only
```
After changing the web code run `npm run cap:sync`. Regenerate icons with `npm run assets`.

## Notes
- Reminders: on the phone they are real scheduled notifications (work when the app is closed). In a browser they only fire while the app is open.
- Backup/restore uses the system share sheet on the phone.
