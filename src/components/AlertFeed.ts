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
    // Filtra via eventuali celle già dissolte
    const activeCells = cells.filter(c => !c.isDissipated);
    this.activeCountEl.textContent = `${activeCells.length} Rilevate`;

    if (activeCells.length === 0) {
      this.cellsListEl.innerHTML = `
        <div class="empty-state" style="padding: 24px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 8px;">☀️</div>
          <p>Nessun nucleo convettivo attivo al momento.<br/><small>Le celle precedenti si sono dissolte. Il radar scansiona in tempo reale.</small></p>
        </div>
      `;
      return;
    }

    this.cellsListEl.innerHTML = '';

    for (const cell of activeCells) {
      const sizeNickname = this.getSizeNickname(cell.meshDiameterCm);
      const isNew = !!cell.isNew || cell.formationStage === 'new_initiation';
      const stage = cell.formationStage || (isNew ? 'new_initiation' : 'established');
      const ageMinutes = cell.ageMinutes !== undefined ? cell.ageMinutes : 25;
      const lifespan = cell.lifespanMinutes || 85;

      let stageBadge = '';
      if (stage === 'new_initiation') {
        stageBadge = '<span class="new-trajectory-chip" style="background: #00f0ff; color: #0f172a; font-weight: 700;">⚡ NUOVA CELLA</span>';
      } else if (stage === 'rapid_intensification') {
        stageBadge = '<span class="new-trajectory-chip" style="background: linear-gradient(90deg, #ff0055, #ff7700); color: #fff; font-weight: 700;">🔥 PICCO ATTIVITÀ</span>';
      } else if (stage === 'dissipating') {
        stageBadge = '<span class="new-trajectory-chip" style="background: #475569; color: #e2e8f0; font-weight: 600;">🌫️ IN DISSOLVIMENTO</span>';
      }

      const card = document.createElement('div');
      card.className = `storm-cell-card severity-${cell.severity} ${isNew ? 'is-new-trajectory' : ''}`;
      card.innerHTML = `
        <div class="cell-card-header">
          <div class="cell-name-group">
            <span class="cell-name">${cell.name}</span>
            ${stageBadge}
            <span class="cell-trend ${cell.trend}">${cell.trend === 'intensifying' ? '▲ In Crescita' : cell.trend === 'weakening' ? '▼ In Calo' : '■ Stazionaria'}</span>
          </div>
          <div class="cell-dbz-pill">${cell.maxDbz} dBZ</div>
        </div>

        <!-- Evidenza Rischio Grandine -->
        <div class="cell-hail-banner severity-${cell.severity}">
          <div class="hail-banner-left">
            <span class="hail-banner-icon">❄️</span>
            <div class="hail-banner-text">
              <span class="hail-banner-label">GRANDINE ATTESA</span>
              <span class="hail-banner-val">${cell.meshDiameterCm} cm <small>(${sizeNickname})</small></span>
            </div>
          </div>
          <div class="hail-banner-prob">
            <span class="prob-lbl">Prob.</span>
            <span class="prob-val">${cell.pohPercentage}%</span>
          </div>
        </div>

        <div class="cell-stats-grid">
          <div class="stat-col">
            <span class="stat-lbl">Velocità</span>
            <span class="stat-val">${cell.velocity.speedKmh} km/h</span>
          </div>
          <div class="stat-col">
            <span class="stat-lbl">Severità</span>
            <span class="stat-val severity-tag">${this.getSeverityLabel(cell.severity)}</span>
          </div>
          <div class="stat-col">
            <span class="stat-lbl">Età Cella</span>
            <span class="stat-val" style="font-size: 0.82rem; color: var(--text-highlight);">${ageMinutes}m / ${lifespan}m</span>
          </div>
        </div>

        ${cell.impactedTowns && cell.impactedTowns.length > 0 ? `
          <div class="cell-towns-box">
            <div class="towns-title">📍 In arrivo nei comuni:</div>
            <div class="towns-badges">
              ${cell.impactedTowns.map(t => `<span class="town-badge">${t}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="cell-card-footer">
          <button class="btn-inspect-cell">Centra su Mappa & Dettagli →</button>
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

  private getSizeNickname(diamCm: number): string {
    if (diamCm < 1.0) return 'Granella';
    if (diamCm < 2.2) return 'Moneta 1€';
    if (diamCm < 3.5) return 'Noce';
    if (diamCm < 5.2) return 'Pallina Golf';
    if (diamCm < 7.0) return 'Uovo';
    return 'Tennis / Gigante';
  }
}
