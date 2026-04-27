require('dotenv').config()

async function listModels() {
  const response = await fetch('https://api.groq.com/openai/v1/models', {
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    }
  })
  const data = await response.json()
  data.data.forEach(m => console.log(m.id))
}

listModels().catch(console.error)