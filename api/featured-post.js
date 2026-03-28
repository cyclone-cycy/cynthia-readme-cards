/**
 * @module FeaturedPost
 * @description API endpoint for fetching and rendering a single featured Dev.to post.
 */

import { fetchFeaturedPost } from "../src/fetchers/devto-post.js";
import { renderDevToCard } from "../src/cards/devto-card.js";

export default async (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  try {
    const post = await fetchFeaturedPost();
    return res.send(renderDevToCard(post));
  } catch {
    return res.send("");
  }
};
