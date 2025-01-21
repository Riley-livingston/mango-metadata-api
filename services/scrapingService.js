const puppeteer = require('puppeteer');
const { AppError } = require('../middleware/errorHandler');

// Constants for eBay search parameters
const EBAY_CONFIG = {
  BASE_URL: "https://www.ebay.com/sch/i.html?_from=R40",
  CATEGORY: "&_sacat=183454",
  TITLE_DESC: "&LH_TitleDesc=1",
  RT: "&rt=nc",
  SOLD_COMPLETE: "&LH_Sold=1&LH_Complete=1",
  DEFAULT_EXCLUSIONS: [
    "Graded", "Grade", "PGO", "CGC", "BGS", "PSA",
    "Pick", "Singles", "Choose", "Sealed",
    "Korean", "italian", "german", "signed", "Gem"
  ]
};

class CardDataParser {
  static determineCardboardType(title) {
    const lowerTitle = this._normalizeTitle(title);
    
    // Check for explicit non-holo mentions
    if (this._containsAny(lowerTitle, ['nonholo', 'non holo'])) {
      return 'Normal';
    }

    // Check for reverse holo
    if (this._containsAny(lowerTitle, ['reverse', 'rev holo'])) {
      return 'Reverse';
    }

    // Check for special card types
    const specialPatterns = [
      'vmax', 'rainbow', 'illustration', 'secret rare', 'secret',
      'double rare', 'lvx', 'art rare', 'shiny rare', 'full art',
      'prism rare', 'Hyper Rare', 'SAR', 'SIR', 'v'
    ];
    
    if (this._containsAny(lowerTitle, specialPatterns)) {
      return 'Holofoil';
    }

    // Check for holofoil and editions
    if (this._containsAny(lowerTitle, ['holo', 'holographic', 'holofoil'])) {
      return this._containsAny(lowerTitle, ['first', '1st']) 
        ? '1st Edition Holofoil' 
        : 'Holofoil';
    }

    return this._containsAny(lowerTitle, ['first', '1st']) 
      ? '1st Edition Normal' 
      : 'Normal';
  }

  static determineCondition(title) {
    const lowerTitle = this._normalizeTitle(title);
    const conditions = {
      'NM': ['nm', 'near mint', 'nearmint'],
      'LP': ['lp', 'light play', 'lightly played'],
      'MP': ['mp', 'moderate play', 'moderately played'],
      'HP': ['hp', 'heavy play', 'heavily played', 'damaged']
    };

    for (const [condition, keywords] of Object.entries(conditions)) {
      if (this._containsAny(lowerTitle, keywords)) {
        return condition;
      }
    }
    
    return 'NM'; // Default condition
  }

  static _normalizeTitle(title) {
    return title.toLowerCase()
      .replace(/[^a-z0-9+\s]/gi, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static _containsAny(text, keywords) {
    return keywords.some(keyword => text.includes(keyword));
  }

  static formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  }
}

class ScrapingService {
  constructor() {
    this.config = EBAY_CONFIG;
  }

  async scrapeCard(cardData) {
    let browser = null;
    try {
      this._validateCardData(cardData);
      
      const searchParams = this._buildSearchParams(cardData);
      const url = this._constructUrl(searchParams);
      
      browser = await this._initializeBrowser();
      const page = await this._setupPage(browser);
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      const scrapedData = await this._extractListings(page);
      
      return {
        data: scrapedData,
        source_url: url,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new AppError(500, `Scraping failed: ${error.message}`);
    } finally {
      if (browser) await browser.close();
    }
  }

  _validateCardData({ name, number, set_printedTotal, set_name, unique_id }) {
    if (!name || !number || !set_printedTotal || !set_name || !unique_id) {
      throw new AppError(400, 'Missing required card data parameters');
    }
  }

  _buildSearchParams({ name, number, set_printedTotal, set_name, unique_id }) {
    const isJapanese = unique_id.split("-")[0].endsWith("jp");
    const normalizedName = name.replace(/δ/g, 'Delta Species');

    return {
      keywords: isJapanese
        ? `${normalizedName} ${set_name} Japanese`
        : `${normalizedName} ${number}/${set_printedTotal} ${set_name}`,
      exclusions: this._getExclusions(set_name)
    };
  }

  _getExclusions(setName) {
    let exclusions = [...this.config.DEFAULT_EXCLUSIONS];
    
    if (setName === "Base") {
      exclusions.push("1st", "First", "shadowless", "1ed");
    } else if (setName.includes("jp")) {
      exclusions.push("1st", "First", "1ed");
    }
    
    return exclusions.map(term => `-${term}`).join(' ');
  }

  _constructUrl({ keywords, exclusions }) {
    const searchQuery = encodeURIComponent(`${keywords} ${exclusions}`);
    return `${this.config.BASE_URL}&_nkw=${searchQuery}${this.config.CATEGORY}${this.config.TITLE_DESC}${this.config.RT}${this.config.SOLD_COMPLETE}`;
  }

  async _initializeBrowser() {
    return await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  async _setupPage(browser) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      ['image', 'stylesheet', 'font'].includes(resourceType)
        ? request.abort()
        : request.continue();
    });
    
    return page;
  }

  async _extractListings(page) {
    return await page.evaluate(() => {
      const listings = [];
      const items = document.querySelectorAll('div.s-item__info.clearfix');
      
      // Skip first item (usually an ad) and limit to 10 results
      for (let i = 1; i < items.length && listings.length < 10; i++) {
        const item = items[i];
        const listing = this._extractListingData(item);
        if (listing) listings.push(listing);
      }
      
      return listings;
    });
  }

  _extractListingData(item) {
    const soldDate = item.querySelector('.s-item__caption--row span span')?.innerText;
    const itemPrice = item.querySelector('.s-item__price span.POSITIVE')?.innerText;
    const title = item.querySelector('.s-item__title span[role="heading"]')?.innerText;
    const listing_url = item.querySelector('.s-item__link')?.href;

    if (!soldDate || !itemPrice || !title || !listing_url) return null;

    return {
      soldDate: CardDataParser.formatDate(soldDate.replace('Sold ', '')),
      itemPrice: parseFloat(itemPrice.replace('$', '')),
      cardboardType: CardDataParser.determineCardboardType(title),
      condition: CardDataParser.determineCondition(title),
      title: title.trim(),
      listing_url
    };
  }
}

module.exports = ScrapingService;