const express = require('express');
const router = express.Router();
const scrapingController = require('../controllers/scrapingController');

/**
 * @route POST /scraping
 * @desc Scrape card data from eBay
 * @access Public
 */
router.post('/', scrapingController.scrapeCardData);

module.exports = router; 