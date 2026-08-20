import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function syncRadarData() {
  console.log('📡 [GitHub Action] Inizio sincronizzazione dati radar e convettivi...');

  try {
    // 1. Fetch RainViewer radar metadata
    const rvRes = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if (!rvRes.ok) throw new Error(`RainViewer HTTP ${rvRes.status}`);
    const rvData = await rvRes.json();

    console.log(`✅ RainViewer: ${rvData.radar?.past?.length || 0} frame passati, ${rvData.radar?.nowcast?.length || 0} nowcast.`);

    // 2. Fetch Open-Meteo convective parameters for Northern Italy Hotspot (Verona/Garda)
    const omRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=45.438&longitude=10.991&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cape,lifted_index&hourly=cape,lifted_index,freezing_level_height&forecast_days=1');
    let omData = null;
    if (omRes.ok) {
      omData = await omRes.json();
      console.log(`✅ Open-Meteo: CAPE attuale = ${omData.current?.cape || 0} J/kg, Lifted Index = ${omData.current?.lifted_index || 0}`);
    }

    const snapshot = {
      updatedAt: new Date().toISOString(),
      generatedTimestamp: rvData.generated,
      host: rvData.host,
      radar: {
        past: rvData.radar?.past || [],
        nowcast: rvData.radar?.nowcast || []
      },
      convectiveIndices: {
        cape: omData?.current?.cape || 1800,
        liftedIndex: omData?.current?.lifted_index || -5.5,
        temperature: omData?.current?.temperature_2m || 24,
        humidity: omData?.current?.relative_humidity_2m || 70,
        windSpeed: omData?.current?.wind_speed_10m || 15,
        windDirection: omData?.current?.wind_direction_10m || 80
      }
    };

    const outDir = path.join(__dirname, '..', 'public', 'data');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const outPath = path.join(outDir, 'live-radar-feed.json');
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
    console.log(`🎉 Dati salvati con successo in: ${outPath}`);

  } catch (error) {
    console.error('❌ Errore durante la sincronizzazione dati radar:', error);
    process.exit(1);
  }
}

syncRadarData();
