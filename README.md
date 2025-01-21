# Trading Card Market API

A comprehensive REST API for scraping and managing trading card market data, with a focus on Pokemon and One Piece trading cards.

## 🚀 Features

- Real-time eBay market data scraping with intelligent card type detection
- Historical price tracking with condition analysis
- Custom set management
- User portfolio tracking
- Advanced search capabilities
- Automatic Japanese card detection and handling

## 📋 Prerequisites

- Node.js (v14 or higher)
- MySQL (v8.0 or higher)
- npm or yarn
- Puppeteer dependencies (for Ubuntu/Debian):
```bash
sudo apt-get install -y \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libnss3 \
    libcups2 \
    libxss1 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgtk-3-0
```

## 🛠️ Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/trading-card-api.git
cd trading-card-api
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```plaintext
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_DATABASE=your_database
DB_CONNECTION_LIMIT=10
DB_CONNECT_TIMEOUT=15000
NODE_ENV=development
PORT=3000
```

5. Start the server:
```bash
npm start
```

## 📚 API Documentation

### Scraping Endpoints

#### Scrape Card Market Data
```http
POST /scraping
```

Scrapes recent eBay sales data for a specific card.

##### Request Body
```json
{
  "name": "Charizard",
  "number": "4",
  "set_printedTotal": "102",
  "set_name": "Base Set",
  "unique_id": "base1-4"
}
```

##### Response
```json
{
  "status": "success",
  "data": {
    "data": [
      {
        "soldDate": "2024-05-12",
        "itemPrice": 150.00,
        "cardboardType": "Holofoil",
        "condition": "NM",
        "title": "Pokemon Base Set Charizard Holo",
        "listing_url": "https://ebay.com/..."
      }
    ],
    "source_url": "https://ebay.com/...",
    "timestamp": "2024-05-12T15:30:00.000Z"
  }
}
```

##### Card Types Detected
- Normal
- Holofoil
- Reverse Holofoil
- 1st Edition Normal
- 1st Edition Holofoil

##### Card Conditions
- NM (Near Mint)
- LP (Lightly Played)
- MP (Moderately Played)
- HP (Heavily Played)

### Error Responses

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "Missing required card data parameters"
}
```

```json
{
  "status": "error",
  "statusCode": 500,
  "message": "Scraping failed: Network error"
}
```

## 🧪 Testing

Run the test suite:
```bash
npm test
```

Run specific tests:
```bash
npm test -- --grep "Scraping Service"
```

## 🔒 Security

- Input validation on all endpoints
- Rate limiting implemented
- CORS protection
- Error handling middleware
- Request filtering for scraping
- Resource optimization for Puppeteer

## 📦 Project Structure

```
project/
├── config/           # Configuration files
│   └── database.js   # Database configuration
├── controllers/      # Route controllers
│   └── scrapingController.js
├── middleware/       # Custom middleware
│   └── errorHandler.js
├── routes/          # API routes
│   └── scrapingRoutes.js
├── services/        # Business logic
│   └── scrapingService.js
├── utils/           # Helper functions
│   └── database.js
└── tests/           # Test files
    └── scraping.test.js
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Follow ESLint configuration
- Write tests for new features
- Update documentation
- Follow semantic versioning

## 📝 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## 👥 Authors

- Your Name - Initial work - [YourGithub](https://github.com/yourusername)

## 🙏 Acknowledgments

- eBay for market data
- Pokemon TCG API for card metadata
- Puppeteer team for web scraping capabilities
- Contributors and maintainers

## 📈 Roadmap

- [ ] Add support for more card games
- [ ] Implement machine learning for condition detection
- [ ] Add image recognition capabilities
- [ ] Expand market data sources
- [ ] Add real-time price alerts