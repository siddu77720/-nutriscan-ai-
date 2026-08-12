// backend/services/analysisService.js - UPDATED WITH MIN SCORE 1.0 & REALISTIC RATINGS

class AnalysisService {
  
  analyzeIngredients(extractedText, healthConditions = []) {
    // VALIDATION: Reject empty or insufficient text
    if (!extractedText || extractedText.trim().length < 20) {
      return {
        success: false,
        error: "❌ Could not detect ingredients. Please upload a CLEAR image of the INGREDIENTS LIST. Make sure the text is readable and well-lit.",
        score: null,
        rating: null,
        ratingColor: null,
        harmfulIngredients: [],
        goodIngredients: [],
        warnings: []
      };
    }
    
    const ingredients = this.parseIngredients(extractedText);
    
    if (!ingredients || ingredients.length === 0) {
      return {
        success: false,
        error: "❌ No ingredients detected. Please take a photo of the INGREDIENTS LIST (not the front of package). Ensure text is clearly visible.",
        score: null,
        rating: null,
        ratingColor: null,
        harmfulIngredients: [],
        goodIngredients: [],
        warnings: []
      };
    }
    
    // ============================================================
    // START WITH BASE SCORE 5.5 (neutral, slightly leaning healthy)
    // ============================================================
    let score = 5.5;
    const harmfulFound = [];
    const goodFound = [];
    
    // ==================== HARMFUL INGREDIENTS ====================
    const harmfulKeywords = {
      'high sugar': { 
        keywords: ['sugar', 'sucrose', 'glucose', 'fructose', 'corn syrup', 'honey', 'molasses', 'dextrose', 'maltose'], 
        penalty: 2.0 
      },
      'high sodium': { 
        keywords: ['sodium', 'salt', 'monosodium', 'msg', 'sodium chloride'], 
        penalty: 1.8 
      },
      'palm oil': { 
        keywords: ['palm oil', 'palmolein'], 
        penalty: 1.5 
      },
      'artificial colors': { 
        keywords: ['red 40', 'yellow 5', 'blue 1', 'artificial color', 'fd&c', 'yellow 6', 'red 3'], 
        penalty: 1.5 
      },
      'preservatives': { 
        keywords: ['benzoate', 'sorbate', 'nitrate', 'sulfite', 'bht', 'bha', 'sodium benzoate', 'potassium sorbate'], 
        penalty: 1.2 
      },
      'additives': { 
        keywords: ['monosodium glutamate', 'msg', 'aspartame', 'saccharin', 'sucralose', 'acesulfame'], 
        penalty: 1.2 
      },
      'trans fat': { 
        keywords: ['trans fat', 'hydrogenated oil', 'partially hydrogenated'], 
        penalty: 2.5 
      },
      'refined flour': { 
        keywords: ['maida', 'refined wheat', 'white flour', 'all-purpose flour', 'enriched flour'], 
        penalty: 0.8 
      }
    };
    
    // ==================== GOOD INGREDIENTS ====================
    const goodKeywords = {
      'fiber': { 
        keywords: ['fiber', 'fibre', 'whole grain', 'oat', 'bran', 'psyllium', 'whole wheat'], 
        bonus: 1.5 
      },
      'protein': { 
        keywords: ['protein', 'whey', 'soy protein', 'pea protein', 'plant protein'], 
        bonus: 1.5 
      },
      'whole grains': { 
        keywords: ['whole wheat', 'whole grain', 'brown rice', 'quinoa', 'oats', 'rolled oats', 'millet', 'ragi'], 
        bonus: 1.5 
      },
      'natural ingredients': { 
        keywords: ['organic', 'natural', 'real fruit', 'real vegetable', '100% natural', 'no preservatives'], 
        bonus: 1.0 
      },
      'nuts & seeds': { 
        keywords: ['almond', 'walnut', 'cashew', 'pistachio', 'peanut', 'sunflower seed', 'pumpkin seed', 'chia', 'flax'], 
        bonus: 1.2 
      },
      'probiotics': { 
        keywords: ['probiotic', 'live cultures', 'fermented', 'curd', 'yogurt culture'], 
        bonus: 1.0 
      }
    };
    
    // ============ APPLY PENALTIES (Harmful) ============
    for (const [category, data] of Object.entries(harmfulKeywords)) {
      for (const keyword of data.keywords) {
        if (this.containsIngredient(ingredients, keyword)) {
          if (!harmfulFound.includes(category)) {
            harmfulFound.push(category);
            score -= data.penalty;
          }
          break;
        }
      }
    }
    
    // ============ APPLY BONUSES (Good) ============
    for (const [category, data] of Object.entries(goodKeywords)) {
      for (const keyword of data.keywords) {
        if (this.containsIngredient(ingredients, keyword)) {
          if (!goodFound.includes(category)) {
            goodFound.push(category);
            score += data.bonus;
          }
          break;
        }
      }
    }
    
    // ============ SUGAR PERCENTAGE CHECK ============
    const sugarPercentage = this.extractPercentage(extractedText, ['sugar', 'sugars', 'added sugar']);
    if (sugarPercentage !== null) {
      if (sugarPercentage > 30) {
        score -= 2.5;
        harmfulFound.push('very high sugar content (' + sugarPercentage + '%)');
      } else if (sugarPercentage > 20) {
        score -= 1.8;
        harmfulFound.push('high sugar content (' + sugarPercentage + '%)');
      } else if (sugarPercentage > 12) {
        score -= 1.0;
        harmfulFound.push('moderate sugar content (' + sugarPercentage + '%)');
      } else if (sugarPercentage <= 5) {
        // Low sugar is good
        if (!goodFound.includes('low sugar')) {
          goodFound.push('low sugar');
          score += 0.8;
        }
      }
    }
    
    // ============ SODIUM CHECK ============
    const sodiumMg = this.extractSodium(extractedText);
    if (sodiumMg !== null) {
      if (sodiumMg > 1000) {
        score -= 2.5;
        harmfulFound.push('very high sodium (' + sodiumMg + 'mg)');
      } else if (sodiumMg > 600) {
        score -= 1.8;
        harmfulFound.push('high sodium (' + sodiumMg + 'mg)');
      } else if (sodiumMg > 400) {
        score -= 1.0;
        harmfulFound.push('moderate sodium (' + sodiumMg + 'mg)');
      } else if (sodiumMg <= 100) {
        if (!goodFound.includes('low sodium')) {
          goodFound.push('low sodium');
          score += 0.8;
        }
      }
    }
    
    // ============ FAT CHECK ============
    const fatPct = this.extractPercentage(extractedText, ['fat', 'saturated fat', 'total fat']);
    if (fatPct !== null) {
      if (fatPct > 25) {
        score -= 1.5;
        harmfulFound.push('high fat content (' + fatPct + '%)');
      } else if (fatPct > 15) {
        score -= 0.8;
        harmfulFound.push('moderate fat content (' + fatPct + '%)');
      }
    }
    
    // ============ PROTEIN BONUS ============
    const proteinPct = this.extractPercentage(extractedText, ['protein']);
    if (proteinPct !== null && proteinPct > 10) {
      if (!goodFound.includes('high protein')) {
        goodFound.push('high protein');
        score += 1.0;
      }
    }
    
    // ============ FIBER BONUS ============
    const fiberPct = this.extractPercentage(extractedText, ['fiber', 'fibre']);
    if (fiberPct !== null && fiberPct > 5) {
      if (!goodFound.includes('high fiber')) {
        goodFound.push('high fiber');
        score += 1.0;
      }
    }
    
    // ============================================================
    // CLAMP SCORE: MINIMUM 1.0, MAXIMUM 10.0
    // ROUND TO 1 DECIMAL PLACE
    // ============================================================
    score = Math.max(1.0, Math.min(10.0, Math.round(score * 10) / 10));
    
    // ============================================================
    // DETERMINE RATING
    // ============================================================
    let rating = '';
    let ratingColor = '';
    if (score >= 7.0) {
      rating = 'Healthy';
      ratingColor = 'green';
    } else if (score >= 4.0) {
      rating = 'Moderate';
      ratingColor = 'orange';
    } else {
      rating = 'Unhealthy';
      ratingColor = 'red';
    }
    
    // ============ GENERATE WARNINGS ============
    const warnings = this.generateWarnings(ingredients, extractedText, healthConditions);
    const uniqueHarmful = [...new Set(harmfulFound)];
    const uniqueGood = [...new Set(goodFound)];
    
    return {
      success: true,
      score: score,  // Always between 1.0 and 10.0
      rating: rating,
      ratingColor: ratingColor,
      harmfulIngredients: uniqueHarmful,
      goodIngredients: uniqueGood,
      warnings: warnings,
      ingredientsList: ingredients.slice(0, 20),
      rawText: extractedText.substring(0, 500)
    };
  }
  
