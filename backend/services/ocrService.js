// backend/services/ocrService.js - SIRF OCR.SPACE API, NO TESSERACT!
const axios = require('axios');
const FormData = require('form-data');

class OCRService {
  
  async extractIngredientsFromImage(imageBuffer) {
    try {
      console.log('🔄 Starting OCR with OCR.space API...');
      
      if (!imageBuffer || imageBuffer.length < 100) {
        return {
          success: false,
          error: '❌ Image not clear. Please upload a clearer image.',
          extractedText: '',
          confidence: 0
        };
      }

      // ✅ Check API Key
      if (!process.env.OCR_SPACE_API_KEY) {
        console.error('❌ OCR_SPACE_API_KEY not set in environment variables');
        return {
          success: false,
          error: '❌ OCR service not configured. Please contact support.',
          extractedText: '',
          confidence: 0
        };
      }

      // ✅ OCR.space API Call
      const formData = new FormData();
      formData.append('apikey', process.env.OCR_SPACE_API_KEY);
      formData.append('file', imageBuffer, {
        filename: 'image.jpg',
        contentType: 'image/jpeg'
      });
      formData.append('language', 'eng');
      formData.append('isOverlayRequired', 'false');

      const response = await axios.post('https://api.ocr.space/parse/image', formData, {
        headers: {
          ...formData.getHeaders()
        },
        timeout: 20000
      });

      const result = response.data;
      
      // ✅ Check if OCR was successful
      if (result.OCRExitCode === 1 && result.ParsedResults && result.ParsedResults.length > 0) {
        const extractedText = result.ParsedResults[0].ParsedText;
        const confidence = result.ParsedResults[0].FileParseExitCode === 1 ? 80 : 50;
        
        console.log(`📝 Extracted text length: ${extractedText.length} chars`);
        console.log(`📊 Confidence: ${confidence}%`);
        
        if (extractedText && extractedText.length > 20) {
          const cleanedText = this.cleanExtractedText(extractedText);
          const hasIngredients = this.looksLikeIngredients(cleanedText);
          
          if (hasIngredients && cleanedText.length > 30) {
            return {
              success: true,
              extractedText: cleanedText,
              confidence: confidence,
              rawText: extractedText,
              source: 'ocr.space'
            };
          }
        }
      }
      
      // ❌ OCR Failed
      console.log('❌ OCR failed - no valid text detected');
      return {
        success: false,
        error: '❌ Could not detect ingredients. Please upload a CLEAR image of the INGREDIENTS LIST. Make sure the text is readable and well-lit.',
        extractedText: '',
        confidence: 0
      };
      
    } catch (error) {
      console.error('❌ OCR Error:', error.message);
      
      if (error.response?.status === 403) {
        return {
          success: false,
          error: '❌ Invalid OCR API key. Please check your configuration.',
          extractedText: '',
          confidence: 0
        };
      }
      
      return {
        success: false,
        error: '❌ OCR service error. Please try again with a clearer image.',
        extractedText: '',
        confidence: 0
      };
    }
  }
  
  // ✅ ORIGINAL FUNCTIONS - WAISA HI!
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
      if (lowerText.includes(keyword)) {
        keywordCount++;
      }
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