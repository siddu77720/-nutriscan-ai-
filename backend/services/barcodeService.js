// backend/services/barcodeService.js - UPDATED WITH RETRY LOGIC

const axios = require('axios');

class BarcodeService {
  constructor() {
    // Cache to avoid repeated API calls
    this.cache = new Map();
    
    // Open Food Facts API endpoints
    this.INDIA_API = 'https://india.openfoodfacts.org/api/v0/product';
    this.WORLD_API = 'https://world.openfoodfacts.org/api/v0/product';
    
    console.log('✅ Barcode Service initialized');
    console.log(`📦 Using India API: ${this.INDIA_API}`);
    console.log(`🌍 Using World API: ${this.WORLD_API}`);
  }

  /**
   * Get product by barcode
   * First tries India API, then World API
   */
  async getProductByBarcode(barcode) {
    // Check cache first
    if (this.cache.has(barcode)) {
      const cached = this.cache.get(barcode);
      // Return cached data if less than 30 days old
      if (Date.now() - cached.timestamp < 30 * 24 * 60 * 60 * 1000) {
        console.log(`📦 Cache hit for barcode: ${barcode}`);
        return cached.data;
      }
      // Remove expired cache
      this.cache.delete(barcode);
    }

    // Try World API first (more stable)
    console.log(`🔍 Trying World API for: ${barcode}`);
    let product = await this.fetchFromAPI(this.WORLD_API, barcode);
    
    // If not found in World, try India API
    if (!product) {
      console.log(`🔍 Trying India API for: ${barcode}`);
      product = await this.fetchFromAPI(this.INDIA_API, barcode);
    }

    // If still not found, return error
    if (!product) {
      return {
        success: false,
        error: 'Product not found in database. Try manual entry or search by name.'
      };
    }

    // Cache the product
    this.cache.set(barcode, {
      data: product,
      timestamp: Date.now()
    });

    return product;
  }

