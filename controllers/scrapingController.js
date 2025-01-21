const ScrapingService = require('../services/scrapingService');

const scrapeCardData = async (req, res) => {
    const scrapingService = new ScrapingService(); // Create an instance of ScrapingService

    try {
        const { name, number, set_printedTotal, set_name, unique_id } = req.body;

        if (!name || !number || !set_printedTotal || !set_name || !unique_id) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required parameters'
            });
        }

        // Call the scrapeCard method from ScrapingService
        const result = await scrapingService.scrapeCard({
            name,
            number,
            set_printedTotal,
            set_name,
            unique_id
        });

        res.json({
            status: 'success',
            data: result
        });

    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

module.exports = {
    scrapeCardData
}; 