import { StormCell } from '../types/meteorology';

export class AlertFeedComponent {
  private cellsListEl: HTMLElement;
  private alertListEl: HTMLElement;
  private activeCountEl: HTMLElement;
  private onCellSelectCallback?: (cell: StormCell) => void;

  constructor() {
    this.cellsListEl = document.getElementById('stormCellsList') as HTMLElement;
    this.alertListEl = document.getElementById('alertFeedList') as HTMLElement;
    this.activeCountEl = document.getElementById('activeCellsCount') as HTMLElement;
  }

  public setOnCellSelect(callback: (cell: StormCell) => void): void {
    this.onCellSelectCallback = callback;
  }

  public renderStormCells(cells: StormCell[]): void {
    this.activeCountEl.textContent = `${cells.length} Rilevate`;

    if (cells.length === 0) {
      this.cellsListEl.innerHTML = `
        <div class="empty-state">
          <p>Nessun nucleo convettivo con riflettività > 45 dBZ nell'area.</p>
        </div>
      `;
      return;
    }

    this.cellsListEl.innerHTML = '';

    for (const cell of cells) {
      const card = document.createElement('div');
      card.className = `storm-cell-card severity-${cell.severity}`;
      card.innerHTML = `
        <div class="cell-card-header">
          <div class="cell-name-group">
            <span class="cell-name">${cell.name}</span>
            <span class="cell-trend ${cell.trend}">${cell.trend === 'intensifying' ? '▲ In Intensificazione' : '■ Stazionaria'}</span>
          </div>
          <div class="cell-dbz-pill">${cell.maxDbz} dBZ</div>
        </div>

        <div class="cell-stats-grid">
          <div class="stat-col">
            <span class="stat-lbl">Diametro MESH</span>
            <span class="stat-val hail-size">${cell.meshDiameterCm} cm</span>
          </div>
          <div class="stat-col">
            <span class="stat-lbl">Probabilità POH</span>
            <span class="stat-val">${cell.pohPercentage}%</span>
          </div>
          <div class="stat-col">
            <span class="stat-lbl">Spostamento</span>
            <span class="stat-val">${cell.velocity.speedKmh} km/h</span>
          </div>
          <div class="stat-col">
            <span class="stat-lbl">Direzione</span>
            <span class="stat-val">${Math.round(cell.velocity.directionDeg)}°</span>
          </div>
        </div>

        <div class="cell-card-footer">
          <span class="threat-level">Minaccia: <b>${this.getSeverityLabel(cell.severity)}</b></span>
          <button class="btn-inspect-cell">Centra Mappa →</button>
        </div>
      `;

      card.addEventListener('click', () => {
        if (this.onCellSelectCallback) {
          this.onCellSelectCallback(cell);
        }
      });

      this.cellsListEl.appendChild(card);
    }
  }

  public addAlert(message: string, type: 'info' | 'warning' | 'danger' = 'warning'): void {
    const item = document.createElement('div');
    item.className = `alert-item alert-${type}`;
    const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    item.innerHTML = `
      <span class="alert-time">${time}</span>
      <span class="alert-msg">${message}</span>
    `;
    this.alertListEl.insertBefore(item, this.alertListEl.firstChild);

    // Mantieni max 6 alert
    while (this.alertListEl.children.length > 6) {
      this.alertListEl.removeChild(this.alertListEl.lastChild!);
    }
  }

  private getSeverityLabel(severity: string): string {
    switch (severity) {
      case 'destructive': return 'ESTREMA (>5 cm)';
      case 'severe': return 'SEVERA (3-5 cm)';
      case 'moderate': return 'MODERATA (2-3 cm)';
      case 'minor': return 'MARGINALE (<2 cm)';
      default: return 'NULLA / PIOGGIA';
    }
  }
}
