/**
 * @module DailyTipAPI
 * @description Renders a "Tip of the Day" SVG card from tips.json.
 *              Deterministically selects one tip per calendar day.
 *              Automatically adapts to GitHub light/dark mode via CSS prefers-color-scheme.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Adaptive colour tokens — same pattern as devto-single-card.js
// Dark mode: deep bg, green accents  |  Light mode: soft bg, deep green text
// ---------------------------------------------------------------------------

const SVG_STYLES = `<style>
  /* ── Dark mode (default) ─────────────────────────────────────── */
  .tip-bg         { fill: #0d1117; }
  .tip-border     { stroke: #30363d; }
  .tip-accent-bar { fill: #53F7AE; }
  .tip-label      { fill: #53F7AE; font-weight: bold; letter-spacing: 0.08em; }
  .tip-title      { fill: #e6edf3; font-weight: bold; }
  .tip-body       { fill: #8b949e; text-anchor: start; }
  .tip-divider    { stroke: #21262d; }
  .tip-id         { fill: #484f58; }

  /* ── Light mode override ─────────────────────────────────────── */
  @media (prefers-color-scheme: light) {
    .tip-bg         { fill: #ffffff; }
    .tip-border     { stroke: #d0d7de; }
    .tip-accent-bar { fill: #1a7f5a; }
    .tip-label      { fill: #0a6644; }
    .tip-title      { fill: #24292f; }
    .tip-body       { fill: #57606a; }
    .tip-divider    { stroke: #d8dee4; }
    .tip-id         { fill: #8c959f; }
  }
</style>`;

/**
 * Escape XML-special characters for SVG safety.
 *
 * @param {string} str Raw string.
 * @returns {string} Escaped string.
 */
function cleanText(str) {
  if (!str) {
    return "";
  }
  return str.replace(/[<>&"']/g, (char) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&#x27;",
    };
    return entities[char] || char;
  });
}

/**
 * Wrap text into lines that fit within a pixel width.
 * Uses ~7.2px average char width for 13px Arial to produce clean, natural left-aligned lines.
 *
 * @param {string} text The text to wrap.
 * @param {number} maxChars Max characters per line.
 * @param {number} maxLines Maximum lines allowed.
 * @returns {string[]} Array of wrapped line strings.
 */
function wrapText(text, maxChars, maxLines) {
  if (!text) {
    return [""];
  }
  const words = text.split(" ");
  let lines = [];
  let currentLine = "";

  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    if (test.length <= maxChars) {
      currentLine = test;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const lastIdx = lines.length - 1;
    if (lines[lastIdx].length > maxChars - 3) {
      lines[lastIdx] = lines[lastIdx].substring(0, maxChars - 3) + "...";
    } else {
      lines[lastIdx] += "...";
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
/**
 * Daily Tip handler.
 *
 * @param {import("express").Request} req Express request.
 * @param {import("express").Response} res Express response.
 * @returns {Promise<any>} Response.
 */
export default async function handler(req, res) {
  try {
    // Fetch tips: Gist URL (editable from phone) → local file fallback
    let tipsData;
    let tipSource = "local";
    const gistUrl = process.env.TIPS_GIST_URL;

    if (gistUrl) {
      try {
        const resp = await fetch(gistUrl);
        if (resp.ok) {
          tipsData = await resp.json();
          tipSource = "gist";
        }
      } catch {
        // Gist fetch failed — fall through to local file
      }
    }

    if (!tipsData) {
      const tipsPath = path.join(__dirname, "..", "tips.json");
      tipsData = JSON.parse(fs.readFileSync(tipsPath, "utf8"));
      tipSource = "local-fallback";
    }

    const tips = tipsData.tips;

    // Deterministic daily selection — same tip for the entire UTC day
    const dayIndex = Math.floor(Date.now() / 86400000);
    const tipIndex = dayIndex % tips.length;
    const tip = tips[tipIndex];

    // ── Layout constants ──────────────────────────────────────────
    const cardW = 800;
    const bodyLeftX = 50; // Keep start position at 160 (where title/divider start)
    const bodyRightX = 744; // Extends all the way to the right edge of the red box
    const usableTextW = bodyRightX - bodyLeftX; // 584px usable text width
    const maxCharsPerLine = Math.floor(usableTextW / 5.6); // ~104 chars per line to reach right edge with fewer lines

    // ── Wrap text ─────────────────────────────────────────────────
    const titleLines = wrapText(tip.title, maxCharsPerLine, 2);
    const bodyLines = wrapText(tip.text, maxCharsPerLine, 5);

    // ── Dynamic height based on actual content ────────────────────
    const topPad = 26;
    const labelH = 14; // "SCAR TISSUE" label
    const labelGap = 12;
    const titleFontSize = 16;
    const titleLineH = 22;
    const titleBlockH = titleLines.length * titleLineH;
    const dividerGap = 14;
    const dividerH = 1;
    const bodyGap = 14;
    const bodyFontSize = 13;
    const bodyLineH = 19;
    const bodyBlockH = bodyLines.length * bodyLineH;
    const bottomPad = 26;

    const cardH =
      topPad +
      labelH +
      labelGap +
      titleBlockH +
      dividerGap +
      dividerH +
      bodyGap +
      bodyBlockH +
      bottomPad;

    // ── Build SVG parts ───────────────────────────────────────────
    let parts = [];

    // Inject adaptive CSS
    parts.push(SVG_STYLES);

    // Card background + border
    parts.push(
      `<rect x="0" y="0" width="${cardW}" height="${cardH}" rx="10" class="tip-bg tip-border" stroke-width="1"/>`,
    );

    // Top accent bar (full-width, 3px tall, sits at the very top)
    parts.push(
      `<rect x="0" y="0" width="${cardW}" height="3" rx="1" class="tip-accent-bar"/>`,
    );

    // ── Vertically laid-out content ───────────────────────────────
    const centerX = cardW / 2;
    let cursorY = topPad;

    // Section label (centered)
    cursorY += labelH;
    parts.push(
      `<text x="${centerX}" y="${cursorY}" class="tip-label" font-family="Arial, sans-serif" font-size="11" text-anchor="middle">🧠 SCAR TISSUE — LESSONS THAT LEFT A MARK</text>`,
    );
    cursorY += labelGap;

    // Title (centered)
    titleLines.forEach((line) => {
      cursorY += titleFontSize;
      parts.push(
        `<text x="${centerX}" y="${cursorY}" class="tip-title" font-family="Arial, sans-serif" font-size="${titleFontSize}" text-anchor="middle">${cleanText(line)}</text>`,
      );
      cursorY += titleLineH - titleFontSize;
    });

    // Divider line (symmetrical across the full content box width)
    cursorY += dividerGap;
    parts.push(
      `<line x1="${bodyLeftX}" y1="${cursorY}" x2="${bodyRightX}" y2="${cursorY}" class="tip-divider" stroke-width="1"/>`,
    );
    cursorY += dividerH + bodyGap;

    // Body text (left-aligned at boxLeftX, fills symmetrical box)
    bodyLines.forEach((line) => {
      cursorY += bodyFontSize;
      parts.push(
        `<text x="${bodyLeftX}" y="${cursorY}" class="tip-body" font-family="Arial, sans-serif" font-size="${bodyFontSize}" text-anchor="start">${cleanText(line)}</text>`,
      );
      cursorY += bodyLineH - bodyFontSize;
    });

    // Tip ID (aligned to the right edge of the symmetrical box)
    parts.push(
      `<text x="${bodyRightX}" y="${cardH - 10}" class="tip-id" font-family="monospace" font-size="9" text-anchor="end">${cleanText(tip.id)}</text>`,
    );

    const svg = `
<svg width="${cardW}" height="${cardH}" viewBox="0 0 ${cardW} ${cardH}" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${parts.join("\n  ")}
</svg>
    `.trim();

    const isDev = !process.env.VERCEL;
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader(
      "Cache-Control",
      isDev ? "no-cache, no-store, must-revalidate" : "public, max-age=1800",
    );
    res.setHeader("X-Tip-Id", tip.id);
    res.setHeader("X-Tip-Index", String(tipIndex));
    res.setHeader("X-Tip-Source", tipSource);
    return res.send(svg);
  } catch (error) {
    console.error("Error generating daily tip:", error);
    return res.status(500).send("Error generating daily tip SVG");
  }
}
