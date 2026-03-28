/**
 * @module DevToSingleCardAPI
 * @description Renders a SINGLE Dev.to article card as an SVG.
 *
 * This endpoint exists so that each card can be wrapped in its own <a> tag
 * in the GitHub README, making individual articles clickable.
 *
 * QUERY PARAMS:
 *   ?username=cynthizo   – Dev.to username (falls back to DEVTO_USERNAME env)
 *   ?index=1             – 1-based article index (1 = most recent, default 1)
 *   ?pinned=true         – Show the 📌 PINNED badge on this card
 *   ?width=270           – Card width in px (default 270)
 *   ?height=220          – Card height in px (default 220)
 *   ?reactions=true       – Show reaction count (default true)
 *
 * ENVIRONMENT VARIABLES:
 *   DEVTO_USERNAME       – Fallback Dev.to username
 */

// ---------------------------------------------------------------------------
// Helpers (same as devto-card.js — kept inline for Vercel serverless compat)
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
 * Wrap text into multiple lines for SVG rendering.
 *
 * @param {string} text The text to wrap.
 * @param {number} cardWidth Container width in px.
 * @returns {string[]} Array of line strings.
 */
function wrapText(text, cardWidth = 260) {
  if (!text) {
    return [""];
  }
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";
  const margin = Math.max(10, Math.floor(cardWidth * 0.06));
  const usableWidth = cardWidth - margin * 2;
  const charWidth = cardWidth > 300 ? 6.0 : cardWidth > 200 ? 5.5 : 5.0;
  const maxChars = Math.floor(usableWidth / charWidth);

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
  return lines;
}

/**
 * Render tags as a single SVG text element.
 *
 * @param {string[]} tagList Tag names.
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @param {number} fontSize Font size.
 * @param {string} color Fill colour.
 * @returns {string} SVG markup.
 */
function renderTags(tagList, x, y, fontSize = 9, color = "#888") {
  if (!tagList || tagList.length === 0) {
    return "";
  }
  const tags = tagList.map((t) => `#${t}`).join(" ");
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, sans-serif" font-size="${fontSize}">${cleanText(tags)}</text>`;
}

/**
 * Format reading time.
 *
 * @param {number|undefined} minutes Reading time from Dev.to API.
 * @returns {string} Formatted read time string.
 */
function getReadTime(minutes) {
  return `${minutes || 1} min read`;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Main handler for single Dev.to article card.
 *
 * @param {object} req Express request.
 * @param {object} res Express response.
 * @returns {Promise<void>} SVG response.
 */
export default async function handler(req, res) {
  const username = req.query.username || process.env.DEVTO_USERNAME;
  const index = parseInt(req.query.index || "1", 10) - 1; // convert 1-based → 0-based
  const isPinned = req.query.pinned === "true";
  const cardW = parseInt(req.query.width || "270", 10);
  const cardH = parseInt(req.query.height || "220", 10);
  const showReactions = req.query.reactions !== "false";

  if (!username) {
    res.setHeader("Content-Type", "image/svg+xml");
    return res.status(200).send(
      `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${cardW}" height="${cardH}" fill="#1a1a1a" rx="8"/>
        <text x="${cardW / 2}" y="${cardH / 2}" text-anchor="middle" fill="#f85149" font-family="Arial,sans-serif" font-size="11">Missing username</text>
      </svg>`,
    );
  }

  try {
    const response = await fetch(
      `https://dev.to/api/articles?username=${username}&per_page=10`,
    );
    if (!response.ok) {
      throw new Error(`Dev.to API ${response.status}`);
    }

    const articles = await response.json();
    if (!Array.isArray(articles) || articles.length === 0) {
      throw new Error("No articles");
    }

    const article =
      articles[Math.min(index, articles.length - 1)] || articles[0];

    // --- Build single-card SVG ---
    const inner = 5; // inner padding from left edge
    const hasCover = !!article.cover_image;
    let parts = [];

    // Background
    parts.push(
      `<rect x="0" y="0" width="${cardW}" height="${cardH}" rx="8" fill="#1a1a1a" stroke="#53F7AE" stroke-width="1"/>`,
    );

    // Cover image
    if (hasCover) {
      parts.push(
        `<image x="${inner}" y="5" width="${cardW - 10}" height="70" href="${article.cover_image}" preserveAspectRatio="xMidYMid slice"/>`,
      );
    }

    // Pinned badge
    if (isPinned) {
      if (hasCover) {
        parts.push(
          `<text x="${cardW / 2}" y="90" font-family="Arial, sans-serif" font-size="10" fill="#53F7AE" text-anchor="middle">📌 PINNED</text>`,
        );
      } else {
        parts.push(
          `<rect x="${cardW / 2 - 18}" y="10" width="36" height="35" rx="6" fill="#53F7AE"/>`,
        );
        parts.push(
          `<text x="${cardW / 2}" y="33" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0d1117" text-anchor="middle">📌</text>`,
        );
        parts.push(
          `<text x="${cardW / 2}" y="47" font-family="Arial, sans-serif" font-size="8" fill="#53F7AE" text-anchor="middle">PINNED</text>`,
        );
      }
    }

    // Title
    const titleStartY = hasCover ? 120 : isPinned ? 73 : 25;
    const titleColor = isPinned ? "#ffffff" : "#53F7AE";
    const titleLines = wrapText(article.title, cardW - 10);
    titleLines.forEach((line, i) => {
      parts.push(
        `<text x="${inner}" y="${titleStartY + i * 15}" fill="${titleColor}" font-family="Arial, sans-serif" font-size="12" font-weight="bold">${cleanText(line)}</text>`,
      );
    });

    // Tags
    const tagY = hasCover ? 185 : 185;
    parts.push(
      renderTags(
        article.tag_list,
        inner,
        tagY,
        9,
        isPinned ? "#53F7AE" : "#888",
      ),
    );

    // Read time + reactions
    const readTime = getReadTime(article.reading_time_minutes);
    const reactions = article.public_reactions_count || 0;
    const metaParts = [`⏱️ ${readTime}`];
    if (showReactions) {
      metaParts.push(`❤️ ${reactions}`);
    }
    parts.push(
      `<text x="${inner}" y="${cardH - 10}" fill="#8b949e" font-family="Arial, sans-serif" font-size="10">${metaParts.join("  ·  ")}</text>`,
    );

    const svg = `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
      ${parts.join("\n      ")}
    </svg>`;

    // Return the article URL in a custom header so the README generator could read it
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=1800");
    res.setHeader("X-Article-Url", article.url || `https://dev.to/${username}`);
    return res.status(200).send(svg);
  } catch (error) {
    console.error("Dev.to single-card error:", error);
    res.setHeader("Content-Type", "image/svg+xml");
    return res.status(200).send(
      `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${cardW}" height="${cardH}" fill="#1a1a1a" stroke="#f85149" stroke-width="1" rx="8"/>
        <text x="${cardW / 2}" y="${cardH / 2}" text-anchor="middle" fill="#f85149" font-family="Arial,sans-serif" font-size="11">Article unavailable</text>
      </svg>`,
    );
  }
}
