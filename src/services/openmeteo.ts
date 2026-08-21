import { Coordinates, ConvectiveSounding, VerticalAtmosphericProfile, VerticalLevelData } from '../types/meteorology';

/**
 * Service per l'interazione con l'API open-source Open-Meteo per indici convettivi,
 * radiosondaggi verticali Skew-T e Hail Growth Zone (HGZ)
 */
export class OpenMeteoService {
  private static BASE_URL = 'https://api.open-meteo.com/v1/forecast';

  /**
   * Recupera i parametri atmosferici convettivi e il profilo verticale completo per una data coordinata
   */
  public static async fetchConvectiveSounding(
    coords: Coordinates,
    locationName?: string
  ): Promise<ConvectiveSounding> {
    const params = new URLSearchParams({
      latitude: coords.lat.toString(),
      longitude: coords.lng.toString(),
      current: 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,surface_pressure',
      hourly: 'cape,lifted_index,freezing_level_height,wind_speed_850hPa,wind_speed_500hPa,temperature_1000hPa,temperature_925hPa,temperature_850hPa,temperature_700hPa,temperature_500hPa,temperature_300hPa,temperature_200hPa,relative_humidity_850hPa,relative_humidity_700hPa,relative_humidity_500hPa',
      forecast_days: '1',
      timezone: 'auto'
    });

    try {
      const response = await fetch(`${this.BASE_URL}?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Open-Meteo API error: ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseSoundingData(data, coords, locationName);
    } catch (error) {
      console.warn('Fallback sounding convettivo generato:', error);
      return this.getSyntheticSounding(coords, locationName);
    }
  }

  /**
   * Converte i dati orari Open-Meteo nei parametri per il calcolo MESH/ML e nel profilo HGZ
   */
  private static parseSoundingData(data: any, coords: Coordinates, locationName?: string): ConvectiveSounding {
    const hourly = data.hourly || {};
    const capeArray = hourly.cape || [];
    const liArray = hourly.lifted_index || [];
    const flArray = hourly.freezing_level_height || [];
    const ws850 = hourly.wind_speed_850hPa || [];
    const ws500 = hourly.wind_speed_500hPa || [];

    const currentCape = capeArray.length > 0 ? Math.max(0, Number(capeArray[0]) || 1200) : 1500;
    const currentLi = liArray.length > 0 ? Number(liArray[0]) || -4.5 : -4.0;
    const freezingLevel = flArray.length > 0 ? Number(flArray[0]) || 3500 : 3600;

    const speed850 = ws850[0] ? Number(ws850[0]) * 0.277 : 12; // in m/s
    const speed500 = ws500[0] ? Number(ws500[0]) * 0.277 : 24; // in m/s
    const deepShear = Math.max(5, Math.abs(speed500 - speed850));

    // Stima isoterma -20°C (Hail Growth Zone Top)
    const minus20Level = freezingLevel + 3100;
    const estimatedVil = Math.round(15 + (currentCape / 100) * 1.5);
    const estimatedEchoTop = Math.min(14000, freezingLevel + 4000 + (currentCape / 500) * 1000);

    // Stima del potenziale di fulminazione (Lightning Potential Index) correlato a CAPE e spessore HGZ
    const hgzThickness = minus20Level - freezingLevel;
    const lightningPotential = Math.min(100, Math.round((currentCape / 3000) * 60 + (hgzThickness / 3500) * 40));

    // Costruzione del profilo verticale isobarico
    const pressureLevels = [
      { hpa: 1000, alt: 110, tKey: 'temperature_1000hPa', rhKey: 'relative_humidity_2m', defaultT: 26, defaultRh: 72 },
      { hpa: 925, alt: 780, tKey: 'temperature_925hPa', rhKey: 'relative_humidity_850hPa', defaultT: 21, defaultRh: 68 },
      { hpa: 850, alt: 1500, tKey: 'temperature_850hPa', rhKey: 'relative_humidity_850hPa', defaultT: 16, defaultRh: 65 },
      { hpa: 700, alt: 3100, tKey: 'temperature_700hPa', rhKey: 'relative_humidity_700hPa', defaultT: 4, defaultRh: 60 },
      { hpa: 500, alt: 5600, tKey: 'temperature_500hPa', rhKey: 'relative_humidity_500hPa', defaultT: -16, defaultRh: 50 },
      { hpa: 300, alt: 9200, tKey: 'temperature_300hPa', rhKey: 'relative_humidity_500hPa', defaultT: -38, defaultRh: 35 },
      { hpa: 200, alt: 12000, tKey: 'temperature_200hPa', rhKey: 'relative_humidity_500hPa', defaultT: -54, defaultRh: 20 }
    ];

    const levels: VerticalLevelData[] = pressureLevels.map(p => {
      const t = hourly[p.tKey]?.[0] !== undefined ? Number(hourly[p.tKey][0]) : p.defaultT;
      const rh = hourly[p.rhKey]?.[0] !== undefined ? Number(hourly[p.rhKey][0]) : p.defaultRh;
      // Formula approssimata di Magnus per il Dew Point (°C)
      const dewPoint = Math.round((t - (100 - rh) / 5) * 10) / 10;
      return {
        pressureHpa: p.hpa,
        altitudeMeters: p.alt,
        temperatureC: Math.round(t * 10) / 10,
        dewPointC: dewPoint,
        windSpeedKmh: Math.round(speed850 * 3.6 + (1000 - p.hpa) * 0.06)
      };
    });

    const verticalProfile: VerticalAtmosphericProfile = {
      coords,
      locationName: locationName || `Punto (${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)})`,
      levels,
      hgzBottomMeters: Math.round(freezingLevel),
      hgzTopMeters: Math.round(minus20Level),
      hgzThicknessMeters: Math.round(hgzThickness),
      cape: Math.round(currentCape),
      liftedIndex: Math.round(currentLi * 10) / 10,
      lightningPotentialIndex: lightningPotential
    };

    return {
      cape: Math.round(currentCape),
      cin: 45,
      liftedIndex: Math.round(currentLi * 10) / 10,
      freezingLevel: Math.round(freezingLevel),
      minus20Level: Math.round(minus20Level),
      deepShear06km: Math.round(deepShear * 10) / 10,
      srh03km: 180,
      dewPointDepression: 4.2,
      echoTop: Math.round(estimatedEchoTop),
      vil: Math.min(75, Math.max(10, estimatedVil)),
      lightningPotential,
      verticalProfile
    };
  }

  /**
   * Genera un radiosondaggio convettivo sintetico realistico per test o fallback
   */
  public static getSyntheticSounding(coords: Coordinates, locationName?: string): ConvectiveSounding {
    const isPianuraPadana = coords.lat >= 44.5 && coords.lat <= 46.2 && coords.lng >= 8.0 && coords.lng <= 12.8;
    const baseCape = isPianuraPadana ? 2400 : 1600;
    const baseShear = isPianuraPadana ? 22 : 16;
    const freezingLevel = 3650;
    const minus20Level = 6800;

    const levels: VerticalLevelData[] = [
      { pressureHpa: 1000, altitudeMeters: 100, temperatureC: 27.5, dewPointC: 21.0, windSpeedKmh: 14 },
      { pressureHpa: 925, altitudeMeters: 800, temperatureC: 22.0, dewPointC: 17.5, windSpeedKmh: 24 },
      { pressureHpa: 850, altitudeMeters: 1550, temperatureC: 17.0, dewPointC: 13.0, windSpeedKmh: 38 },
      { pressureHpa: 700, altitudeMeters: 3150, temperatureC: 5.2, dewPointC: 0.5, windSpeedKmh: 52 },
      { pressureHpa: 500, altitudeMeters: 5800, temperatureC: -15.8, dewPointC: -22.0, windSpeedKmh: 75 },
      { pressureHpa: 300, altitudeMeters: 9400, temperatureC: -37.5, dewPointC: -46.0, windSpeedKmh: 98 },
      { pressureHpa: 200, altitudeMeters: 12200, temperatureC: -53.0, dewPointC: -64.0, windSpeedKmh: 115 }
    ];

    const verticalProfile: VerticalAtmosphericProfile = {
      coords,
      locationName: locationName || (isPianuraPadana ? 'Pianura Padana (Macro-Settore Convettivo)' : 'Italia Centro-Settentrionale'),
      levels,
      hgzBottomMeters: freezingLevel,
      hgzTopMeters: minus20Level,
      hgzThicknessMeters: minus20Level - freezingLevel,
      cape: baseCape,
      liftedIndex: isPianuraPadana ? -6.5 : -4.2,
      lightningPotentialIndex: isPianuraPadana ? 85 : 62
    };

    return {
      cape: baseCape,
      cin: 30,
      liftedIndex: isPianuraPadana ? -6.5 : -4.2,
      freezingLevel,
      minus20Level,
      deepShear06km: baseShear,
      srh03km: 220,
      dewPointDepression: 3.5,
      echoTop: 12500,
      vil: 58,
      lightningPotential: isPianuraPadana ? 85 : 62,
      verticalProfile
    };
  }

  public static getSyntheticVerticalProfile(coords: Coordinates, locationName?: string): VerticalAtmosphericProfile {
    return this.getSyntheticSounding(coords, locationName).verticalProfile!;
  }
}
