import { SpotterReport, StormCell } from '../types/meteorology';
import { StormTracker } from '../ml/storm-tracker';

export class SpotterFeedService {
  private static STORAGE_KEY = 'hailcast_spotter_reports_v3';
  private static REPORT_TTL_MS = 2.5 * 3600 * 1000; // TTL: 2.5 ore (dopo 2.5h la grandine si è sciolta e il report scade)
  private static reports: SpotterReport[] = [];

  private static initDefaultReports(): void {
    const now = Date.now();
    let validReports: SpotterReport[] = [];

    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as SpotterReport[];
        // Filtra via i report più vecchi di 2.5 ore per evitare grandine fantasma di 10h fa
        validReports = parsed.filter(r => {
          const ts = r.timestampMs || (r.expiresAt ? r.expiresAt - this.REPORT_TTL_MS : 0);
          return (now - ts) < this.REPORT_TTL_MS;
        });
      }
    } catch {
      validReports = [];
    }

    if (validReports.length > 0) {
      this.reports = validReports;
      this.saveToStorage();
      return;
    }

    // Se non ci sono report freschi o sono tutti scaduti, genera un set di default con orario reale recente
    const formatOffset = (minsAgo: number) => {
      return new Date(now - minsAgo * 60000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    };

    this.reports = [
      {
        id: `rep-${now - 12 * 60000}`,
        locationName: 'Castiglione delle Stiviere (MN)',
        coords: { lat: 45.3951, lng: 10.4908 },
        timestamp: formatOffset(12),
        timestampMs: now - 12 * 60000,
        expiresAt: now - 12 * 60000 + this.REPORT_TTL_MS,
        hailSizeCm: 4.8,
        phenomenon: 'hail',
        windSpeedKmh: 85,
        damageLevel: 'cars',
        notes: 'Grandine molto fitta con chicchi durissimi, parabrezza scheggiati e fogliame tranciato.'
      },
      {
        id: `rep-${now - 28 * 60000}`,
        locationName: 'Peschiera del Garda (VR)',
        coords: { lat: 45.4389, lng: 10.6933 },
        timestamp: formatOffset(28),
        timestampMs: now - 28 * 60000,
        expiresAt: now - 28 * 60000 + this.REPORT_TTL_MS,
        hailSizeCm: 3.5,
        phenomenon: 'downburst',
        windSpeedKmh: 95,
        damageLevel: 'leaves',
        notes: 'Raffica di downburst violenta (95 km/h) prima della grandinata, chicchi come noci.'
      },
      {
        id: `rep-${now - 55 * 60000}`,
        locationName: 'San Bonifacio (VR)',
        coords: { lat: 45.3992, lng: 11.2755 },
        timestamp: formatOffset(55),
        timestampMs: now - 55 * 60000,
        expiresAt: now - 55 * 60000 + this.REPORT_TTL_MS,
        hailSizeCm: 2.0,
        phenomenon: 'lightning',
        windSpeedKmh: 60,
        damageLevel: 'none',
        notes: 'Forte attività elettrica con rovescio temporalesco e grandine media per 10 minuti.'
      }
    ];

    this.saveToStorage();
  }

  private static saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.reports));
    } catch {
      // Ignore
    }
  }

  public static getReports(): SpotterReport[] {
    this.initDefaultReports();
    const now = Date.now();
    // Filtro attivo dinamico
    this.reports = this.reports.filter(r => {
      const ts = r.timestampMs || (r.expiresAt ? r.expiresAt - this.REPORT_TTL_MS : now);
      return (now - ts) < this.REPORT_TTL_MS;
    });
    return [...this.reports];
  }

  public static addReport(report: Omit<SpotterReport, 'id'>): SpotterReport {
    this.initDefaultReports();
    const now = Date.now();
    const newReport: SpotterReport = {
      ...report,
      id: `rep-${now}`,
      timestampMs: now,
      expiresAt: now + this.REPORT_TTL_MS,
      timestamp: new Date(now).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    };
    this.reports.unshift(newReport);
    this.saveToStorage();
    return newReport;
  }

  /**
   * Genera celle temporalesche simulate realistiche per il test del sistema
   */
  public static getSimulatedSupercells(): StormCell[] {
    const now = Date.now();
    // Cella 1: Supercella Padana Occidentale (Veronese/Mantovano) - In rapida intensificazione
    const cell1 = StormTracker.createStormCell(
      'cell-padana-01',
      'Supercella Gardesana (Cell #104)',
      { lat: 45.38, lng: 10.55 },
      64, // 64 dBZ (Nucleo violento)
      48, // 48 km/h
      78, // verso E-NE (78°)
      {
        cape: 2850,
        cin: 15,
        liftedIndex: -7.5,
        freezingLevel: 3600,
        minus20Level: 6800,
        deepShear06km: 26,
        srh03km: 260,
        dewPointDepression: 3.0,
        echoTop: 13800,
        vil: 68
      },
      14,
      false,
      'rapid_intensification',
      { createdAt: now - 22 * 60000, ageMinutes: 22, lifespanMinutes: 90, isDissipated: false }
    );

    // Cella 2: Cella Multicellulare Prealpina (Bresciano/Bergamasco) - Appena nata
    const cell2 = StormTracker.createStormCell(
      'cell-prealpi-02',
      'Multicella Sebino-Valcamonica (Cell #102)',
      { lat: 45.72, lng: 10.05 },
      56, // 56 dBZ
      36, // 36 km/h
      85, // verso E (85°)
      {
        cape: 1950,
        cin: 35,
        liftedIndex: -5.2,
        freezingLevel: 3500,
        minus20Level: 6600,
        deepShear06km: 19,
        srh03km: 180,
        dewPointDepression: 4.5,
        echoTop: 11500,
        vil: 46
      },
      11,
      true,
      'new_initiation',
      { createdAt: now - 8 * 60000, ageMinutes: 8, lifespanMinutes: 75, isDissipated: false }
    );

    // Cella 3: Temporale a V-Shaped / Rigenerante (Emilia Orientale / Modenese) - Matura
    const cell3 = StormTracker.createStormCell(
      'cell-emilia-03',
      'Mesociclone Panaro-Secchia (Cell #107)',
      { lat: 44.75, lng: 11.10 },
      61, // 61 dBZ
      42, // 42 km/h
      65, // verso E-NE (65°)
      {
        cape: 3100,
        cin: 20,
        liftedIndex: -8.0,
        freezingLevel: 3750,
        minus20Level: 6950,
        deepShear06km: 28,
        srh03km: 290,
        dewPointDepression: 2.8,
        echoTop: 14200,
        vil: 72
      },
      15,
      false,
      'established',
      { createdAt: now - 52 * 60000, ageMinutes: 52, lifespanMinutes: 95, isDissipated: false }
    );

    return [cell1, cell2, cell3];
  }
}
