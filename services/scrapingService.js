const puppeteer = require('puppeteer');
const { AppError } = require('../middleware/errorHandler');

class ScrapingService {
  constructor() {
    // You can initialize any configuration here if needed
  }

  async scrapeCard(cardData) {
    const { name, number, set_printedTotal, set_name, unique_id } = cardData;
    const base_url = "https://www.ebay.com/sch/i.html?_from=R40";
    let exclusions = "-Graded -Grade -PGO -CGC -BGS -PSA -Pick -Singles -Choose -Sealed -Korean -italian -german -signed -Gem";
    const category = "&_sacat=183454";
    const title_desc = "&LH_TitleDesc=1";
    const rt = "&rt=nc";
    const sold_complete = "&LH_Sold=1&LH_Complete=1";

    // Replace "δ" with "Delta Species" in the name
    if (name.includes('δ')) {
      name = name.replace(/δ/g, 'Delta Species');
    }

    // Split the unique_id and check the suffix
    const uniqueIdParts = unique_id.split("-");
    let keywords;
    if (uniqueIdParts[0].endsWith("jp")) {
      exclusions += " -English";
      keywords = `${name} ${set_name} Japanese`; // Exclude number and set_printedTotal, add "Japanese"
    } else {
      keywords = `${name} ${number}/${set_printedTotal} ${set_name}`;
    }

    // Add "1st", "First", and "shadowless" to exclusions if set name is "Base"
    if (set_name === "Base") {
      exclusions += " -1st -First -shadowless -1ed ";
    } else if (set_name.includes("jp")) {
      exclusions += " -1st -First -1ed";
    }

    // Construct the final URL
    const url = `${base_url}&_nkw=${encodeURIComponent(keywords + ' ' + exclusions)}${category}${title_desc}${rt}${sold_complete}`;
    console.log("Constructed URL:", url);

    // Scrape data using Puppeteer
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Block unnecessary resources for faster scraping
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2' });

    const scrapedData = await this._extractListings(page);

    await browser.close();

    // Return the data
    return {
      data: scrapedData,
      source_url: url
    };
  }

  async _extractListings(page) {
    return await page.evaluate(() => {
      const results = [];
      const items = document.querySelectorAll('div.s-item__info.clearfix');

      // Skip the first item and get the next 10 items (or less if less than 10 available)
      for (let i = 1; i < items.length && results.length < 10; i++) {
        const item = items[i];
        let soldDate = item.querySelector('.s-item__caption--row span span')?.innerText;
        let itemPrice = item.querySelector('.s-item__price span.POSITIVE')?.innerText;
        let title = item.querySelector('.s-item__title span[role="heading"]')?.innerText;
        let listing_url = item.querySelector('.s-item__link')?.href;

        // Clean and format the extracted data
        if (soldDate) {
          soldDate = soldDate.replace('Sold ', '');
        }
        if (itemPrice) {
          itemPrice = itemPrice.replace('$', '');
        }

        if (soldDate && itemPrice && title && listing_url) {
          results.push({
            soldDate,
            itemPrice,
            title,
            listing_url
          });
        }
      }
      return results;
    });
  }
}

module.exports = ScrapingService;