<div align="center">
  <img src="assets/logo.jpg" width="140" alt="CStudy logo" style="border-radius: 28px" />

  # CStudy

  **My personal study tracker — lock your phone, earn your hours.**

  [![Expo](https://img.shields.io/badge/Expo_SDK_57-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev)
  [![React Native](https://img.shields.io/badge/React_Native_0.86-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactnative.dev)
  [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
  [![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
</div>

---




https://github.com/user-attachments/assets/8c49be69-ef25-4888-8a72-9edde9805583



## What it does

CStudy tracks study time the honest way: a session only counts while your phone is **locked**. Arm the timer, lock the phone, go study — unlock it and the session ends. No cheating, no doomscrolling "breaks" counting as work.

### Features

- **Lock-based focus sessions** — arming the ring starts a session on the next screen lock; unlocking ends it. Switching apps never counts.
- **Weekly commitment wheel** — set your weekly hours with an alarm-style drum picker; targets auto-balance across your active days.
- **Rest days, two ways** — recurring weekdays (every Saturday off) or one-off dates held on the calendar. Weekly hours redistribute automatically.
- **Calendar that tells the truth** — today stays gray until the requirement is met, green when done, gold-ringed when you go beyond. Under 40% of a day's target shows red.
- **Six-month contribution heatmap** — GitHub-style grid of your grind.
- **Persistent session notification** — live timer in the shade with end/continue actions.
- **Dark & light themes**, animated everything, haptics where they matter.

<div align="center">
  <img src="" />
</div>

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | React Native 0.86 + Expo SDK 57 |
| Language | TypeScript |
| State | Zustand (persisted via AsyncStorage) |
| Charts | react-native-svg |
| Notifications | expo-notifications |
| Builds | EAS Build (arm64, ProGuard, resource shrinking → ~27MB APK) |

## Project layout

```
src/
  rulesEngine.ts      # study-rule math (targets, rollovers, rest days)
  studyStore.ts       # zustand store + persistence
  types.ts            # domain types
  screens/            # Focus · Schedule · History · Settings
  components/         # HourWheel, WeekStrip, ContributionHeatmap, Glass
modules/screen-state/ # local expo module for nav-bar/inset control
```

## Run it

```bash
npm install
npx expo start            # dev server, load via dev client
npx tsc --noEmit          # typecheck
npm test                  # jest — engine + store suites
```

Build a standalone APK:

```bash
eas build --profile preview --platform android
```

## License

MIT — see [LICENSE](LICENSE).
