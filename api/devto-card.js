/**
 * @module DevToCardAPI
 * @description API endpoint that renders a 3-card horizontal layout of Dev.to articles.
 *
 * FEATURES:
 * - Configurable article selection via CARD1_ARTICLE_INDEX, CARD3_ARTICLE_INDEX, PINNED_ARTICLE_INDEX
 * - Cover image rendering with proper aspect-ratio scaling
 * - Read time pulled directly from Dev.to API (reading_time_minutes)
 * - Reaction count display
 * - Pinned badge on the middle card
 * - Tag rendering on all cards
 * - Styled error/fallback card on failure
 *
 * ENVIRONMENT VARIABLES (see .env.example):
 *   DEVTO_USERNAME           – Dev.to username (required)
 *   CARD1_ARTICLE_INDEX      – 1-based index for left card   (default 1 = most recent)
 *   CARD3_ARTICLE_INDEX      – 1-based index for right card  (default 2)
 *   PINNED_ARTICLE_INDEX     – 1-based index for middle card (default 3)
 *   PINNED_SHOW_COVER        – "true"/"false" (default "true")
 *   PINNED_SHOW_TAGS         – "true"/"false" (default "true")
 *   PINNED_SHOW_READ_TIME    – "true"/"false" (default "true")
 */

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Escape XML-special characters so text is safe inside SVG.
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
 * Wrap text into multiple lines that fit inside a card of the given pixel width.
 * Uses a rough character-width heuristic for Arial 12 px.
 *
 * @param {string} text  The text to wrap.
 * @param {number} cardWidth  Pixel width of the card container.
 * @returns {string[]} Array of line strings.
 */
