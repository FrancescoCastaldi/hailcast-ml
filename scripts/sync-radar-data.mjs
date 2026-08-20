import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Punti di campionamento radar & convettivi per le macro-regioni italiane
const REGIONAL_OBSERVATORIES = [
  { region: 'Nord-Est & Garda (Veneto / Trentino / FVG)', lat: 45.438, lng: 10.991, code: 'NE_GARDA' },
  { region: 'Nord-Ovest & Prealpi (Lombardia / Piemonte)', lat: 45.464, lng: 9.189, code: 'NO_LOMB_PIEM' },
  { region: 'Pianura Emiliana & Appennino', lat: 44.494, lng: 11.342, code: 'EMILIA_ROM' },
  { region: 'Centro Italia & Tirreno (Toscana / Umbria / Lazio)', lat: 43.769, lng: 11.255, code: 'CENTRO_TIRR' },
  { region: 'Sud Italia & Basso Adriatico (Puglia / Campania)', lat: 41.117, lng: 16.871, code: 'SUD_ADR' }
];

async function syncRadarData() {
  console.log('📡 [GitHub Action] Inizio aggiornamento continuo dei database radar, grandine, perturbazioni e vento...');

  try {
    // 1. Fetch RainViewer national radar mosaic metadata
    const rvRes = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if (!rvRes.ok) throw new Error(`RainViewer HTTP ${rvRes.status}`);
    const rvData = await rvRes.json();

    console.log(`✅ RainViewer: ${rvData.radar?.past?.length || 0} frame passati, ${rvData.radar?.nowcast?.length || 0} nowcast.`);

    // 2. Fetch Multi-region Open-Meteo convective & wind parameters
    const regionalData = [];

    for (const obs of REGIONAL_OBSERVATORIES) {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${obs.lat}&longitude=${obs.lng}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,weather_code,cape,lifted_index&hourly=cape,lifted_index,freezing_level_height,precipitation_probability&forecast_days=1`;
        const res = await fetch(url);
        if (res.ok) {
          const d = await res.json();
          regionalData.push({
            code: obs.code,
            region: obs.region,
            coords: { lat: obs.lat, lng: obs.lng },
            current: {
              temperature: d.current?.temperature_2m ?? 22,
              humidity: d.current?.relative_humidity_2m ?? 65,
              pressure: d.current?.surface_pressure ?? 1013,
              windSpeedKmh: d.current?.wind_speed_10m ?? 12,
              windGustsKmh: d.current?.wind_gusts_10m ?? 25,
              windDirectionDeg: d.current?.wind_direction_10m ?? 80,
              precipitationMm: d.current?.precipitation ?? 0,
              weatherCode: d.current?.weather_code ?? 0,
              cape: d.current?.cape ?? 1200,
              liftedIndex: d.current?.lifted_index ?? -4.0
            }
          });
          console.log(`✅ [${obs.code}] ${obs.region}: CAPE = ${d.current?.cape || 0} J/kg, Vento = ${d.current?.wind_speed_10m || 0} km/h (Raffiche: ${d.current?.wind_gusts_10m || 0} km/h)`);
        }
      } catch (err) {
        console.warn(`⚠️ Errore campionamento per ${obs.region}:`, err);
      }
    }

    const snapshot = {
      updatedAt: new Date().toISOString(),
      generatedTimestamp: rvData.generated,
      host: rvData.host,
      radar: {
        past: rvData.radar?.past || [],
        nowcast: rvData.radar?.nowcast || []
      },
      regionalObservatories: regionalData,
      convectiveIndices: regionalData[0]?.current || {
        cape: 1800,
        liftedIndex: -5.5,
        temperature: 24,
        humidity: 70,
        windSpeed: 15,
        windDirection: 80
      }
    };

    const outDir = path.join(__dirname, '..', 'public', 'data');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const outPath = path.join(outDir, 'live-radar-feed.json');
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
    console.log(`🎉 Database radar, perturbazioni e vento aggiornato con successo in: ${outPath}`);

  } catch (error) {
    console.error('❌ Errore durante la sincronizzazione database radar:', error);
    process.exit(1);
  }
}

syncRadarData();
