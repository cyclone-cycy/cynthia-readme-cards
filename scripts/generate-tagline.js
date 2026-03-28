/**
 * @module TaglineGenerator
 * @description Build-time script to generate a perfectly timed looping tagline SVG.
 */

/**
 * CYNTHIA'S TAGLINE GENERATOR 🚀
 *
 * TO UPDATE YOUR TAGLINE LOOP:
 * 1. Add/edit lines in `data/taglines.json`
 * 2. Run: node scripts/generate-tagline.js
 *
 * This script will perfectly recalculate all CSS keyframe timing
 * and update the `tagline.svg` file instantly.
 */

import fs from "fs";
import path from "path";

const filePath = path.resolve("./data/taglines.json");
const taglines = JSON.parse(fs.readFileSync(filePath, "utf8"));

const totalDuration = 60; // 60s for a smooth, high-quality feel
const count = taglines.length;
const step = 100 / count;
const fadeTime = step * 0.125;

let keyframes = "";
const textLines = taglines
  .map((line, i) => {
    const start = i * step;
    const fadeIn = start + fadeTime;
    const fadeOutStart = start + step - fadeTime;
    const end = (i + 1) * step;

    keyframes += `
@keyframes k${i} {
  0% { opacity: 0; }
  ${start.toFixed(5)}% { opacity: 0; }
  ${fadeIn.toFixed(5)}% { opacity: 1; }
  ${fadeOutStart.toFixed(5)}% { opacity: 1; }
  ${end.toFixed(5)}% { opacity: 0; }
  100% { opacity: 0; }
}`;

    const safe = line
      .replace(/&/g, "&amp;")
      .replace(/'/g, "&apos;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<text class="line" x="32" y="29" font-family="'Fira Code',monospace" font-size="13" fill="#53F7AE" style="animation-name:k${i}">${safe}</text>`;
  })
  .join("\n");

const svg = `<svg width="480" height="48" viewBox="0 0 480 48" xmlns="http://www.w3.org/2000/svg">
<style>
.line { opacity: 0; animation-duration: ${totalDuration}s; animation-iteration-count: infinite; animation-timing-function: ease-in-out; }
${keyframes}
</style>
<rect width="480" height="48" rx="8" fill="#0d1117"/>
<rect width="480" height="48" rx="8" fill="none" stroke="#53F7AE" stroke-width="0.75" stroke-opacity="0.35"/>
<circle cx="16" cy="24" r="3.5" fill="#53F7AE">
  <animate attributeName="opacity" values="1;0.15;1" dur="1.2s" repeatCount="indefinite"/>
</circle>
${textLines}
</svg>`;

fs.writeFileSync("./tagline.svg", svg);
