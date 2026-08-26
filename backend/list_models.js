const dotenv = require('dotenv');
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

async function listModels() {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const json = await response.json();
  if (json.models) {
    console.log(json.models.map(m => m.name).join('\n'));
  } else {
    console.log(json);
  }
}

listModels();
