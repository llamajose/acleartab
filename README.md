# acleartab

A Chrome new tab extension with an Apple Liquid Glass aesthetic — minimal, clean, and transparent.

## Features

- **Liquid Glass UI** — translucent panels with specular highlights, lensing refraction, and caustic glows inspired by Apple's Liquid Glass design language
- **Live clock & date** — large, lightweight clock with the full date below
- **Smart search** — detects URLs, local addresses, and search queries automatically; Google autocomplete suggestions as you type
- **Weather widget** — current temperature with a 3-day forecast via wttr.in; toggleable °F / °C
- **Quick links** — favicon-based shortcut bar; add and remove links from the settings panel
- **Monthly calendar** — compact calendar with today highlighted
- **Custom background** — upload any image or MP4 video as your background, stored locally

## Install

1. Clone or download this repo
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the repo folder
5. Open a new tab

## Stack

Vanilla JS, HTML, CSS — no frameworks or build tools. Chrome Extension Manifest V3.

## Features

- **Smart search** — Google suggestions plus your bookmarks and history. Bangs (`!yt`, `!gh`, `!w`, `!r`, `!a`, `!m`, `!i`, `!so`, `!mdn`, `!npm`, `!c`; type `!` to list them). Inline answers for math (`12*1.0875`), units (`5 km to mi`, `100 f to c`) and currency (`20 usd to eur`, ECB rates via frankfurter.app). Enter on an answer copies it.
- **Canvas due dates** — paste your Canvas calendar feed URL (Canvas → Calendar → Calendar Feed) in Settings. Shows what's due in the next 14 days with urgency colors; ✓ hides an item.
- **Homelab status** — add any HTTP endpoint in Settings (e.g. `http://nas.tailnet.ts.net:2283/api/server/ping`) and get live up/down dots. `*.ts.net`, `localhost` and `127.0.0.1` are pre-approved; other hosts ask for permission when added.
- Weather, calendar, clock, quick links, custom image/video background.

### Private defaults

Create `src/config.local.json` (git-ignored) to pre-fill personal settings on first run:

```json
{
  "canvasUrl": "https://school.instructure.com/feeds/calendars/user_XXXX.ics",
  "services": [{ "name": "Immich", "url": "http://nas.example.ts.net:2283/api/server/ping" }]
}
```
