// backend/services/ocrService.js - NO TESSERACT, ANALYSIS LOGIC INTACT
// Sirf Tesseract ki jagah fallback text dega, baaki analysis waisa hi rahega

class OCRService {
  
  async extractIngredientsFromImage(imageBuffer) {
    console.log('🔄 Starting OCR processing...');
    
    // Check if image buffer is valid
    if (!imageBuffer || imageBuffer.length < 100) {
      return {
        success: false,
        error: '❌ Image not clear. Please upload a clearer ingredient label image.',
        extractedText: '',
        confidence: 0
      };
    }

    try {
      // ---------- FALLBACK OCR ----------
      // Yeh sirf ek dummy text generate karega taaki analysisService chal sake
      // Tum chahte ho toh isko real OCR API se replace kar sakte ho
      const fallbackText = this.getFallbackText();
      
      console.log(`📝 Extracted text length: ${fallbackText.length} characters`);
      
      return {
        success: true,
        extractedText: fallbackText,
        confidence: 80,
        rawText: fallbackText,
        isFallback: true
      };
      
    } catch (error) {
      console.error('OCR Error:', error);
      return {
        success: false,
        error: 'Failed to process image. Please try again.',
        extractedText: '',
        confidence: 0
      };
    }
  }

  /**
   * ✅ FALLBACK TEXT - Sirf sample ingredients generate karega
   * AnalysisService isko parse karega aur score generate karega
   * Tum isko real OCR API se replace kar sakte ho
   */
  getFallbackText() {
    // Yeh sample text analysisService ko feed hoga
    // AnalysisService isko parse karega aur score dega
    return "sugar, wheat flour, vegetable oil, salt, emulsifier, preservatives, artificial flavors, food color, corn starch, soy lecithin, baking powder, milk powder, cocoa butter, vanilla extract, citric acid, sodium benzoate";
  }
  
  // ---------- HELPER FUNCTIONS (Pehle jaisi hi hain) ----------
  looksLikeIngredients(text) {
    const ingredientKeywords = [
      'ingredient', 'ingredients', 'contains', 'sugar', 'salt', 
      'oil', 'flour', 'water', 'protein', 'fat', 'calcium',
      'vitamin', 'preservative', 'natural', 'artificial',
      'enriched', 'bleached', 'unbleached', 'wheat', 'corn', 'soy'
    ];
    
    const lowerText = text.toLowerCase();
    let keywordCount = 0;
    for (const keyword of ingredientKeywords) {
      if (lowerText.includes(keyword)) keywordCount++;
    }
    
    return keywordCount >= 2 || text.length > 80;
  }
  
  cleanExtractedText(text) {
    let cleaned = text.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/[0O]/g, '0');
    cleaned = cleaned.replace(/[lI]/g, '1');
    cleaned = cleaned.replace(/[^\x20-\x7E\n]/g, '');
    return cleaned.trim();
  }
}

module.exports = new OCRService();