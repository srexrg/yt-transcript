const axios = require("axios");
const cheerio = require("cheerio");
const { URL, URLSearchParams } = require("url");
const fs = require("fs");

const base_url = "https://www.marketingmonk.so/";

function extractText(element) {
  return element.text().trim();
}

function isValidUrl(url) {
  const parsedUrl = new URL(url);
  return parsedUrl.hostname.endsWith("marketingmonk.so");
}

async function scrapeLinkedPage(url, visitedUrls) {
  if (visitedUrls.has(url)) {
    return null;
  }
  visitedUrls.add(url);

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const $ = cheerio.load(response.data);

    const h2Text = extractText($("h2"));
    const pText = $("p")
      .map((_, el) => extractText($(el)))
      .get()
      .join(" ");

    return {
      url: url,
      h2_text: h2Text,
      p_text: pText,
    };
  } catch (error) {
    console.error(`Failed to retrieve linked page ${url}: ${error.message}`);
    return null;
  }
}

async function scrapeArchivePages(startPage, maxPages) {
  const visitedUrls = new Set();
  const allData = [];

  for (let pageNumber = startPage; pageNumber <= maxPages; pageNumber++) {
    const archiveUrl = `${base_url}archive?page=${pageNumber}`;

    try {
      const response = await axios.get(archiveUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });

      const $ = cheerio.load(response.data);

      const links = $("a[href]")
        .map((_, el) => $(el).attr("href"))
        .get();

      for (const href of links) {
        const fullUrl = new URL(href, base_url).href;

        if (isValidUrl(fullUrl)) {
          const pageData = await scrapeLinkedPage(fullUrl, visitedUrls);
          if (pageData) {
            allData.push(pageData);
          }
        }
      }
    } catch (error) {
      console.error(
        `Failed to retrieve archive page ${archiveUrl}: ${error.message}`
      );
    }
  }

  fs.writeFileSync(
    "monk_data.json",
    JSON.stringify(allData, null, 4),
    "utf-8"
  );
  console.log(
    "Scraping completed for all pages and data saved to monk_data.json successfully."
  );
}

scrapeArchivePages(1, 11);
