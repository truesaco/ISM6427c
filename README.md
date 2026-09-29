# ISM6427c — Boca Weather

A responsive weather app with live data from [Open-Meteo](https://open-meteo.com/). Open-Meteo is free and needs no API key. The default location is Boca Raton, FL (Florida Atlantic University).

## Features
- Current conditions, a 24-hour forecast and a 7-day forecast
- City search (Open-Meteo geocoding), a "use my location" button and a one-tap return to FAU
- °F / °C toggle
- Light, dark and system themes (your choice is remembered)
- A personalized greeting that changes with the time of day
- Refreshes every 10 minutes and again when you return to the tab
- Responsive layout for phone, tablet and desktop

## Run locally
It's plain HTML/CSS/JS with no build step. Serve the folder, for example:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy to Netlify
1. In Netlify, choose **Add new site → Import an existing project** and pick this repo.
2. Leave the build command empty and set the publish directory to `.` (`netlify.toml` already sets both).
3. Deploy.

You can also drag and drop the folder onto https://app.netlify.com/drop.
