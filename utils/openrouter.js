const fetch = require('node-fetch');

const isDemoMode = !process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'demo_mode';

// Fallback quotes for demo mode
const demoQuotes = [
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { quote: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { quote: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
  { quote: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
  { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { quote: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { quote: "What you get by achieving your goals is not as important as what you become by achieving your goals.", author: "Zig Ziglar" },
  { quote: "Happiness is not something ready-made. It comes from your own actions.", author: "Dalai Lama" },
  { quote: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { quote: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs" },
  { quote: "The mind is everything. What you think you become.", author: "Buddha" },
  { quote: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
  { quote: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { quote: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt" }
];

/**
 * Fetch a motivational quote from OpenRouter AI
 */
async function getAIQuote() {
  if (isDemoMode) {
    const randomQuote = demoQuotes[Math.floor(Math.random() * demoQuotes.length)];
    console.log('🤖 [DEMO MODE] Returning demo quote');
    return randomQuote;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://zenquota.ai',
        'X-Title': 'ZenQuota AI'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3-8b-instruct:free',
        messages: [
          {
            role: 'system',
            content: 'You are a motivational quote generator. When asked, provide a single unique motivational or inspirational quote. Respond ONLY in this exact JSON format: {"quote": "the quote text", "author": "author name"}. If you create an original quote, use "ZenQuota AI" as the author. Do not include any other text, explanation, or markdown.'
          },
          {
            role: 'user',
            content: 'Give me a unique motivational quote that inspires positivity and personal growth.'
          }
        ],
        max_tokens: 150,
        temperature: 0.9
      })
    });

    if (!response.ok) {
      console.error('OpenRouter API error:', response.status, response.statusText);
      // Fallback to demo quote on API error
      return demoQuotes[Math.floor(Math.random() * demoQuotes.length)];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return demoQuotes[Math.floor(Math.random() * demoQuotes.length)];
    }

    try {
      // Try to parse the JSON response
      const parsed = JSON.parse(content);
      if (parsed.quote && parsed.author) {
        return parsed;
      }
    } catch (parseErr) {
      // If JSON parsing fails, try to extract quote from text
      console.log('Failed to parse AI response as JSON, using fallback');
    }

    return demoQuotes[Math.floor(Math.random() * demoQuotes.length)];
  } catch (error) {
    console.error('OpenRouter fetch error:', error.message);
    return demoQuotes[Math.floor(Math.random() * demoQuotes.length)];
  }
}

module.exports = { getAIQuote };
