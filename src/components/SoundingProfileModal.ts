import { Chart, registerables } from 'chart.js';
import { VerticalAtmosphericProfile } from '../types/meteorology';

Chart.register(...registerables);

export class SoundingProfileModalComponent {
  private modalEl: HTMLElement;
  private canvasEl: HTMLCanvasElement;
  private chart: Chart | null = null;
  private currentProfile: VerticalAtmosphericProfile | null = null;

  constructor() {
    this.modalEl = document.getElementById('soundingProfileModal') as HTMLElement;
    this.canvasEl = document.getElementById('soundingProfileChart') as HTMLCanvasElement;
    this.bindEvents();
  }

  public getCurrentProfile(): VerticalAtmosphericProfile | null {
    return this.currentProfile;
  }

  private bindEvents(): void {
    const btnClose = document.getElementById('btnCloseSoundingModal');
    btnClose?.addEventListener('click', () => this.close());

    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl?.style.display === 'flex') {
        this.close();
      }
    });
  }

  public open(profile: VerticalAtmosphericProfile): void {
    this.currentProfile = profile;
    if (!this.modalEl) return;

    this.updateInfoCards(profile);
    this.modalEl.style.display = 'flex';
    this.renderChart(profile);
  }

  public close(): void {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }

  private updateInfoCards(p: VerticalAtmosphericProfile): void {
    const titleEl = document.getElementById('soundingModalLocationTitle');
    if (titleEl) {
      titleEl.textContent = p.locationName || `Radiosondaggio (${p.coords.lat.toFixed(3)}°N, ${p.coords.lng.toFixed(3)}°E)`;
    }

    const hgzBottomEl = document.getElementById('hgzBottomVal');
    const hgzTopEl = document.getElementById('hgzTopVal');
    const hgzThickEl = document.getElementById('hgzThickVal');
    const capeValEl = document.getElementById('soundingCapeVal');
    const lpiValEl = document.getElementById('soundingLpiVal');

    if (hgzBottomEl) hgzBottomEl.textContent = `${p.hgzBottomMeters} m (0°C)`;
    if (hgzTopEl) hgzTopEl.textContent = `${p.hgzTopMeters} m (-20°C)`;
    if (hgzThickEl) hgzThickEl.textContent = `${p.hgzThicknessMeters} m`;
    if (capeValEl) capeValEl.textContent = `${p.cape} J/kg`;
    if (lpiValEl) lpiValEl.textContent = `${p.lightningPotentialIndex || 70}%`;

    // Render table levels
    const tableBody = document.getElementById('soundingLevelsTableBody');
    if (tableBody) {
      tableBody.innerHTML = p.levels.map(lvl => {
        const inHGZ = lvl.temperatureC <= 0 && lvl.temperatureC >= -20;
        return `
          <tr class="${inHGZ ? 'hgz-active-row' : ''}">
            <td><b>${lvl.pressureHpa} hPa</b></td>
            <td>~${lvl.altitudeMeters} m</td>
            <td style="color: ${lvl.temperatureC > 0 ? '#ff6666' : '#66a3ff'}; font-weight: 700;">${lvl.temperatureC > 0 ? '+' : ''}${lvl.temperatureC}°C</td>
            <td style="color: #00f0ff;">${lvl.dewPointC > 0 ? '+' : ''}${lvl.dewPointC}°C</td>
            <td>${inHGZ ? '<span class="hgz-badge">❄️ HAIL GROWTH</span>' : lvl.temperatureC > 0 ? '💧 Liquido' : '🧊 Glaciale'}</td>
          </tr>
        `;
      }).join('');
    }
  }

  private renderChart(p: VerticalAtmosphericProfile): void {
    if (!this.canvasEl) return;

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const ctx = this.canvasEl.getContext('2d');
    if (!ctx) return;

    // Ordine: da 1000 hPa (in basso) a 200 hPa (in alto)
    const labels = p.levels.map(l => `${l.pressureHpa} hPa (${l.altitudeMeters}m)`);
    const tempData = p.levels.map(l => l.temperatureC);
    const dewData = p.levels.map(l => l.dewPointC);

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Temperatura Aria T (°C)',
            data: tempData,
            borderColor: '#ff3366',
            backgroundColor: 'rgba(255, 51, 102, 0.15)',
            borderWidth: 3,
            tension: 0.35,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBackgroundColor: '#ff3366',
            fill: false
          },
          {
            label: 'Punto di Rugiada Td (°C)',
            data: dewData,
            borderColor: '#00f0ff',
            backgroundColor: 'rgba(0, 240, 255, 0.12)',
            borderWidth: 2.5,
            borderDash: [5, 5],
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: '#00f0ff',
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#e2e8f0',
              font: { family: 'Outfit, Inter, sans-serif', size: 12, weight: 'bold' }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderWidth: 1,
            titleColor: '#00f0ff',
            bodyColor: '#ffffff',
            padding: 12,
            callbacks: {
              afterBody: (items) => {
                const idx = items[0]?.dataIndex;
                if (idx !== undefined && p.levels[idx]) {
                  const lvl = p.levels[idx];
                  if (lvl.temperatureC <= 0 && lvl.temperatureC >= -20) {
                    return `\n❄️ HGZ: Zona di Congelamento & Accrescimento Grandine`;
                  }
                }
                return '';
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
            ticks: { color: '#94a3b8', font: { size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
            ticks: {
              color: '#94a3b8',
              callback: (val) => `${val}°C`
            },
            title: {
              display: true,
              text: 'Temperatura (°C)',
              color: '#cbd5e1'
            }
          }
        }
      }
    });
  }
}
