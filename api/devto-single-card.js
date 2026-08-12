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
 * Fetch a remote image and return it as a base64 data URI.
 *
 * @param {string} url Remote image URL.
 * @returns {Promise<string|null>} Data URI or null.
 */
async function fetchImageAsBase64(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      return null;
    }
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const buffer = await resp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

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
 * Wrap text into multiple lines for SVG rendering (max 3 lines with truncation).
 *
 * @param {string} text The text to wrap.
 * @param {number} usableWidth Width in px available for text.
 * @returns {string[]} Array of line strings (max 3 lines).
 */
function wrapText(text, usableWidth = 246) {
  if (!text) {
    return [""];
  }
  const words = text.split(" ");
  let lines = [];
  let currentLine = "";
  const charWidth = 5.5;
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

  // Truncate to maximum 3 lines to prevent vertical overlap
  if (lines.length > 3) {
    lines = lines.slice(0, 3);
    const lastIdx = lines.length - 1;
    if (lines[lastIdx].length > maxChars - 3) {
      lines[lastIdx] = lines[lastIdx].substring(0, maxChars - 3) + "...";
    } else {
      lines[lastIdx] += "...";
    }
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
  const isPinned = req.query.pinned === "true";

  // Resolve article index: query param → Vercel env var → default 1
  let resolvedIndex;
  if (req.query.index) {
    resolvedIndex = req.query.index;
  } else if (isPinned) {
    resolvedIndex = process.env.PINNED_ARTICLE_INDEX || "1";
  } else if (req.query.card === "3") {
    resolvedIndex = process.env.CARD3_ARTICLE_INDEX || "3";
  } else {
    resolvedIndex = process.env.CARD1_ARTICLE_INDEX || "1";
  }
  const index = parseInt(resolvedIndex, 10) - 1; // convert 1-based → 0-based

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
      `https://dev.to/api/articles?username=${username}&per_page=1000`,
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

    // --- Fetch cover image as base64 (GitHub CSP blocks external URLs) ---
    const coverDataUri = article.cover_image
      ? await fetchImageAsBase64(article.cover_image)
      : null;

    // --- Build single-card SVG ---
    const inner = 12; // 12px padding from left edge for clean breathing room
    const usableWidth = cardW - inner * 2;
    const hasCover = !!coverDataUri;
    let parts = [];

    // Background
    parts.push(
      `<rect x="0" y="0" width="${cardW}" height="${cardH}" rx="8" fill="#1a1a1a" stroke="#53F7AE" stroke-width="1"/>`,
    );

    // Defs for rounded top corners on cover image
    parts.push(
      `<defs><clipPath id="coverClip"><rect x="6" y="6" width="${cardW - 12}" height="80" rx="6"/></clipPath></defs>`,
    );

    // Cover image (Full width header, edge-to-edge slice)
    if (hasCover) {
      parts.push(
        `<image x="6" y="6" width="${cardW - 12}" height="80" href="${coverDataUri}" preserveAspectRatio="xMidYMid slice" clip-path="url(#coverClip)"/>`,
      );
    }

    // Centered Pinned Badge
    if (isPinned) {
      if (hasCover) {
        parts.push(
          `<rect x="${cardW / 2 - 42}" y="70" width="84" height="20" rx="10" fill="#1a1a1a" stroke="#53F7AE" stroke-width="1"/>`,
        );
        parts.push(
          `<text x="${cardW / 2}" y="84" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#53F7AE" text-anchor="middle">📌 PINNED</text>`,
        );
      } else {
        parts.push(
          `<rect x="${cardW / 2 - 42}" y="12" width="84" height="26" rx="13" fill="#53F7AE"/>`,
        );
        parts.push(
          `<text x="${cardW / 2}" y="29" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#0d1117" text-anchor="middle">📌 PINNED</text>`,
        );
      }
    }

    // Title (Positioned immediately below cover/pinned with zero dead space)
    const titleStartY = hasCover ? 104 : isPinned ? 52 : 25;
    const titleColor = isPinned ? "#ffffff" : "#53F7AE";
    const titleLines = wrapText(article.title, usableWidth);
    titleLines.forEach((line, i) => {
      parts.push(
        `<text x="${inner}" y="${titleStartY + i * 16}" fill="${titleColor}" font-family="Arial, sans-serif" font-size="12" font-weight="bold">${cleanText(line)}</text>`,
      );
    });

    // Tags
    const tagY = hasCover ? 170 : 170;
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
      `<text x="${inner}" y="${cardH - 12}" fill="#8b949e" font-family="Arial, sans-serif" font-size="10">${metaParts.join("  ·  ")}</text>`,
    );

    const svg = `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
      ${parts.join("\n      ")}
    </svg>`;

    // Return SVG response
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
