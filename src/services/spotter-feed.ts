import { SpotterReport, StormCell } from '../types/meteorology';
import { StormTracker } from '../ml/storm-tracker';

export class SpotterFeedService {
  private static reports: SpotterReport[] = [];

  private static initDefaultReports(): void {
    if (this.reports.length === 0) {
      const now = Date.now();
      const formatOffset = (minsAgo: number) => {
        return new Date(now - minsAgo * 60000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      };

      this.reports = [
        {
          id: 'rep-01',
          locationName: 'Castiglione delle Stiviere (MN)',
          coords: { lat: 45.3951, lng: 10.4908 },
          timestamp: formatOffset(12),
          hailSizeCm: 4.8,
          damageLevel: 'cars',
          notes: 'Grandine molto fitta con chicchi discoidali durissimi, parabrezza scheggiati e fogliame tranciato.'
        },
        {
          id: 'rep-02',
          locationName: 'Peschiera del Garda (VR)',
          coords: { lat: 45.4389, lng: 10.6933 },
          timestamp: formatOffset(24),
          hailSizeCm: 3.5,
          damageLevel: 'leaves',
          notes: 'Raffica di downburst violenta prima della grandinata, chicchi come noci.'
        },
        {
          id: 'rep-03',
          locationName: 'San Bonifacio (VR)',
          coords: { lat: 45.3992, lng: 11.2755 },
          timestamp: formatOffset(45),
          hailSizeCm: 2.0,
          damageLevel: 'none',
          notes: 'Forte rovescio temporalesco misto a grandine piccola/media per 10 minuti.'
        }
      ];
    }
  }

  public static getReports(): SpotterReport[] {
    this.initDefaultReports();
    return [...this.reports];
  }

  public static addReport(report: Omit<SpotterReport, 'id'>): SpotterReport {
    const newReport: SpotterReport = {
      ...report,
      id: `rep-${Date.now()}`
    };
    this.reports.unshift(newReport);
    return newReport;
  }

  /**
   * Genera celle temporalesche simulate realistiche per il test del sistema
   */
  public static getSimulatedSupercells(): StormCell[] {
    // Cella 1: Supercella Padana Occidentale (Veronese/Mantovano)
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
      14
    );

    // Cella 2: Cella Multicellulare Prealpina (Bresciano/Bergamasco)
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
      11
    );

    // Cella 3: Temporale a V-Shaped / Rigenerante (Emilia Orientale / Modenese)
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
      15
    );

    return [cell1, cell2, cell3];
  }
}
