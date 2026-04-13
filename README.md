# Summit — Climbing Tracker App

A dark-themed iPhone climbing tracker built with React Native + Expo.

---

## 🚀 Setup (Step by Step)

### 1. Install prerequisites

You'll need Node.js installed. Download it from: https://nodejs.org (choose the LTS version)

### 2. Install Expo CLI

Open Terminal and run:
```
npm install -g expo-cli eas-cli
```

### 3. Install app dependencies

Navigate to this folder in Terminal, then run:
```
npm install
```

### 4. Install Expo Go on your iPhone

Search "Expo Go" in the App Store and install it.

### 5. Start the app

In Terminal, run:
```
npx expo start
```

A QR code will appear in the terminal. Open the Camera app on your iPhone and scan it. The app will open in Expo Go!

---

## 📱 Features

- **Log Tab** — Quickly log any climb. Pick type, grade, style, outcome.
- **Sessions Tab** — All sessions grouped by date. Expand to see climbs.
- **Projects Tab** — Track routes you're working on. Mark them sent when you crush them.
- **Stats Tab** — See your send rate, hardest grade, style breakdown, and more.

---

## 🏔️ App Structure

```
climbing-tracker/
├── app/
│   ├── _layout.tsx        # Tab navigation
│   ├── index.tsx          # Log tab (home)
│   ├── sessions.tsx       # Session history
│   ├── projects.tsx       # Project tracker
│   └── stats.tsx          # Statistics
├── components/
│   ├── UI.tsx             # Reusable components (Pill, Card, Button, etc.)
│   ├── ClimbCard.tsx      # Individual climb card
│   └── LogClimbModal.tsx  # Log/edit climb form
├── utils/
│   ├── theme.ts           # Colors, fonts, spacing, and data types
│   └── storage.ts         # AsyncStorage CRUD (offline data)
└── package.json
```

---

## 🔧 Building for Real iPhone (Optional)

To install it directly on your iPhone without Expo Go:

1. Create a free Expo account at expo.dev
2. Run: `eas build --platform ios --profile preview`
3. Follow the prompts. You'll get a link to download the .ipa file.

---

## Grade Systems

- **V-Scale** — Used for bouldering (VB through V17)
- **YDS** — Yosemite Decimal System for roped climbs (5.5 through 5.15d)

The app auto-selects the grade system based on climb type, but you can switch manually.
