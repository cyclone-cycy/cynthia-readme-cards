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
    const cardW = 932; // Exactly matches the total width of 3 blog cards + padding in the test layout
    const bodyLeftX = 50; // Keep start position at 50
    const bodyRightX = 882; // Extends all the way to the right edge (932 - 50)
    const usableTextW = bodyRightX - bodyLeftX; // 832px usable text width
    const maxCharsPerLine = Math.floor(usableTextW / 8.5); // ~97 chars per line (adjusted for 18px font)

    // ── Wrap text ─────────────────────────────────────────────────
    const titleLines = wrapText(tip.title, maxCharsPerLine, 2);
    const bodyLines = wrapText(tip.text, maxCharsPerLine, 5);

    // ── Dynamic height based on actual content ────────────────────
    const topPad = 32;
    const labelH = 16; // "SCAR TISSUE" label
    const labelGap = 16;
    const titleFontSize = 22;
    const titleLineH = 30;
    const titleBlockH = titleLines.length * titleLineH;
    const dividerGap = 18;
    const dividerH = 1;
    const bodyGap = 18;
    const bodyFontSize = 18;
    const bodyLineH = 28;
    const bodyBlockH = bodyLines.length * bodyLineH;
    const bottomPad = 32;

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

    const themeQuery = req.query.theme || "dark";
    const isLight = themeQuery === "light";

    const SVG_STYLES = `<style>
      .tip-bg         { fill: ${isLight ? "#ffffff" : "#0d1117"}; }
      .tip-border     { stroke: ${isLight ? "#d0d7de" : "#30363d"}; }
      .tip-accent-bar { fill: ${isLight ? "#1a7f5a" : "#53F7AE"}; }
      .tip-label      { fill: ${isLight ? "#0a6644" : "#53F7AE"}; font-weight: bold; letter-spacing: 0.08em; }
      .tip-title      { fill: ${isLight ? "#24292f" : "#e6edf3"}; font-weight: bold; }
      .tip-body       { fill: ${isLight ? "#57606a" : "#8b949e"}; text-anchor: start; }
      .tip-divider    { stroke: ${isLight ? "#d8dee4" : "#21262d"}; }
      .tip-id         { fill: ${isLight ? "#8c959f" : "#484f58"}; }
    </style>`;

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
      `<text x="${centerX}" y="${cursorY}" class="tip-label" font-family="Arial, sans-serif" font-size="13" text-anchor="middle">🧠 SCAR TISSUE — LESSONS THAT LEFT A MARK</text>`,
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
      `<text x="${bodyRightX}" y="${cardH - 14}" class="tip-id" font-family="monospace" font-size="11" text-anchor="end">${cleanText(tip.id)}</text>`,
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