  /**
   * Fetch product from a specific API endpoint with RETRY LOGIC
   */
  async fetchFromAPI(baseUrl, barcode, retryCount = 0) {
    const maxRetries = 3;
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    try {
      const url = `${baseUrl}/${barcode}.json`;
      console.log(`📡 Fetching: ${url}`);
      
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'NutriScanAI - Food Scanner App'
        }
      });

      // Check if product exists
      if (response.data && response.data.status === 1) {
        const product = response.data.product;
        return this.formatProductData(product, barcode);
      }

      return null;
    } catch (error) {
      // Server busy - retry with backoff
      if (error.response?.status === 429 || error.response?.status === 503 || error.response?.status === 502 || error.code === 'ECONNABORTED') {
        if (retryCount < maxRetries) {
          const waitTime = 2000 * Math.pow(2, retryCount);
          console.log(`⚠️ Server busy, retry ${retryCount + 1}/${maxRetries} in ${waitTime/1000}s...`);
          await delay(waitTime);
          return this.fetchFromAPI(baseUrl, barcode, retryCount + 1);
        }
      }
      
      if (error.response && error.response.status === 404) {
        console.log(`❌ Product not found: ${barcode}`);
        return null;
      }
      
      console.error(`❌ API Error for ${barcode}:`, error.message);
      return null;
    }
  }

  /**
   * Format product data consistently
   * Check if ingredients are available
   */
  formatProductData(product, barcode) {
    // Extract ingredients
    let ingredients = product.ingredients_text || 
                     product.ingredients_text_en || 
                     product.ingredients || 
                     '';

    // Clean ingredients
    ingredients = ingredients
      .replace(/\s+/g, ' ')
      .trim();

    // Extract nutrition data
    const nutriments = product.nutriments || {};

    // CHECK: Are ingredients available?
    const hasIngredients = ingredients && ingredients.length > 5;
    
    console.log(`📊 Ingredients available: ${hasIngredients ? '✅ YES' : '❌ NO'} (${ingredients.length} chars)`);

    // If NO ingredients, return special response
    if (!hasIngredients) {
      console.log(`⚠️ No ingredients found for: ${barcode}`);
      
      return {
        success: true,
        hasIngredients: false,
        name: product.product_name || 
              product.product_name_en || 
              'Unknown Product',
        brand: product.brands || 
               product.brand || 
               'Unknown Brand',
        barcode: barcode,
        image: product.image_url || 
               product.image_front_url || 
               '',
        ingredients: '',
        nutrition: {},
        summary: `${product.product_name || 'Product'} by ${product.brands || 'Unknown Brand'}`,
        categories: product.categories || '',
        labels: product.labels || '',
        countries: product.countries || '',
        nutriscore: product.nutriscore_data?.grade || null,
        ecoScore: product.ecoscore_data?.grade || null,
        source: product.source || 'Open Food Facts',
        error: 'ingredients_missing',
        message: '⚠️ No ingredients found for this product in our database.',
        suggestion: '💡 Please use "Upload Image" mode to scan the ingredients label from the product packaging for accurate analysis.'
      };
    }

    // Return full product with ingredients
    return {
      success: true,
      hasIngredients: true,
      name: product.product_name || 
            product.product_name_en || 
            'Unknown Product',
      brand: product.brands || 
             product.brand || 
             'Unknown Brand',
      barcode: barcode,
      image: product.image_url || 
             product.image_front_url || 
             '',
      ingredients: ingredients,
      nutrition: {
        calories: nutriments.energy_value || 
                  nutriments.energy || 
                  null,
        sugar: nutriments.sugars_value || 
               nutriments.sugars || 
               null,
        sodium: nutriments.sodium_value || 
                nutriments.sodium || 
                null,
        fat: nutriments.fat_value || 
             nutriments.fat || 
             null,
        saturatedFat: nutriments.saturated_fat_value || 
                      nutriments.saturated_fat || 
                      null,
        protein: nutriments.proteins_value || 
                 nutriments.proteins || 
                 null,
        fiber: nutriments.fiber_value || 
               nutriments.fiber || 
               null,
        carbohydrates: nutriments.carbohydrates_value || 
                       nutriments.carbohydrates || 
                       null
      },
      summary: this.generateSummary(product),
      categories: product.categories || '',
      labels: product.labels || '',
      countries: product.countries || '',
      nutriscore: product.nutriscore_data?.grade || null,
      ecoScore: product.ecoscore_data?.grade || null,
      source: product.source || 'Open Food Facts'
    };
  }

  /**
   * Generate a summary for the product
   */
  generateSummary(product) {
    const name = product.product_name || 'Product';
    const brand = product.brands || 'Unknown Brand';
    const categories = product.categories || '';
    
    let summary = `${name} by ${brand}`;
    
    if (categories) {
      const cats = categories.split(',').slice(0, 2).join(', ');
      summary += ` - ${cats}`;
    }
    
    if (product.nutriscore_data?.grade) {
      const grade = product.nutriscore_data.grade.toUpperCase();
      summary += ` (Nutri-Score: ${grade})`;
    }
    
    return summary;
  }

  /**
   * Search products by name (for fallback)
   */
  async searchProductByName(query) {
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=10`;
      
      console.log(`🔍 Searching: ${query}`);
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'NutriScanAI - Food Scanner App'
        }
      });

      if (response.data && response.data.products) {
        const results = response.data.products
          .filter(p => p.product_name)
          .slice(0, 10)
          .map(p => ({
            name: p.product_name,
            brand: p.brands || 'Unknown',
            barcode: p.code,
            image: p.image_url || '',
            score: this.calculateQuickScore(p.nutriments)
          }));

        return {
          success: true,
          results: results
        };
      }

      return {
        success: false,
        results: []
      };
    } catch (error) {
      console.error('Search error:', error);
      return {
        success: false,
        results: [],
        error: 'Search failed'
      };
    }
  }

  /**
   * Quick score calculation for search results
   */
  calculateQuickScore(nutriments) {
    if (!nutriments) return 5;
    
    let score = 5;
    
    if (nutriments.sugars_value > 15) score -= 2;
    else if (nutriments.sugars_value > 8) score -= 1;
    
    if (nutriments.sodium_value > 600) score -= 2;
    else if (nutriments.sodium_value > 400) score -= 1;
    
    if (nutriments.proteins_value > 10) score += 1.5;
    
    if (nutriments.fiber_value > 5) score += 1;
    
    return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('🗑️ Barcode cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
    /**
   * Search products by name (fallback when barcode not found)
   */
  async searchProductByName(query) {
      try {
          const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=10`;
          
          console.log(`🔍 Searching: ${query}`);
          
          const response = await axios.get(url, {
              timeout: 10000,
              headers: {
                  'User-Agent': 'NutriScanAI - Food Scanner App'
              }
          });

          if (response.data && response.data.products) {
              const results = response.data.products
                  .filter(p => p.product_name)
                  .slice(0, 10)
                  .map(p => ({
                      name: p.product_name || 'Unknown Product',
                      brand: p.brands || 'Unknown Brand',
                      barcode: p.code || '',
                      image: p.image_url || '',
                      score: this.calculateQuickScore(p.nutriments)
                  }));

              return {
                  success: true,
                  results: results
              };
          }

          return {
              success: false,
              results: [],
              error: 'No products found'
          };
      } catch (error) {
          console.error('Search error:', error);
          return {
              success: false,
              results: [],
              error: 'Search failed'
          };
      }
  }

  /**
   * Quick score calculation for search results
   */
  calculateQuickScore(nutriments) {
      if (!nutriments) return 5;
      
      let score = 5;
      
      if (nutriments.sugars_value > 15) score -= 2;
      else if (nutriments.sugars_value > 8) score -= 1;
      
      if (nutriments.sodium_value > 600) score -= 2;
      else if (nutriments.sodium_value > 400) score -= 1;
      
      if (nutriments.proteins_value > 10) score += 1.5;
      
      if (nutriments.fiber_value > 5) score += 1;
      
      return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
  }
}

module.exports = new BarcodeService();