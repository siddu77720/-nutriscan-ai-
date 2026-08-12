// backend/services/groqService.js - FIXED WITH CORRECT GROQ MODELS

const Groq = require('groq-sdk');
require('dotenv').config();

let groq = null;

// ✅ CORRECT: These are the actual models available on Groq as of 2026
const WORKING_MODELS = [
  'llama-3.3-70b-versatile',    // Best quality, slower
  'llama-3.1-8b-instant',        // Fast, good quality
  'mixtral-8x7b-32768',          // Fallback
];

const initGroq = () => {
  if (!groq && process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here') {
    try {
      groq = new Groq({
        apiKey: process.env.GROQ_API_KEY
      });
      console.log('✅ Groq API initialized successfully');
      console.log('📡 Available models:', WORKING_MODELS.join(', '));
    } catch (error) {
      console.error('❌ Groq init failed:', error.message);
    }
  }
  return groq;
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const callWithRetry = async (fn, retries = 3, initialDelay = 1000) => {
  let lastError;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRateLimit = error.status === 429 || error.message?.includes('rate_limit');
      
      if (isRateLimit && i < retries - 1) {
        const waitTime = initialDelay * Math.pow(2, i);
        console.log(`⚠️ Rate limit. Retry in ${waitTime/1000}s...`);
        await delay(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

const getGroqExplanation = async (ingredientsText, analysisResult) => {
  try {
    console.log('\n📡 ===== GROQ API CALL STARTED =====');
    
    const groqClient = initGroq();
    
    if (!groqClient) {
      console.log('⚠️ Groq client not initialized, using fallback');
      return getFallbackExplanation(ingredientsText, analysisResult);
    }
    
    let response = null;
    let harmfulDetails = [];
    let goodDetails = [];
    let summary = '';
    let alternatives = [];
    
    const score = analysisResult.score;
    const harmfulIngredients = analysisResult.harmfulIngredients || [];
    const goodIngredients = analysisResult.goodIngredients || [];
    const isUnhealthy = score < 4;
    
    // Try each model in order
    for (let i = 0; i < WORKING_MODELS.length; i++) {
      const model = WORKING_MODELS[i];
      console.log(`📡 Trying model: ${model}...`);
      
      try {
        let prompt = `You are a friendly health advisor. Use very simple English.

Product ingredients: ${ingredientsText.substring(0, 800)}
Health score: ${score}/10
Harmful ingredients: ${harmfulIngredients.join(', ') || 'None'}
Good ingredients: ${goodIngredients.join(', ') || 'None'}

Give advice in this EXACT format:

SUMMARY: (2-3 sentences telling if this product is good or bad for health. Start with "Good news!" if healthy, "Let me be honest..." if not healthy)

HEALTH_DETAILS: (2-3 sentences explaining the main health concerns or benefits)

ALTERNATIVES: (Suggest 2 specific product names that are THE SAME TYPE but HEALTHIER. If this is a biscuit, suggest healthier biscuits. If chips, suggest healthier chips. If chocolate, suggest healthier chocolate. If bread, suggest healthier bread. Give real product names that exist in Indian market.)

Format alternatives exactly like this on new lines:
- Product Name 1 (explain why it's better in short)
- Product Name 2 (explain why it's better in short)

IMPORTANT: The alternatives MUST be the SAME TYPE of product, just healthier. Never suggest a completely different product category.`;

        const completion = await callWithRetry(async () => {
          return await groqClient.chat.completions.create({
            messages: [
              {
                role: "system",
                content: "You are a friendly health advisor. Never say 'doctor'. Use very simple English. Be honest, caring, and helpful like a good friend. Always suggest healthier alternatives from the SAME food category."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            model: model,
            temperature: 0.7,
            max_tokens: 600,
          });
        }, 2, 1000);
        
        response = completion.choices[0]?.message?.content;
        
        if (response && response.trim().length > 100) {
          console.log(`✅ Success with model: ${model}`);
          
          // Parse response
          const summaryMatch = response.match(/SUMMARY:\s*([\s\S]*?)(?=HEALTH_DETAILS:|ALTERNATIVES:|$)/i);
          const healthMatch = response.match(/HEALTH_DETAILS:\s*([\s\S]*?)(?=ALTERNATIVES:|$)/i);
          const alternativesMatch = response.match(/ALTERNATIVES:\s*([\s\S]*?)$/i);
          
          summary = summaryMatch ? summaryMatch[1].trim() : getFallbackSummary(analysisResult);
          
          if (healthMatch && healthMatch[1].trim()) {
            const healthText = healthMatch[1].trim();
            if (isUnhealthy) {
              harmfulDetails = [healthText];
            } else {
              goodDetails = [healthText];
            }
          } else {
            harmfulDetails = getHarmfulDetails(harmfulIngredients);
            goodDetails = getGoodDetails(goodIngredients);
          }
          
          // Parse alternatives from Groq response
          if (alternativesMatch) {
            const altText = alternativesMatch[1].trim();
            const altLines = altText.split(/[•\-\n]/).filter(line => line.trim().length > 5);
            for (let line of altLines) {
              const productMatch = line.match(/^[\s]*(.*?)(?:\s*\(|$)/);
              if (productMatch) {
                let productName = productMatch[1].trim();
                let description = line.replace(productName, '').replace(/[\(\)]/g, '').trim();
                if (!description) description = 'Healthier alternative';
                alternatives.push({
                  name: productName,
                  description: description,
                  link: `https://www.amazon.in/s?k=${encodeURIComponent(productName)}`
                });
              }
              if (alternatives.length >= 2) break;
            }
          }
          
          break;
        }
      } catch (error) {
        console.log(`⚠️ Model ${model} failed:`, error.message);
        continue;
      }
    }
    
    // If Groq didn't provide alternatives, use fallback
    if (alternatives.length === 0) {
      alternatives = getAlternativeFromProductType(ingredientsText, harmfulIngredients, score);
    }
    
    if (response && response.length > 100) {
      return {
        summary: summary,
        harmfulDetails: harmfulDetails,
        goodDetails: goodDetails,
        alternatives: alternatives
      };
    } else {
      console.log('⚠️ All models failed, using fallback');
      return getFallbackExplanation(ingredientsText, analysisResult);
    }
    
  } catch (error) {
    console.error('❌ Groq Error:', error.message);
    return getFallbackExplanation(ingredientsText, analysisResult);
  }
};

// ============================================================
// PRODUCT TYPE DETECTION & SAME-CATEGORY ALTERNATIVES
// (All your existing fallback functions remain the same)
// ============================================================

function getAlternativeFromProductType(ingredientsText, harmfulIngredients, score) {
  const text = ingredientsText.toLowerCase();
  const alternatives = [];
  
  // BISCUIT / COOKIE
  if (text.includes('biscuit') || text.includes('cookie') || text.includes('oreo') || 
      text.includes('parle') || text.includes('digestive') || text.includes('glucose') ||
      text.includes('marie') || text.includes('good day') || text.includes('nutrichoice')) {
    alternatives.push({
      name: "McVitie's Digestive Biscuits",
      description: "Whole wheat, more fiber, less sugar than cream biscuits",
      link: "https://www.amazon.in/s?k=McVitie%27s+Digestive+Biscuits"
    });
    alternatives.push({
      name: "Britannia NutriChoice Digestive",
      description: "High fiber, multigrain, lower sugar content",
      link: "https://www.amazon.in/s?k=NutriChoice+Digestive+Biscuits"
    });
    return alternatives;
  }
  
  // CHIPS / CRISPS
  else if (text.includes('chip') || text.includes('crisp') || text.includes('lays') || 
           text.includes('potato') || text.includes('namkeen') || text.includes('bhujia')) {
    alternatives.push({
      name: "Baked Lay's Chips",
      description: "75% less fat than regular potato chips, baked not fried",
      link: "https://www.amazon.in/s?k=Baked+Lays+Chips"
    });
    alternatives.push({
      name: "Too Yumm! Baked Chips",
      description: "Baked not fried, multigrain, less oil",
      link: "https://www.amazon.in/s?k=Too+Yumm+Baked+Chips"
    });
    return alternatives;
  }
  
  // CHOCOLATE
  else if (text.includes('chocolate') || text.includes('cocoa') || text.includes('cacao')) {
    alternatives.push({
      name: "Lindt Excellence 70% Dark Chocolate",
      description: "Less sugar, more antioxidants, same chocolate taste",
      link: "https://www.amazon.in/s?k=Lindt+70+Dark+Chocolate"
    });
    alternatives.push({
      name: "Amul Dark Chocolate 55%",
      description: "Indian brand with less sugar and no palm oil",
      link: "https://www.amazon.in/s?k=Amul+Dark+Chocolate"
    });
    return alternatives;
  }
  
  // BREAD
  else if (text.includes('bread') || text.includes('bun') || text.includes('pav') || text.includes('toast')) {
    alternatives.push({
      name: "Whole Wheat Brown Bread",
      description: "More fiber than white bread, same bread",
      link: "https://www.amazon.in/s?k=Whole+Wheat+Bread"
    });
    alternatives.push({
      name: "Multigrain Bread",
      description: "Rich in protein and fiber, healthier than white bread",
      link: "https://www.amazon.in/s?k=Multigrain+Bread"
    });
    return alternatives;
  }
  
  // NOODLES / MAGGI
  else if (text.includes('noodle') || text.includes('maggi') || text.includes('pasta')) {
    alternatives.push({
      name: "Whole Wheat Pasta",
      description: "More fiber, lower glycemic index than white pasta",
      link: "https://www.amazon.in/s?k=Whole+Wheat+Pasta"
    });
    alternatives.push({
      name: "Oats Noodles",
      description: "Oat based, high fiber, lower fat than instant noodles",
      link: "https://www.amazon.in/s?k=Oats+Noodles"
    });
    return alternatives;
  }
  
  // CEREAL / OATS
  else if (text.includes('cereal') || text.includes('cornflakes') || text.includes('oat') || text.includes('muesli')) {
    alternatives.push({
      name: "Kellogg's Oats",
      description: "High fiber, low sugar, heart healthy",
      link: "https://www.amazon.in/s?k=Kellogg+Oats"
    });
    alternatives.push({
      name: "Muesli with Nuts & Seeds",
      description: "Whole grains, nuts, seeds - natural energy, less sugar",
      link: "https://www.amazon.in/s?k=Muesli+Nuts+Seeds"
    });
    return alternatives;
  }
  
  // JUICE / SODA
  else if (text.includes('juice') || text.includes('soda') || text.includes('coke') || text.includes('pepsi')) {
    alternatives.push({
      name: "Raw Pressery Cold Pressed Juice",
      description: "No added sugar, real fruit juice, no preservatives",
      link: "https://www.amazon.in/s?k=Raw+Pressery+Juice"
    });
    alternatives.push({
      name: "Fresh Coconut Water",
      description: "Natural hydration, no sugar, electrolytes",
      link: "https://www.amazon.in/s?k=Fresh+Coconut+Water"
    });
    return alternatives;
  }
  
  // DEFAULT
  else {
    alternatives.push({
      name: "Roasted Makhana (Fox Nuts)",
      description: "Low calorie, high protein, natural crunchy snack",
      link: "https://www.amazon.in/s?k=Roasted+Makhana"
    });
    alternatives.push({
      name: "Mixed Nuts & Seeds",
      description: "Healthy fats, protein, natural energy",
      link: "https://www.amazon.in/s?k=Mixed+Nuts+Seeds"
    });
    return alternatives;
  }
}

function getHarmfulDetails(harmfulIngredients) {
  const details = [];
  if (harmfulIngredients && harmfulIngredients.includes('high sugar')) {
    details.push('High sugar can spike your blood sugar levels. Too much sugar also adds empty calories that can cause weight gain over time.');
  }
  if (harmfulIngredients && harmfulIngredients.includes('high sodium')) {
    details.push('High sodium is not good for your blood pressure. It can make your heart work harder than it needs to.');
  }
  if (harmfulIngredients && harmfulIngredients.includes('palm oil')) {
    details.push('Palm oil contains saturated fats which can increase your bad cholesterol levels. This is not good for your heart health.');
  }
  if (harmfulIngredients && harmfulIngredients.includes('artificial colors')) {
    details.push('Artificial colors have no nutritional value. They are added only to make food look more appealing.');
  }
  if (details.length === 0 && harmfulIngredients && harmfulIngredients.length > 0) {
    let ingredientList = harmfulIngredients.join(', ');
    details.push(ingredientList + ' - These ingredients are not good for your health. Try to limit foods containing them.');
  }
  return details;
}

function getGoodDetails(goodIngredients) {
  const details = [];
  if (goodIngredients && goodIngredients.includes('fiber')) {
    details.push('Fiber is great for your digestion. It helps you feel full longer and supports heart health.');
  }
  if (goodIngredients && goodIngredients.includes('protein')) {
    details.push('Protein is essential for building and repairing muscles. It also helps you feel satisfied after eating.');
  }
  if (goodIngredients && goodIngredients.includes('whole grains')) {
    details.push('Whole grains provide sustained energy throughout the day. They are good for your heart and digestion.');
  }
  if (goodIngredients && goodIngredients.includes('natural ingredients')) {
    details.push('Natural ingredients mean fewer artificial additives. This is generally better for your overall health.');
  }
  if (details.length === 0 && goodIngredients && goodIngredients.length > 0) {
    let ingredientList = goodIngredients.join(', ');
    details.push(ingredientList + ' - These ingredients are beneficial for your health.');
  }
  return details;
}

function getFallbackSummary(analysisResult) {
  const score = analysisResult.score;
  const harmful = analysisResult.harmfulIngredients || [];
  
  if (score >= 7) {
    return 'Good news! This product is actually good for your health. It scores ' + score + ' out of 10. The ingredients are mostly natural and beneficial. You can feel good about including this in your diet.';
  } else if (score >= 4) {
    let harmfulText = '';
    if (harmful.length > 0) {
      harmfulText = ' The main concern is ' + harmful.join(', ') + '.';
    } else {
      harmfulText = ' It does not have much nutrition.';
    }
    return 'Let me be honest - this product is okay but not great. It scores ' + score + ' out of 10.' + harmfulText + ' My advice is to have this only once in a while.';
  } else {
    let harmfulText = '';
    if (harmful.length > 0) {
      harmfulText = ' The main problem is ' + harmful.join(', ') + '.';
    } else {
      harmfulText = ' The ingredients are not healthy.';
    }
    return 'Here is the truth - this product is not good for your health. It only scores ' + score + ' out of 10.' + harmfulText + ' I would recommend limiting this product.';
  }
}

const getFallbackExplanation = (ingredientsText, analysisResult) => {
  const alternatives = getAlternativeFromProductType(ingredientsText, analysisResult.harmfulIngredients || [], analysisResult.score);
  
  return {
    summary: getFallbackSummary(analysisResult),
    harmfulDetails: getHarmfulDetails(analysisResult.harmfulIngredients || []),
    goodDetails: getGoodDetails(analysisResult.goodIngredients || []),
    alternatives: alternatives
  };
};

module.exports = { getGroqExplanation };