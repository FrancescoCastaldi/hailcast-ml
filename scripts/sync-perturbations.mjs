import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Same observatories as radar for consistency
const REGIONAL_OBSERVATORIES = [
  { region: 'Nord-Est & Garda (Veneto / Trentino / FVG)', lat: 45.438, lng: 10.991, code: 'NE_GARDA', corridor: 'Garda-Valpolicella' },
  { region: 'Nord-Ovest & Prealpi (Lombardia / Piemonte)', lat: 45.464, lng: 9.189, code: 'NO_LOMB_PIEM', corridor: 'Prealpi-Orobiche' },
  { region: 'Pianura Emiliana & Appennino', lat: 44.494, lng: 11.342, code: 'EMILIA_ROM', corridor: 'Modenese-Romagna' },
  { region: 'Pedemontana Veneta & Bassa Friulana', lat: 45.850, lng: 12.350, code: 'VENETO_FRIULI', corridor: 'Piave-Tagliamento' },
  { region: 'Centro Italia & Tirreno (Toscana / Umbria / Lazio)', lat: 43.769, lng: 11.255, code: 'CENTRO_TIRR', corridor: 'Valdarno-Chiana' },
  { region: 'Sud Italia & Basso Adriatico (Puglia / Campania)', lat: 41.117, lng: 16.871, code: 'SUD_ADR', corridor: 'Murge-Ofanto' }
];

function destinationPoint(start, distanceKm, bearingDeg) {
  const R = 6371;
  const d = distanceKm / R;
  const t = bearingDeg * (Math.PI / 180);
  const p1 = start.lat * (Math.PI / 180);
  const l1 = start.lng * (Math.PI / 180);

  const sinp2 = Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t);
  const p2 = Math.asin(sinp2);
  const y = Math.sin(t) * Math.sin(d) * Math.cos(p1);
  const x = Math.cos(d) - Math.sin(p1) * Math.sin(p2);
  const l2 = l1 + Math.atan2(y, x);

  return {
    lat: p2 * (180 / Math.PI),
    lng: ((l2 * (180 / Math.PI) + 540) % 360) - 180
  };
}

function generateCellPolygon(centroid, radiusKm, directionDeg) {
  const polygon = [];
  const pointsCount = 12;
  for (let i = 0; i < pointsCount; i++) {
    const angle = (i * 360) / pointsCount;
    // For rain, polygons can be wider and more circular/elliptical
    const isAligned = Math.abs(Math.sin((angle - directionDeg) * (Math.PI / 180)));
    const dist = radiusKm * (0.9 + 0.3 * (1 - isAligned));
    polygon.push(destinationPoint(centroid, dist, angle));
  }
  polygon.push(polygon[0]);
  return polygon;
}

function generateNowcastCones(centroid, speedKmh, directionDeg) {
  const intervals = [30, 60, 90, 120]; // Perturbations usually tracked over longer intervals
  const cones = [];

  for (const mins of intervals) {
    const travelDistKm = (speedKmh * mins) / 60;
    const projectedCentroid = destinationPoint(centroid, travelDistKm, directionDeg);
    const uncertaintyRadiusKm = 10 + (travelDistKm * 0.25);
    const leftPoint = destinationPoint(projectedCentroid, uncertaintyRadiusKm, (directionDeg - 90 + 360) % 360);
    const rightPoint = destinationPoint(projectedCentroid, uncertaintyRadiusKm, (directionDeg + 90) % 360);
    const frontPoint = destinationPoint(projectedCentroid, uncertaintyRadiusKm * 0.5, directionDeg);

    cones.push({
      minutesAhead: mins,
      projectedCentroid,
      uncertaintyRadiusKm: Math.round(uncertaintyRadiusKm * 10) / 10,
      polygon: [centroid, leftPoint, frontPoint, rightPoint, centroid]
    });
  }
  return cones;
}

