// index.js - Railway API para Outfit Generator
const express = require('express');
const cors = require('cors');
const app = express();

// Configuración para Railway
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check - Railway necesita esto
app.get('/', (req, res) => {
  res.json({ 
    message: '🎯 Outfit API Railway',
    status: 'running',
    platform: 'railway',
    endpoints: {
      test: 'GET /api/claude',
      generate: 'POST /api/claude'
    },
    timestamp: new Date().toISOString()
  });
});

// GET endpoint - test conectividad
app.get('/api/claude', (req, res) => {
  res.json({
    message: '✅ API Railway funcionando perfectamente',
    timestamp: new Date().toISOString(),
    status: 'ok',
    platform: 'railway',
    port: PORT
  });
});

// POST endpoint - generar outfit
app.post('/api/claude', async (req, res) => {
  try {
    console.log('🚀 Iniciando generación de outfit...');
    
    const { wardrobe, weather, occasion, dayName } = req.body;

    // Validaciones
    if (!wardrobe || !Array.isArray(wardrobe) || wardrobe.length < 3) {
      return res.status(400).json({ 
        error: 'Se requieren al menos 3 prendas',
        received: wardrobe?.length || 0,
        timestamp: new Date().toISOString()
      });
    }

    // API Key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('❌ API key no encontrada');
      return res.status(500).json({ 
        error: 'API key no configurada',
        hint: 'Configura ANTHROPIC_API_KEY en variables de entorno de Railway',
        timestamp: new Date().toISOString()
      });
    }

    console.log('✅ API key encontrada, generando prompt...');

    // Prompt optimizado para Claude
    const prompt = `Eres un estilista profesional. Selecciona 3 prendas para un outfit ${occasion} para ${dayName || 'hoy'}.

PRENDAS DISPONIBLES:
${wardrobe.slice(0, 8).map(item => `${item.id}: ${item.tipo} - ${item.nombre} (${item.color})`).join('\n')}

CLIMA: ${weather?.temp || 22}°C, ${weather?.description || 'agradable'}

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

    console.log('🤖 Llamando a Claude API...');

    // Llamada a Claude API con timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

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
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Claude API error:', response.status, errorText);
      return res.status(500).json({
        error: 'Error en Claude API',
        status: response.status,
        details: errorText.substring(0, 200),
        timestamp: new Date().toISOString()
      });
    }

    const data = await response.json();
    const outfitText = data.content?.[0]?.text;

    if (!outfitText) {
      console.error('❌ Respuesta vacía de Claude');
      return res.status(500).json({ 
        error: 'Respuesta vacía de Claude',
        timestamp: new Date().toISOString()
      });
    }

    console.log('✅ Claude respondió, parseando JSON...');

    // Limpiar y parsear JSON
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
      console.log('✅ JSON parseado correctamente');
    } catch (parseError) {
      console.log('⚠️ JSON parse failed, usando fallback automático...');
      // Fallback automático
      const tops = wardrobe.filter(item => item.tipo === 'top');
      const bottoms = wardrobe.filter(item => item.tipo === 'bottom');
      const shoes = wardrobe.filter(item => item.tipo === 'shoes');
      
      outfitData = {
        outfit: {
          top: { id: tops[0]?.id || wardrobe[0]?.id, razon: `Perfecto para ${occasion}` },
          bottom: { id: bottoms[0]?.id || wardrobe[1]?.id, razon: "Combina perfectamente" },
          shoes: { id: shoes[0]?.id || wardrobe[2]?.id, razon: "Completa el look ideal" }
        },
        descripcion: `Look ${occasion} perfecto para ${dayName || 'hoy'}`,
        tips: ["Outfit generado automáticamente", "Colores perfectamente coordinados"]
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
      source: 'railway-express',
      port: PORT
    };

    console.log('🎯 Outfit generado exitosamente');
    res.json(result);

  } catch (error) {
    console.error('💥 Error general:', error);
    
    if (error.name === 'AbortError') {
      return res.status(408).json({
        error: 'Timeout: Claude API tardó más de 25 segundos',
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Outfit API corriendo en puerto ${PORT}`);
  console.log(`🌍 Health check: http://localhost:${PORT}/`);
  console.log(`🎯 API endpoint: http://localhost:${PORT}/api/claude`);
});

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;