  // ============================================================
  // HELPER METHODS
  // ============================================================
  
  parseIngredients(text) {
    if (!text) return [];
    const lowerText = text.toLowerCase();
    let ingredients = lowerText.split(/[,\n;]/);
    ingredients = ingredients
      .map(ing => ing.trim())
      .filter(ing => ing.length > 0 && ing.length < 100)
      .filter(ing => !ing.match(/^\d+$/));
    return ingredients;
  }
  
  containsIngredient(ingredients, keyword) {
    const keywordLower = keyword.toLowerCase();
    return ingredients.some(ing => ing.includes(keywordLower));
  }
  
  extractPercentage(text, keywords) {
    for (const keyword of keywords) {
      const regex = new RegExp(`${keyword}\\s*(?:content)?\\s*(?:is)?\\s*(\\d+(?:\\.\\d+)?)%`, 'i');
      const match = text.match(regex);
      if (match) {
        return parseFloat(match[1]);
      }
    }
    return null;
  }
  
  extractSodium(text) {
    const patterns = [
      /sodium[\s:]+(\d+)\s*mg/i,
      /sodium[\s:]+(\d+(?:\.\d+)?)\s*g/i,
      /salt[\s:]+(\d+)\s*mg/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let value = parseFloat(match[1]);
        if (pattern.toString().includes('g') && !pattern.toString().includes('mg')) {
          value = value * 1000;
        }
        return value;
      }
    }
    return null;
  }
  
  generateWarnings(ingredients, text, healthConditions) {
    const warnings = [];
    
    if (!healthConditions || healthConditions.length === 0) {
      return warnings;
    }
    
    const hasHighSugar = this.containsIngredient(ingredients, 'sugar') || 
                         this.containsIngredient(ingredients, 'sucrose') ||
                         this.containsIngredient(ingredients, 'glucose') ||
                         this.containsIngredient(ingredients, 'fructose');
    
    const sugarPercentage = this.extractPercentage(text, ['sugar', 'sugars']);
    const isSugarHigh = hasHighSugar || (sugarPercentage !== null && sugarPercentage > 10);
    
    const hasHighSodium = this.containsIngredient(ingredients, 'sodium') ||
                          this.containsIngredient(ingredients, 'salt');
    const sodiumMg = this.extractSodium(text);
    const isSodiumHigh = hasHighSodium || (sodiumMg !== null && sodiumMg > 400);
    
    const hasHighFat = this.containsIngredient(ingredients, 'palm oil') ||
                       this.containsIngredient(ingredients, 'saturated fat') ||
                       this.containsIngredient(ingredients, 'trans fat') ||
                       this.containsIngredient(ingredients, 'hydrogenated oil');
    
    const hasRefinedFlour = this.containsIngredient(ingredients, 'maida') ||
                            this.containsIngredient(ingredients, 'refined wheat') ||
                            this.containsIngredient(ingredients, 'white flour');
    
    // Diabetes warning
    if (healthConditions.includes('diabetes') && isSugarHigh) {
      warnings.push({
        condition: 'Diabetes',
        warning: '⚠️ You have diabetes. This product contains high sugar which may affect blood glucose levels. Consider low-sugar alternatives.'
      });
    }
    
    // High BP warning
    if (healthConditions.includes('high bp') && isSodiumHigh) {
      warnings.push({
        condition: 'High Blood Pressure',
        warning: '⚠️ This product contains high sodium which may not be suitable for people with high blood pressure. Look for low-sodium options.'
      });
    }
    
    // Cholesterol warning
    if (healthConditions.includes('cholesterol') && hasHighFat) {
      warnings.push({
        condition: 'High Cholesterol',
        warning: '⚠️ This product contains palm oil or saturated fats which may affect cholesterol levels. Consider options with healthy fats instead.'
      });
    }
    
    // Weight Loss warning
    if (healthConditions.includes('weight loss')) {
      if (sugarPercentage !== null && sugarPercentage > 15) {
        warnings.push({
          condition: 'Weight Management',
          warning: '⚠️ This product is high in sugar which can hinder weight loss goals. Consider lower-calorie alternatives.'
        });
      }
      if (hasRefinedFlour) {
        warnings.push({
          condition: 'Weight Management',
          warning: '⚠️ Contains refined flour (maida). For weight management, choose whole grain alternatives.'
        });
      }
      if (this.containsIngredient(ingredients, 'sugar') && !hasHighSugar) {
        warnings.push({
          condition: 'Weight Management',
          warning: '⚠️ Contains added sugars. For weight management, choose products with no added sugars when possible.'
        });
      }
    }
    
    // Heart Problems warning
    if (healthConditions.includes('heart problems') && (isSodiumHigh || hasHighFat)) {
      warnings.push({
        condition: 'Heart Health',
        warning: '⚠️ This product contains ingredients (high sodium or saturated fats) that may not be heart-friendly. Consult your doctor for personalized advice.'
      });
    }
    
    return warnings;
  }
  
  getAlternatives(harmfulIngredients) {
    const alternatives = {
      'high sugar': 'Choose products with no added sugars or natural sweeteners like stevia',
      'high sodium': 'Look for low-sodium or no-salt-added versions',
      'palm oil': 'Look for products using olive oil, coconut oil, or no oil',
      'artificial colors': 'Choose naturally colored products using beetroot, turmeric, or spirulina',
      'preservatives': 'Opt for fresh or frozen alternatives without preservatives',
      'additives': 'Choose whole food options with minimal processing',
      'trans fat': 'Choose products with zero trans fats, look for "no hydrogenated oil"',
      'refined flour': 'Choose whole wheat or multigrain alternatives'
    };
    
    const suggestions = [];
    for (const harmful of harmfulIngredients) {
      if (alternatives[harmful]) {
        suggestions.push(alternatives[harmful]);
      }
    }
    
    return suggestions.length > 0 ? suggestions : ['Choose whole, minimally processed foods for better nutrition'];
  }
}

module.exports = new AnalysisService();