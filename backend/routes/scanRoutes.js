// backend/routes/scanRoutes.js - UPDATED WITH INGREDIENTS CHECK

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const ocrService = require('../services/ocrService');
const analysisService = require('../services/analysisService');
const { getGroqExplanation } = require('../services/groqService');
const barcodeService = require('../services/barcodeService');

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    if (allowedTypes.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'));
    }
  }
});

// ============================================
// EXISTING ENDPOINT - Image OCR Analysis
// ============================================
router.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    console.log('\n=========================================');
    console.log('🟢 NEW SCAN REQUEST RECEIVED');
    console.log('=========================================');
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded' });
    }
    
    let healthConditions = [];
    if (req.body.healthConditions) {
      try {
        healthConditions = JSON.parse(req.body.healthConditions);
        console.log('Health conditions:', healthConditions);
      } catch (e) {}
    }
    
    console.log('Running OCR on image...');
    const ocrResult = await ocrService.extractIngredientsFromImage(req.file.buffer);
    
    if (!ocrResult.success) {
      console.log('OCR Failed:', ocrResult.error);
      return res.status(400).json({ success: false, error: ocrResult.error });
    }
    
    console.log('OCR Success. Text length:', ocrResult.extractedText.length);
    
    console.log('Analyzing ingredients...');
    const analysis = analysisService.analyzeIngredients(ocrResult.extractedText, healthConditions);
    
    if (!analysis.success) {
      console.log('Analysis Failed:', analysis.error);
      return res.status(400).json({ success: false, error: analysis.error });
    }
    
    console.log('⭐ Score:', analysis.score, '/10');
    console.log('📊 Rating:', analysis.rating);
    
    console.log('Getting AI explanation...');
    const explanation = await getGroqExplanation(ocrResult.extractedText, analysis);
    
    console.log('✅ Sending response to client');
    
    res.json({
      success: true,
      analysis: {
        score: analysis.score,
        rating: analysis.rating,
        ratingColor: analysis.ratingColor,
        harmfulIngredients: analysis.harmfulIngredients,
        goodIngredients: analysis.goodIngredients,
        warnings: analysis.warnings
      },
      explanation: explanation
    });
    
  } catch (error) {
    console.error('❌ Server Error:', error);
    res.status(500).json({ success: false, error: 'Server error: ' + error.message });
  }
});