async function syncPerturbations() {
  console.log('🌧️ [GitHub Action] Inizio aggiornamento continuo dei database perturbazioni...');

  const nowEpoch = Date.now();
  const nowDate = new Date(nowEpoch);
  const regionalData = [];

  for (const obs of REGIONAL_OBSERVATORIES) {
    try {
      // Fetch 3 days forecast to cover perturbations
      const url = \`https://api.open-meteo.com/v1/forecast?latitude=\${obs.lat}&longitude=\${obs.lng}&current=precipitation,rain,showers,weather_code,wind_speed_10m,wind_direction_10m&hourly=precipitation,rain,showers,weather_code,wind_speed_10m,wind_direction_10m,precipitation_probability&forecast_days=3\`;
      const res = await fetch(url);
      if (res.ok) {
        const d = await res.json();
        regionalData.push({
          code: obs.code,
          region: obs.region,
          corridor: obs.corridor,
          coords: { lat: obs.lat, lng: obs.lng },
          current: {
            precipitation: d.current?.precipitation ?? 0,
            rain: d.current?.rain ?? 0,
            showers: d.current?.showers ?? 0,
            weatherCode: d.current?.weather_code ?? 0,
            windSpeedKmh: d.current?.wind_speed_10m ?? 10,
            windDirectionDeg: d.current?.wind_direction_10m ?? 90
          },
          hourly: d.hourly
        });
        console.log(\`✅ [Perturbazioni] [\${obs.code}]: Precipitazione = \${d.current?.precipitation || 0} mm, WeatherCode = \${d.current?.weather_code || 0}\`);
      }
    } catch (err) {
      console.warn(\`⚠️ Errore campionamento perturbazioni per \${obs.region}:\`, err);
    }
  }

  const detectedPerturbations = [];
  const activeCandidates = regionalData.length >= 3 ? regionalData.slice(0, 3) : regionalData;

  const hourSlot = Math.floor(nowEpoch / (1000 * 60 * 30)); // changes every 30 min

  activeCandidates.forEach((cand, idx) => {
    // Generate synthetic perturbations based on forecast data if real precipitation is low
    // to always have something to show in the demo, but scale it by real probability
    const precipProb = cand.hourly?.precipitation_probability?.[0] || Math.max(10, (idx+1)*20);
    const rainMm = cand.current?.precipitation || (precipProb / 10);
    
    // Only generate a perturbation if there's significant probability or rain
    if (precipProb > 30 || rainMm > 1) {
      const speedKmh = Math.max(20, Math.min(50, Math.round((cand.current?.windSpeedKmh || 15) * 1.5)));
      const dirDeg = cand.current?.windDirectionDeg || (200 + (idx * 45));

      const lifespanMinutes = 180 + ((idx * 30) % 60); // 3-4 hours lifespan
      const ageMinutes = ((hourSlot * 30 + idx * 45) % lifespanMinutes);
      const createdAt = nowEpoch - ageMinutes * 60 * 1000;
      const expiresAt = createdAt + lifespanMinutes * 60 * 1000;

      const travelDistKm = (speedKmh * ageMinutes) / 60;
      const currentCentroid = destinationPoint(cand.coords, travelDistKm, dirDeg);
      // Rain polygons are larger than hail
      const radiusKm = 25 + (rainMm * 2) + (precipProb / 10);
      const polygon = generateCellPolygon(currentCentroid, radiusKm, dirDeg);
      const nowcastCones = generateNowcastCones(currentCentroid, speedKmh, dirDeg);

      const cellNames = [
        'Fronte Atlantico in ingresso',
        'Perturbazione Appenninica',
        'Vortice Ciclonico Tirrenico',
        'Sistema Frontale Esteso'
      ];

      let severity = 'minor';
      if (rainMm > 25) severity = 'destructive';
      else if (rainMm > 10) severity = 'severe';
      else if (rainMm > 4) severity = 'moderate';

      detectedPerturbations.push({
        id: \`pert-sync-\${cand.code.toLowerCase()}-\${hourSlot % 10}\`,
        name: cellNames[idx] || \`Area Perturbata \${cand.corridor}\`,
        centroid: currentCentroid,
        precipitationMm: Math.round(rainMm * 10) / 10,
        polygon,
        velocity: {
          speedKmh,
          directionDeg: dirDeg,
          vx: Math.round(speedKmh * Math.sin(dirDeg * Math.PI / 180)),
          vy: Math.round(speedKmh * Math.cos(dirDeg * Math.PI / 180))
        },
        probability: precipProb,
        severity,
        nowcastCones,
        createdAt,
        ageMinutes: Math.round(ageMinutes),
        lifespanMinutes,
        expiresAt
      });
    }
  });

  const snapshot = {
    updatedAt: nowDate.toISOString(),
    updatedEpoch: nowEpoch,
    detectedPerturbations,
    regionalForecasts: regionalData.map(d => ({
      code: d.code,
      region: d.region,
      currentPrecipitation: d.current.precipitation,
      currentWeatherCode: d.current.weatherCode
    }))
  };

  const outDir = path.join(__dirname, '..', 'public', 'data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'live-perturbations-feed.json');
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(\`🎉 Database perturbazioni (\${detectedPerturbations.length} attive) generato in: \${outPath}\`);
}

syncPerturbations().catch(err => {
  console.error('❌ Errore sync perturbazioni:', err);
  process.exit(1);
});
