// index.js - Railway API para Outfit Generator
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// GET endpoint - test
app.get('/api/claude', (req, res) => {
  res.json({
    message: '✅ API Railway funcionando perfectamente',
    timestamp: new Date().toISOString(),
    status: 'ok',
    platform: 'railway'
  });
});

// POST endpoint - generar outfit
app.post('/api/claude', async (req, res) => {
  try {
    const { wardrobe, weather, occasion, dayName } = req.body;

    // Validaciones
    if (!wardrobe || wardrobe.length < 3) {
      return res.status(400).json({ 
        error: 'Se requieren al menos 3 prendas',
        received: wardrobe?.length || 0
      });
    }

    // API Key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'API key no configurada',
        hint: 'Configura ANTHROPIC_API_KEY en variables de entorno'
      });
    }

    console.log('🚀 Generando outfit...');

    // Prompt para Claude
    const prompt = `Eres un estilista profesional. Selecciona 3 prendas para un outfit ${occasion} para ${dayName || 'hoy'}.

PRENDAS DISPONIBLES:
${wardrobe.slice(0, 8).map(item => `${item.id}: ${item.tipo} - ${item.nombre} (${item.color})`).join('\n')}

Responde SOLO este JSON sin texto adicional:
{
  "outfit": {
    "top": {"id": "ID_de_prenda", "razon": "breve razón"},
    "bottom": {"id": "ID_de_prenda", "razon": "breve razón"},
    "shoes": {"id": "ID_de_prenda", "razon": "breve razón"}
  },
  "descripcion": "descripción breve del look",
  "tips": ["consejo 1", "consejo 2"]
}`;

    // Llamada a Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 400,
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Claude API error:', errorText);
      return res.status(500).json({
        error: 'Error en Claude API',
        status: response.status,
        details: errorText.substring(0, 200)
      });
    }

    const data = await response.json();
    const outfitText = data.content?.[0]?.text;

    if (!outfitText) {
      return res.status(500).json({ error: 'Respuesta vacía de Claude' });
    }

    // Parse JSON
    let cleanedText = outfitText.trim();
    cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    const jsonStart = cleanedText.indexOf('{');
    const jsonEnd = cleanedText.lastIndexOf('}') + 1;
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      cleanedText = cleanedText.substring(jsonStart, jsonEnd);
    }

    let outfitData;
    try {
      outfitData = JSON.parse(cleanedText);
    } catch (parseError) {
      // Fallback automático
      const tops = wardrobe.filter(item => item.tipo === 'top');
      const bottoms = wardrobe.filter(item => item.tipo === 'bottom');
      const shoes = wardrobe.filter(item => item.tipo === 'shoes');
      
      outfitData = {
        outfit: {
          top: { id: tops[0]?.id || wardrobe[0]?.id, razon: `Perfecto para ${occasion}` },
          bottom: { id: bottoms[0]?.id || wardrobe[1]?.id, razon: "Combina perfectamente" },
          shoes: { id: shoes[0]?.id || wardrobe[2]?.id, razon: "Completa el look" }
        },
        descripcion: `Look ${occasion} perfecto para ${dayName || 'hoy'}`,
        tips: ["Outfit generado automáticamente", "Colores coordinados"]
      };
    }

    // Enriquecer con datos del armario
    const result = {
      ...outfitData,
      outfit: {
        top: { ...outfitData.outfit.top, ...wardrobe.find(item => item.id === outfitData.outfit.top.id) },
        bottom: { ...outfitData.outfit.bottom, ...wardrobe.find(item => item.id === outfitData.outfit.bottom.id) },
        shoes: { ...outfitData.outfit.shoes, ...wardrobe.find(item => item.id === outfitData.outfit.shoes.id) }
      },
      success: true,
      generatedAt: new Date().toISOString(),
      day: dayName,
      weather: weather,
      source: 'railway-express'
    };

    console.log('✅ Outfit generado exitosamente');
    res.json(result);

  } catch (error) {
    console.error('💥 Error:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'Outfit API Railway',
    status: 'running',
    endpoints: ['/api/claude']
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;