// ============================================
// EXISTING ENDPOINT - Text Analysis
// ============================================
router.post('/analyze-text', async (req, res) => {
  try {
    const { ingredientsText, healthConditions } = req.body;
    
    if (!ingredientsText || ingredientsText.length < 10) {
      return res.status(400).json({ success: false, error: 'Enter valid ingredients (min 10 characters)' });
    }
    
    const analysis = analysisService.analyzeIngredients(ingredientsText, healthConditions || []);
    
    if (!analysis.success) {
      return res.status(400).json({ success: false, error: analysis.error });
    }
    
    const explanation = await getGroqExplanation(ingredientsText, analysis);
    
    res.json({
      success: true,
      analysis: {
        score: analysis.score,
        rating: analysis.rating,
        ratingColor: analysis.ratingColor,
        harmfulIngredients: analysis.harmfulIngredients,
        goodIngredients: analysis.goodIngredients,
        warnings: analysis.warnings
      },
      explanation: explanation
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================
// NEW ENDPOINT - Barcode Scanner
// UPDATED: Check for ingredients_missing error
// ============================================
router.post('/barcode', async (req, res) => {
  try {
    console.log('\n=========================================');
    console.log('📦 NEW BARCODE REQUEST RECEIVED');
    console.log('=========================================');
    
    const { barcode, healthConditions } = req.body;
    
    if (!barcode) {
      return res.status(400).json({ 
        success: false, 
        error: 'Barcode is required' 
      });
    }
    
    console.log(`📷 Scanning barcode: ${barcode}`);
    
    // Fetch product from barcode service
    const product = await barcodeService.getProductByBarcode(barcode);
    
    if (!product.success) {
      console.log('❌ Product not found:', product.error);
      return res.status(404).json({
        success: false,
        error: product.error || 'Product not found. Try manual entry.'
      });
    }

    // NEW: Check if ingredients are missing
    if (product.hasIngredients === false) {
      console.log('⚠️ Ingredients missing for product:', product.name);
      
      // Return product info without analysis
      return res.json({
        success: false,
        error: 'ingredients_missing',
        message: '⚠️ No ingredients found for this product in our database.',
        suggestion: '💡 Please use "Upload Image" mode to scan the ingredients label from the product packaging for accurate analysis.',
        product: {
          name: product.name,
          brand: product.brand,
          barcode: product.barcode,
          image: product.image,
          ingredients: '',
          nutrition: {}
        }
      });
    }
    
    console.log('✅ Product found:', product.name);
    console.log('🏷️ Brand:', product.brand);
    console.log('📊 Ingredients length:', product.ingredients?.length || 0);
    
    // Analyze ingredients using existing analysis service
    const analysis = analysisService.analyzeIngredients(
      product.ingredients || '',
      healthConditions || []
    );
    
    if (!analysis.success) {
      console.log('⚠️ Analysis fallback: Using default analysis');
      // If analysis fails, create a basic analysis
      const fallbackAnalysis = {
        success: true,
        score: 5,
        rating: 'Moderate',
        ratingColor: 'orange',
        harmfulIngredients: [],
        goodIngredients: [],
        warnings: [],
        ingredientsList: product.ingredients ? product.ingredients.split(',').slice(0, 10) : [],
        rawText: product.ingredients || ''
      };
      
      // Get AI explanation with fallback
      const explanation = await getGroqExplanation(
        product.ingredients || product.name,
        fallbackAnalysis
      );
      
      return res.json({
        success: true,
        product: {
          name: product.name,
          brand: product.brand,
          barcode: product.barcode,
          image: product.image,
          ingredients: product.ingredients,
          nutrition: product.nutrition
        },
        analysis: {
          score: fallbackAnalysis.score,
          rating: fallbackAnalysis.rating,
          ratingColor: fallbackAnalysis.ratingColor,
          harmfulIngredients: fallbackAnalysis.harmfulIngredients,
          goodIngredients: fallbackAnalysis.goodIngredients,
          warnings: fallbackAnalysis.warnings
        },
        explanation: explanation
      });
    }
    
    console.log('⭐ Score:', analysis.score, '/10');
    console.log('📊 Rating:', analysis.rating);
    
    // Get AI explanation
    console.log('Getting AI explanation...');
    const explanation = await getGroqExplanation(
      product.ingredients || product.name,
      analysis
    );
    
    console.log('✅ Sending barcode response to client');
    
    res.json({
      success: true,
      product: {
        name: product.name,
        brand: product.brand,
        barcode: product.barcode,
        image: product.image,
        ingredients: product.ingredients,
        nutrition: product.nutrition,
        summary: product.summary
      },
      analysis: {
        score: analysis.score,
        rating: analysis.rating,
        ratingColor: analysis.ratingColor,
        harmfulIngredients: analysis.harmfulIngredients,
        goodIngredients: analysis.goodIngredients,
        warnings: analysis.warnings
      },
      explanation: explanation
    });
    
  } catch (error) {
    console.error('❌ Barcode Server Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error: ' + error.message 
    });
  }
});

// ============================================
// NEW ENDPOINT - Search Product by Name
// ============================================
router.post('/barcode/search', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required (min 2 characters)'
      });
    }
    
    console.log(`🔍 Searching products for: ${query}`);
    
    const results = await barcodeService.searchProductByName(query);
    
    res.json({
      success: true,
      results: results
    });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed: ' + error.message
    });
  }
});
// ============================================
// SEARCH PRODUCT BY NAME
// ============================================
router.post('/barcode/search', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required (min 2 characters)'
      });
    }
    
    console.log(`🔍 Searching products for: ${query}`);
    
    const results = await barcodeService.searchProductByName(query);
    
    res.json({
      success: true,
      results: results
    });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed: ' + error.message
    });
  }
});

module.exports = router;