function wrapText(text, cardWidth = 260) {
  if (!text) {
    return [""];
  }
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  // 6 % margin on each side, minimum 10 px
  const margin = Math.max(10, Math.floor(cardWidth * 0.06));
  const usableWidth = cardWidth - margin * 2;
  // ~6 px per character at font-size 12 in Arial
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
 * Render a tag list as a single SVG <text> element.
 *
 * @param {string[]} tagList  Array of tag names (without #).
 * @param {number} x  X coordinate.
 * @param {number} y  Y coordinate.
 * @param {number} fontSize  Font size in px.
 * @param {string} color  Fill colour.
 * @returns {string} SVG markup (empty string if no tags).
 */
function renderTags(tagList, x, y, fontSize = 9, color = "#888") {
  if (!tagList || tagList.length === 0) {
    return "";
  }
  const tags = tagList.map((t) => `#${t}`).join(" ");
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, sans-serif" font-size="${fontSize}">${cleanText(tags)}</text>`;
}

/**
 * Format reading time from the Dev.to API value.
 *
 * @param {number|undefined} minutes reading_time_minutes from Dev.to.
 * @returns {string} e.g. "5 min read".
 */
function getReadTime(minutes) {
  return `${minutes || 1} min read`;
}

// ---------------------------------------------------------------------------
// Card renderer helpers
// ---------------------------------------------------------------------------

/**
 * Render a single article card within the 3-card SVG.
 *
 * @param {object} article  Dev.to article object.
 * @param {number} xOffset  Horizontal offset for this card slot.
 * @param {object} opts     Rendering options.
 * @param {boolean} opts.showCover     Whether to show cover image.
 * @param {boolean} opts.showTags      Whether to show tags.
 * @param {boolean} opts.showReadTime  Whether to show read time.
 * @param {boolean} opts.showReactions Whether to show reaction count.
 * @param {boolean} opts.isPinned      Whether this is the pinned card.
 * @param {string}  opts.titleColor    Title text colour.
 * @param {string}  opts.tagColor      Tag text colour.
 * @returns {string} SVG markup for this card.
 */
function renderCard(article, xOffset, opts = {}) {
  const {
    showCover = true,
    showTags = true,
    showReadTime = true,
    showReactions = true,
    isPinned = false,
    titleColor = "#53F7AE",
    tagColor = "#888",
  } = opts;

  const x = xOffset; // left edge of the card rect
  const inner = x + 5; // inner content left padding
  const cardW = 270;
  const cardH = 220;

  let parts = [];

  // --- Card background ---
  parts.push(
    `<rect x="${x}" y="5" width="${cardW}" height="${cardH}" rx="8" fill="#1a1a1a" stroke="#53F7AE" stroke-width="1"/>`,
  );

  // --- Cover image (if available and enabled) ---
  const hasCover = showCover && article.cover_image;
  if (hasCover) {
    parts.push(
      `<image x="${inner}" y="10" width="260" height="70" href="${article.cover_image}" preserveAspectRatio="xMidYMid slice"/>`,
    );
  }

  // --- Pinned badge ---
  if (isPinned) {
    if (hasCover) {
      // Badge over the cover image
      parts.push(
        `<text x="${x + cardW / 2}" y="95" font-family="Arial, sans-serif" font-size="10" fill="#53F7AE" text-anchor="middle">📌 PINNED</text>`,
      );
    } else {
      // Standalone badge when no cover
      parts.push(
        `<rect x="${x + cardW / 2 - 18}" y="15" width="36" height="35" rx="6" fill="#53F7AE"/>`,
      );
      parts.push(
        `<text x="${x + cardW / 2}" y="38" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0d1117" text-anchor="middle">📌</text>`,
      );
      parts.push(
        `<text x="${x + cardW / 2}" y="52" font-family="Arial, sans-serif" font-size="8" fill="#53F7AE" text-anchor="middle">PINNED</text>`,
      );
    }
  }

  // --- Title (wrapped) ---
  const titleStartY = hasCover ? 125 : isPinned ? 78 : 30;
  const color = isPinned ? "#ffffff" : titleColor;
  const titleLines = wrapText(article.title, 260);
  titleLines.forEach((line, i) => {
    parts.push(
      `<text x="${inner}" y="${titleStartY + i * 15}" fill="${color}" font-family="Arial, sans-serif" font-size="12" font-weight="bold" text-anchor="start">${cleanText(line)}</text>`,
    );
  });

  // --- Tags ---
  if (showTags) {
    const tagY = hasCover ? 190 : isPinned ? 143 : 190;
    parts.push(
      renderTags(
        article.tag_list,
        inner,
        tagY,
        9,
        isPinned ? "#53F7AE" : tagColor,
      ),
    );
  }

  // --- Read time + reactions ---
  if (showReadTime || showReactions) {
    const metaY = 210;
    const readTime = getReadTime(article.reading_time_minutes);
    const reactions = article.public_reactions_count || 0;
    const metaParts = [];
    if (showReadTime) {
      metaParts.push(`⏱️ ${readTime}`);
    }
    if (showReactions) {
      metaParts.push(`❤️ ${reactions}`);
    }
    parts.push(
      `<text x="${inner}" y="${metaY}" fill="#8b949e" font-family="Arial, sans-serif" font-size="10">${metaParts.join("  ·  ")}</text>`,
    );
  }

  return parts.join("\n      ");
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Main API handler for rendering 3-card Dev.to article layout.
 *
 * @param {object} req Express request.
 * @param {object} res Express response.
 * @returns {Promise<void>} SVG response.
 */
export default async function handler(req, res) {
  const username = process.env.DEVTO_USERNAME || req.query.username;

  if (!username) {
    res.setHeader("Content-Type", "image/svg+xml");
    return res.status(200).send(
      `<svg width="840" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="840" height="200" fill="#1a1a1a" rx="8"/>
        <text x="420" y="100" text-anchor="middle" fill="#f85149" font-family="Arial,sans-serif" font-size="14">⚠️ Missing DEVTO_USERNAME environment variable</text>
      </svg>`,
    );
  }

  try {
    // Fetch enough articles so configurable indices don't go out-of-bounds
    const response = await fetch(
      `https://dev.to/api/articles?username=${username}&per_page=10`,
    );

    if (!response.ok) {
      throw new Error(`Dev.to API responded with ${response.status}`);
    }

    const allArticles = await response.json();

    if (!Array.isArray(allArticles) || allArticles.length === 0) {
      throw new Error("No articles found for this username");
    }

    // --- Configurable article selection (1-based in .env) ---
    const card1Idx = parseInt(process.env.CARD1_ARTICLE_INDEX || "1", 10) - 1;
    const card3Idx = parseInt(process.env.CARD3_ARTICLE_INDEX || "2", 10) - 1;
    const pinnedIdx = parseInt(process.env.PINNED_ARTICLE_INDEX || "3", 10) - 1;

    const article1 = allArticles[card1Idx] || allArticles[0] || {};
    const pinnedArticle =
      allArticles[pinnedIdx] || allArticles[2] || allArticles[0] || {};
    const article3 =
      allArticles[card3Idx] || allArticles[1] || allArticles[0] || {};

    // --- Per-card display options (all default to "true") ---
    const card1ShowReactions =
      (process.env.CARD1_SHOW_REACTIONS || "true") === "true";
    const card2ShowReactions =
      (process.env.CARD2_SHOW_REACTIONS || "true") === "true";
    const card3ShowReactions =
      (process.env.CARD3_SHOW_REACTIONS || "true") === "true";

    // --- Pinned card display options ---
    const showCover = (process.env.PINNED_SHOW_COVER || "true") === "true";
    const showTags = (process.env.PINNED_SHOW_TAGS || "true") === "true";
    const showReadTime =
      (process.env.PINNED_SHOW_READ_TIME || "true") === "true";

    // --- Build 3-card SVG ---
    const svg = `<svg width="840" height="230" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <!-- Card 1: Left — Article index ${card1Idx + 1} -->
      ${renderCard(article1, 5, { showCover: true, showTags: true, showReadTime: true, showReactions: card1ShowReactions, isPinned: false })}

      <!-- Card 2: Middle — PINNED article index ${pinnedIdx + 1} -->
      ${renderCard(pinnedArticle, 285, { showCover, showTags, showReadTime, showReactions: card2ShowReactions, isPinned: true })}

      <!-- Card 3: Right — Article index ${card3Idx + 1} -->
      ${renderCard(article3, 565, { showCover: true, showTags: true, showReadTime: true, showReactions: card3ShowReactions, isPinned: false })}
    </svg>`;

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=1800");
    return res.status(200).send(svg);
  } catch (error) {
    console.error("Dev.to card error:", error);

    const fallbackSvg = `<svg width="840" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="840" height="200" fill="#1a1a1a" stroke="#f85149" stroke-width="1" rx="8"/>
      <text x="420" y="90" text-anchor="middle" fill="#f85149" font-family="Arial, sans-serif" font-size="16" font-weight="bold">📝 Dev.to Articles Unavailable</text>
      <text x="420" y="120" text-anchor="middle" fill="#8b949e" font-family="Arial, sans-serif" font-size="12">Visit dev.to/${username} directly</text>
    </svg>`;

    res.setHeader("Content-Type", "image/svg+xml");
    return res.status(200).send(fallbackSvg);
  }
}
