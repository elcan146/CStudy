<div align="center">
  <img src="assets/logo.jpg" width="120" alt="CStudy" />
  <h1>CStudy</h1>
  <p><b>Lock your phone. Earn your hours.</b></p>

  [![Expo](https://img.shields.io/badge/Expo_SDK_57-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev)
  [![React Native](https://img.shields.io/badge/React_Native_0.86-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://reactnative.dev)
  [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
  [![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
</div>

A study tracker that only counts time while your phone is **locked**. Arm the timer, lock the phone, go study — unlock it and the session ends. No cheating.

https://github.com/user-attachments/assets/8c49be69-ef25-4888-8a72-9edde9805583

## Features

- **Lock-based sessions** — the ring arms on screen lock; unlocking ends it
- **Weekly target wheel** — hours auto-balance across your active days
- **Rest days** — recurring weekdays or one-off dates, targets redistribute
- **Honest calendar** — gray until met, green when done, gold when you go beyond
- **Six-month heatmap** — GitHub-style grid of your grind
- **Live notification** — persistent timer with end / continue actions
- **Dark & light themes**, haptics where they matter

## Stack

| | |
| --- | --- |
| Framework | React Native 0.86 · Expo SDK 57 |
| Language | TypeScript |
| State | Zustand + AsyncStorage |
| Charts | react-native-svg |
| Notifications | expo-notifications |
| Builds | EAS · ~27 MB APK (arm64, ProGuard) |

## Layout

```
src/
  rulesEngine.ts       study-rule math — targets, rollovers, rest days
  studyStore.ts        zustand store + persistence
  screens/             Focus · Schedule · History · Settings
  components/          HourWheel · WeekStrip · ContributionHeatmap · Glass
modules/screen-state/  local expo module — nav bar & insets
```

## Run

```bash
npm install
npx expo start       # dev client
npx tsc --noEmit     # typecheck
npm test             # jest
```

```bash
eas build --profile preview --platform android   # standalone APK
```

## License

[MIT](LICENSE)
