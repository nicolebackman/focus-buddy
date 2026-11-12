# Focus Buddy

A little pet that lives on your Mac desktop, runs your Pomodoro timer, nudges you to take breaks, and helps you reflect on how you work and how you feel while working.

- **Drag** your buddy anywhere on screen. **Tap** it for the timer, settings and check-ins. **Right-click** for the menu.
- After each focus round it asks how it went, records your answer, and shows patterns on the **Dashboard**.
- Pick from five buddies (tomato, pup, cat, bunny, bear) in five colors.
- Optional: add your own Anthropic API key in Settings for Claude-written follow-up questions and pattern reviews.

## Install

Download the latest `.zip` from the [Releases](../../releases) page, unzip it, and drag **Focus Buddy** into Applications.
The first time, right-click the app and choose **Open** (it isn't signed with an Apple developer certificate).
The app checks this repository's releases and tells you when a new version is out.

## Develop

```bash
npm install
npm start
```

## Release a new version

1. Bump `version` in `package.json`.
2. `npm run release` — builds `release/Focus-Buddy-<version>-mac-arm64.zip` and publishes it as a GitHub release
   (uses the `gh` CLI if installed; otherwise prints the steps to upload it by hand).

Your reflections and API key are stored on your own Mac in the app's data folder, never in this repository.
