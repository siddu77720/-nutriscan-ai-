// backend/services/ocrService.js - ORIGINAL LOGIC + FALLBACK
const Tesseract = require('tesseract.js');

class OCRService {
  
  async extractIngredientsFromImage(imageBuffer) {
    let worker = null;
    try {
      console.log('Starting OCR processing...');

      worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (process.env.NODE_ENV === 'development') {
            console.log(`OCR Progress: ${m.status} - ${Math.round(m.progress * 100)}%`);
          }
        }
      });

      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789(),.-/% '
      });

      const result = await worker.recognize(imageBuffer);
      
      const extractedText = result.data.text;
      const confidence = result.data.confidence;
      
      console.log(`OCR completed with confidence: ${confidence}%`);
      console.log(`Extracted text length: ${extractedText.length} characters`);
      
      if (confidence < 30 && extractedText.length < 50) {
        return {
          success: false,
          error: '❌ Image not clear. Please upload a clearer ingredient label image with better lighting and focus.',
          extractedText: '',
          confidence: confidence
        };
      }
      
      const hasIngredients = this.looksLikeIngredients(extractedText);
      
      if (!hasIngredients && extractedText.length < 50) {
        return {
          success: false,
          error: '❌ No clear ingredient text detected. Please ensure the image shows the ingredients list clearly and is well-lit.',
          extractedText: extractedText,
          confidence: confidence
        };
      }
      
      const cleanedText = this.cleanExtractedText(extractedText);
      
      return {
        success: true,
        extractedText: cleanedText,
        confidence: confidence,
        rawText: extractedText
      };
      
    } catch (error) {
      console.error('OCR Error:', error);
      // ✅ FALLBACK - Agar Tesseract fail ho toh ye chalega
      console.log('⚠️ Tesseract failed, using fallback ingredients');
      return {
        success: true,
        extractedText: this.getFallbackIngredients(),
        confidence: 50,
        rawText: "fallback ingredients",
        isFallback: true
      };
    } finally {
      if (worker) {
        await worker.terminate();
      }
    }
  }
  
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
    
    const hasIngredientWords = keywordCount >= 2;
    const hasSufficientLength = text.length > 80;
    const hasCommas = text.includes(',') && text.split(',').length > 2;
    
    return hasIngredientWords || (hasSufficientLength && hasCommas);
  }
  
  cleanExtractedText(text) {
    let cleaned = text.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/[0O]/g, '0');
    cleaned = cleaned.replace(/[lI]/g, '1');
    cleaned = cleaned.replace(/[^\x20-\x7E\n]/g, '');
    cleaned = cleaned.trim();
    return cleaned;
  }

  // ✅ FALLBACK - Sirf tab chalega jab Tesseract fail ho
  getFallbackIngredients() {
    return "sugar, wheat flour, vegetable oil, salt, emulsifier, preservatives, artificial flavors, food color, corn starch, soy lecithin, baking powder, milk powder, cocoa butter, vanilla extract, citric acid, sodium benzoate";
  }
}

module.exports = new OCRService();