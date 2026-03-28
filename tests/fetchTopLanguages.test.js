import { expect, it, describe, afterEach } from "@jest/globals";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { fetchTopLanguages } from "../src/fetchers/top-languages.js";

const mock = new MockAdapter(axios);

afterEach(() => {
  mock.reset();
});

const data_langs = {
  data: {
    user: {
      repositories: {
        nodes: [
          {
            name: "test-repo-1",
            isFork: false,
            languages: {
              edges: [
                { size: 100, node: { color: "#0f0", name: "TypeScript" } },
              ],
            },
          },
          {
            name: "test-repo-2",
            isFork: false,
            languages: {
              edges: [
                { size: 100, node: { color: "#0f0", name: "TypeScript" } },
              ],
            },
          },
          {
            name: "test-repo-3",
            isFork: false,
            languages: {
              edges: [
                { size: 100, node: { color: "#0ff", name: "javascript" } },
              ],
            },
          },
          {
            name: "test-repo-4",
            isFork: false,
            languages: {
              edges: [
                { size: 100, node: { color: "#0ff", name: "javascript" } },
              ],
            },
          },
        ],
      },
      pullRequests: {
        nodes: [],
      },
    },
  },
};

describe("FetchTopLanguages", () => {
  it("should fetch correct language data while using the new calculation", async () => {
    mock.onPost("https://api.github.com/graphql").reply(200, data_langs);

    let repo = await fetchTopLanguages("anuraghazra", [], 0.5, 0.5);
    expect(repo).toStrictEqual({
      TypeScript: {
        color: "#3178c6", // Our custom override
        count: 2,
        name: "TypeScript",
        size: 20.000000000000004,
      },
      javascript: {
        color: "#0ff",
        count: 2,
        name: "javascript",
        size: 20.000000000000004,
      },
    });
  });

  it("should fetch correct language data while excluding the 'test-repo-1' repository", async () => {
    mock.onPost("https://api.github.com/graphql").reply(200, data_langs);

    let repo = await fetchTopLanguages("anuraghazra", ["test-repo-1"]);
    expect(repo).toStrictEqual({
      TypeScript: {
        color: "#3178c6",
        count: 1,
        name: "TypeScript",
        size: 100,
      },
      javascript: {
        color: "#0ff",
        count: 2,
        name: "javascript",
        size: 400, // Weighted size
      },
    });
  });

  it("should fetch correct language data while using the old calculation", async () => {
    mock.onPost("https://api.github.com/graphql").reply(200, data_langs);

    let repo = await fetchTopLanguages("anuraghazra", [], 1, 0);
    expect(repo).toStrictEqual({
      TypeScript: {
        color: "#3178c6",
        count: 2,
        name: "TypeScript",
        size: 200,
      },
      javascript: {
        color: "#0ff",
        count: 2,
        name: "javascript",
        size: 200,
      },
    });
  });

  it("should rank languages by the number of repositories they appear in", async () => {
    mock.onPost("https://api.github.com/graphql").reply(200, data_langs);

    let repo = await fetchTopLanguages("anuraghazra", [], 0, 1);
    expect(repo).toStrictEqual({
      TypeScript: {
        color: "#3178c6",
        count: 2,
        name: "TypeScript",
        size: 2,
      },
      javascript: {
        color: "#0ff",
        count: 2,
        name: "javascript",
        size: 2,
      },
    });
  });
});
