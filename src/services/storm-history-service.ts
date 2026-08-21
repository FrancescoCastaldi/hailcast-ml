import { StormCell, Coordinates } from '../types/meteorology';

export interface HistorySnapshot {
  timestamp: number;
  cells: StormCell[];
}

/**
 * StormHistoryService — Servizio di Storico Celle Temporalesche
 * 
 * Registra snapshot periodici delle celle attive in un ring buffer in memoria.
 * Permette di ricostruire le traiettorie reali percorse nel tempo e di "riavvolgere"
 * gli ultimi 180 minuti (3 ore) di attività convettiva.
 */
export class StormHistoryService {
  /** Ring buffer: max 360 snapshot (3 ore a 30s di refresh) */
  private static MAX_SNAPSHOTS = 360;
  private static snapshots: HistorySnapshot[] = [];

  /**
   * Registra uno snapshot delle celle attive correnti
   */
  public static recordSnapshot(cells: StormCell[], timestamp?: number): void {
    const ts = timestamp || Date.now();
    
    // Deep clone per evitare reference sharing
    const snapshot: HistorySnapshot = {
      timestamp: ts,
      cells: cells.map(c => ({
        ...c,
        centroid: { ...c.centroid },
        polygon: c.polygon.map(p => ({ ...p })),
        velocity: { ...c.velocity },
        sounding: { ...c.sounding },
        nowcastCones: c.nowcastCones.map(nc => ({
          ...nc,
          projectedCentroid: { ...nc.projectedCentroid },
          polygon: nc.polygon.map(p => ({ ...p }))
        }))
      }))
    };

    this.snapshots.push(snapshot);

    // Mantieni il buffer entro il limite
    if (this.snapshots.length > this.MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }
  }

  /**
   * Ritorna tutti gli snapshot registrati
   */
  public static getSnapshots(): HistorySnapshot[] {
    return this.snapshots;
  }

  /**
   * Ritorna il numero di snapshot registrati
   */
  public static getCount(): number {
    return this.snapshots.length;
  }

  /**
   * Ritorna lo snapshot più vicino al timestamp richiesto
   */
  public static getSnapshotAtTime(timestamp: number): HistorySnapshot | null {
    if (this.snapshots.length === 0) return null;

    let closest = this.snapshots[0];
    let minDiff = Math.abs(timestamp - closest.timestamp);

    for (const snap of this.snapshots) {
      const diff = Math.abs(timestamp - snap.timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = snap;
      }
    }

    return closest;
  }

  /**
   * Ritorna il range temporale coperto dallo storico [oldest, newest]
   */
  public static getTimeRange(): { oldest: number; newest: number } | null {
    if (this.snapshots.length === 0) return null;
    return {
      oldest: this.snapshots[0].timestamp,
      newest: this.snapshots[this.snapshots.length - 1].timestamp
    };
  }

  /**
   * Ricostruisce il trail (percorso) di una cella attraverso gli snapshot storici.
   * Ritorna un array di coordinate ordinate cronologicamente.
   */
  public static getTrail(cellId: string): Coordinates[] {
    const trail: Coordinates[] = [];
    
    for (const snap of this.snapshots) {
      const cell = snap.cells.find(c => c.id === cellId);
      if (cell) {
        trail.push({ ...cell.centroid });
      }
    }

    return trail;
  }

  /**
   * Ritorna i trail di TUTTE le celle che sono apparse nello storico.
   * Usato per renderizzare le traiettorie reali sulla mappa.
   */
  public static getAllTrails(): Map<string, { coords: Coordinates[]; name: string; severity: string }> {
    const trails = new Map<string, { coords: Coordinates[]; name: string; severity: string }>();
    
    // Raccogli tutti gli ID celle unici dallo storico
    const allCellIds = new Set<string>();
    for (const snap of this.snapshots) {
      for (const cell of snap.cells) {
        allCellIds.add(cell.id);
      }
    }

    // Costruisci il trail per ciascuna cella
    for (const cellId of allCellIds) {
      const coords: Coordinates[] = [];
      let name = '';
      let severity = 'minor';
      
      for (const snap of this.snapshots) {
        const cell = snap.cells.find(c => c.id === cellId);
        if (cell) {
          coords.push({ ...cell.centroid });
          name = cell.name;
          severity = cell.severity;
        }
      }

      // Solo trail con almeno 2 punti (per avere una linea)
      if (coords.length >= 2) {
        trails.set(cellId, { coords, name, severity });
      }
    }

    return trails;
  }

  /**
   * Resetta completamente lo storico
   */
  public static clear(): void {
    this.snapshots = [];
  }
}
