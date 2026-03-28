/**
 * @module ExpressServer
 * @description Local development server for testing GitHub Readme Cards.
 *
 * ROUTES:
 * - /: Stats Card
 * - /pin: Repo Pinned Card
 * - /top-langs: Top Languages Card
 * - /tagline-card: Sequential Tagline Card
 * - /github-stats: Custom Logic Stats Card
 */

import "dotenv/config";
import statsCard from "./api/index.js";
import repoCard from "./api/pin.js";
import langCard from "./api/top-langs.js";
import wakatimeCard from "./api/wakatime.js";
import gistCard from "./api/gist.js";
import devtoSingleCard from "./api/devto-single-card.js";
import devtoRedirect from "./api/devto-redirect.js";
import githubStatsCard from "./api/github-stats.js";
import taglineCard from "./api/tagline-card.js";
import express from "express";
import { logger } from "./src/common/log.js";

const app = express();
const router = express.Router();

router.get("/", statsCard);
router.get("/pin", repoCard);
router.get("/top-langs", langCard);
router.get("/wakatime", wakatimeCard);
router.get("/gist", gistCard);
router.get("/devto-single-card", devtoSingleCard);
router.get("/devto-redirect", devtoRedirect);
router.get("/github-stats", githubStatsCard);
router.get("/tagline-card", taglineCard);

// Test error displays
router.get("/test-error-token", (req, res) => {
  const errorSvg = `
    <svg width="467" height="150" viewBox="0 0 467 150" xmlns="http://www.w3.org/2000/svg">
      <style>
        .error-title { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #f85149; }
        .error-message { font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: #e6edf3; }
        .error-bg { fill: #0d1117; stroke: #f85149; stroke-width: 1; }
      </style>
      
      <rect class="error-bg" x="0.5" y="0.5" rx="4.5" height="149" width="466"/>
      
      <!-- Error Icon -->
      <g transform="translate(25, 25)">
        <path fill="#f85149" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z"/>
      </g>
      
      <!-- Error Text -->
      <text x="55" y="40" class="error-title">Oops! Token went on vacation 🏖️</text>
      <text x="55" y="70" class="error-message">Looks like GITHUB_STATS_TOKEN decided to ghost us.</text>
      <text x="55" y="95" class="error-message">It's probably just hiding behind the couch...</text>
      
    </svg>
  `;
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(errorSvg);
});

router.get("/test-error-api", (req, res) => {
  const errorSvg = `
    <svg width="467" height="150" viewBox="0 0 467 150" xmlns="http://www.w3.org/2000/svg">
      <style>
        .error-title { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #f85149; }
        .error-message { font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: #e6edf3; }
        .error-bg { fill: #0d1117; stroke: #f85149; stroke-width: 1; }
      </style>
      
      <rect class="error-bg" x="0.5" y="0.5" rx="4.5" height="149" width="466"/>
      
      <!-- Error Icon -->
      <g transform="translate(25, 25)">
        <path fill="#f85149" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z"/>
      </g>
      
      <!-- Error Text -->
      <text x="55" y="40" class="error-title">GitHub is having a moment 🤷‍♀️</text>
      <text x="55" y="70" class="error-message">The API seems to be playing hard to get today.</text>
      <text x="55" y="95" class="error-message">Even developers need coffee breaks ☕</text>
      
    </svg>
  `;
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(errorSvg);
});

app.use("/api", router);

const port = process.env.PORT || process.env.port || 9000;
app.listen(port, "127.0.0.1", () => {
  logger.log(`Server is LIVE at http://127.0.0.1:${port}`);
});
