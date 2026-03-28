# Tagline Data 🚀

This directory contains the data source for the dynamic tagline engine.

### `taglines.json`
An array of strings containing witty "dev-humor" quotes. 

**Format:**
```json
[
  "quote one",
  "quote two"
]
```

**Engine Integration:**
The `tagline-card.js` API and `generate-tagline.js` script both read this file. The animation duration is automatically divided by the number of entries in this array to ensure smooth, sequential looping.
