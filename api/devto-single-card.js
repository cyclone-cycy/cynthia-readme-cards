/**
 * @module DevToSingleCardAPI
 * @description Renders a SINGLE Dev.to article card as an SVG with precise typography and un-cropped cover images.
 *              Supports both index-based and URL-based article selection.
 *              Automatically adapts to GitHub light/dark mode via CSS prefers-color-scheme.
 */

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
 * Wrap text into multiple lines for SVG rendering.
 * Uses 6.8px average char width for 12px Arial Bold to guarantee zero right-edge clipping.
 *
 * @param {string} text The text to wrap.
 * @param {number} usableWidth Width in px available for text (default 246px).
 * @param {number} maxLines Maximum lines allowed (default 2).
 * @returns {string[]} Array of line strings.
 */
function wrapText(text, usableWidth = 246, maxLines = 2) {
  if (!text) {
    return [""];
  }
  const words = text.split(" ");
  let lines = [];
  let currentLine = "";
  const charWidth = 6.8;
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

  // Truncate to maximum allowed lines to prevent vertical overlap
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

/**
 * Render tags as SVG text elements using CSS classes for theme support.
 *
 * @param {string[]} tagList Tag names.
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @param {number} fontSize Font size.
 * @param {boolean} isPinned Whether this is the pinned card (accent colour for tags).
 * @returns {string} SVG markup.
 */
function renderTags(tagList, x, y, fontSize = 9, isPinned = false) {
  if (!tagList || tagList.length === 0) {
    return "";
  }
  const tags = tagList.map((t) => `#${t}`).join(" ");
  const cssClass = isPinned ? "tag-accent" : "tag-muted";
  return `<text x="${x}" y="${y}" class="${cssClass}" font-family="Arial, sans-serif" font-size="${fontSize}">${cleanText(tags)}</text>`;
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

/**
 * Resolve which article to display.
 * Priority: explicit URL → explicit index param → env URL → env index → default index.
 *
 * @param {object} query  Request query params.
 * @param {boolean} isPinned Whether the pinned card is being rendered.
 * @param {string[]} articles Full list of articles from the Dev.to API.
 * @returns {object} The resolved article object.
 */
function resolveArticle(query, isPinned, articles) {
  // 1. Explicit ?url= query param always wins
  if (query.url) {
    const found = articles.find(
      (a) => a.url === query.url || a.canonical_url === query.url,
    );
    if (found) {
      return found;
    }
  }

  // 2. Explicit ?index= query param
  if (query.index) {
    const idx = parseInt(query.index, 10) - 1;
    return articles[Math.min(idx, articles.length - 1)] || articles[0];
  }

  // 3. Environment variable URL (for pinned card and card 3)
  if (isPinned && process.env.PINNED_ARTICLE_URL) {
    const found = articles.find(
      (a) =>
        a.url === process.env.PINNED_ARTICLE_URL ||
        a.canonical_url === process.env.PINNED_ARTICLE_URL,
    );
    if (found) {
      return found;
    }
  }

  if (query.card === "3" && process.env.CARD3_ARTICLE_URL) {
    const found = articles.find(
      (a) =>
        a.url === process.env.CARD3_ARTICLE_URL ||
        a.canonical_url === process.env.CARD3_ARTICLE_URL,
    );
    if (found) {
      return found;
    }
  }

  // 4. Fall back to environment variable index
  let resolvedIndex;
  if (isPinned) {
    resolvedIndex = process.env.PINNED_ARTICLE_INDEX || "1";
  } else if (query.card === "3") {
    resolvedIndex = process.env.CARD3_ARTICLE_INDEX || "3";
  } else {
    resolvedIndex = process.env.CARD1_ARTICLE_INDEX || "1";
  }

  const idx = parseInt(resolvedIndex, 10) - 1;
  return articles[Math.min(idx, articles.length - 1)] || articles[0];
}

// ---------------------------------------------------------------------------
// Adaptive colour tokens — referenced by CSS classes inside the SVG <style>
// Dark mode: #1a1a1a bg, white/green text  |  Light mode: #f6f8fa bg, dark text
// ---------------------------------------------------------------------------

const SVG_STYLES = `<style>
  /* ── Dark mode (default) ─────────────────────────────────────── */
  .card-bg   { fill: #1a1a1a; }
  .card-border { stroke: #53F7AE; }
  .title     { fill: #53F7AE; }
  .tag-accent { fill: #53F7AE; }
  .tag-muted  { fill: #888888; }
  .meta      { fill: #8b949e; }

  /* ── Light mode override ─────────────────────────────────────── */
  @media (prefers-color-scheme: light) {
    .card-bg   { fill: #f6f8fa; }
    .card-border { stroke: #1a7f5a; }
    .title     { fill: #0a6644; }
    .tag-accent { fill: #0a6644; }
    .tag-muted  { fill: #57606a; }
    .meta      { fill: #57606a; }
  }
</style>`;

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

  const cardW = parseInt(req.query.width || "270", 10);
  const cardH = parseInt(req.query.height || "220", 10);
  const showReactions = req.query.reactions !== "false";

  if (!username) {
    res.setHeader("Content-Type", "image/svg+xml");
    return res.status(200).send(
      `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
        ${SVG_STYLES}
        <rect class="card-bg" width="${cardW}" height="${cardH}" rx="8"/>
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

    const article = resolveArticle(req.query, isPinned, articles);

    // --- Fetch cover image as base64 (GitHub CSP blocks external URLs) ---
    const coverDataUri = article.cover_image
      ? await fetchImageAsBase64(article.cover_image)
      : null;

    // --- Build single-card SVG ---
    const inner = 12; // 12px left padding for clean breathing room
    const usableWidth = cardW - inner * 2; // 246px usable text width
    const hasCover = !!coverDataUri;
    let parts = [];

    // Inject adaptive CSS styles
    parts.push(SVG_STYLES);

    // Card Outer Container & Background (uses CSS class for theme-adaptive colour)
    parts.push(
      `<rect x="0" y="0" width="${cardW}" height="${cardH}" rx="8" class="card-bg card-border" stroke-width="1"/>`,
    );

    if (hasCover) {
      // 1. Full-Width 112px Hero Banner Image (Fits 1000x420 Dev.to banner aspect ratio 100% completely with zero cropping)
      const imageHeight = 112;
      parts.push(
        `<defs><clipPath id="coverClip"><rect x="6" y="6" width="${cardW - 12}" height="${imageHeight}" rx="6"/></clipPath></defs>`,
      );
      parts.push(
        `<image x="6" y="6" width="${cardW - 12}" height="${imageHeight}" href="${coverDataUri}" preserveAspectRatio="xMidYMid meet" clip-path="url(#coverClip)"/>`,
      );

      // Title (Positioned immediately below 112px cover banner)
      const titleStartY = 128;
      const titleLines = wrapText(article.title, usableWidth, 3); // 3 lines max when cover image present
      titleLines.forEach((line, i) => {
        parts.push(
          `<text x="${inner}" y="${titleStartY + i * 16}" class="title" font-family="Arial, sans-serif" font-size="12" font-weight="bold">${cleanText(line)}</text>`,
        );
      });
    } else {
      // 2. No Cover Image Layout (Clean, balanced typography card)
      const titleStartY = 36;
      const titleLines = wrapText(article.title, usableWidth, 4); // 4 lines allowed when no cover image
      titleLines.forEach((line, i) => {
        parts.push(
          `<text x="${inner}" y="${titleStartY + i * 18}" class="title" font-family="Arial, sans-serif" font-size="13" font-weight="bold">${cleanText(line)}</text>`,
        );
      });
    }

    // Tags (Fixed vertical baseline at y=182)
    parts.push(renderTags(article.tag_list, inner, 182, 9, isPinned));

    // Read time + reactions footer (y=206)
    const readTime = getReadTime(article.reading_time_minutes);
    const reactions = article.public_reactions_count || 0;
    const metaParts = [`⏱️ ${readTime}`];
    if (showReactions) {
      metaParts.push(`❤️ ${reactions}`);
    }
    parts.push(
      `<text x="${inner}" y="206" class="meta" font-family="Arial, sans-serif" font-size="10">${metaParts.join("  ·  ")}</text>`,
    );

    const svg = `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
      ${parts.join("\n      ")}
    </svg>`;

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=1800");
    res.setHeader("X-Article-Url", article.url || `https://dev.to/${username}`);
    return res.status(200).send(svg);
  } catch (error) {
    console.error("Dev.to single-card error:", error);
    res.setHeader("Content-Type", "image/svg+xml");
    return res.status(200).send(
      `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
        ${SVG_STYLES}
        <rect class="card-bg" width="${cardW}" height="${cardH}" stroke="#f85149" stroke-width="1" rx="8"/>
        <text x="${cardW / 2}" y="${cardH / 2}" text-anchor="middle" fill="#f85149" font-family="Arial,sans-serif" font-size="11">Article unavailable</text>
      </svg>`,
    );
  }
}
