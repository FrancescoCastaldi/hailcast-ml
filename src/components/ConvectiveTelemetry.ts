import { Chart, registerables } from 'chart.js';
import { ConvectiveSounding, HailPrediction } from '../types/meteorology';

Chart.register(...registerables);

export class ConvectiveTelemetryComponent {
  private sidebarEl: HTMLElement;
  private chartInstance: Chart | null = null;

  // Elementi UI
  private gaugeProbEl: HTMLElement;
  private diamValEl: HTMLElement;
  private shiValEl: HTMLElement;
  private poshValEl: HTMLElement;
  private valCapeEl: HTMLElement;
  private valLiEl: HTMLElement;
  private valShearEl: HTMLElement;
  private valFlEl: HTMLElement;
  private valM20El: HTMLElement;
  private valVilEl: HTMLElement;

  constructor() {
    this.sidebarEl = document.getElementById('rightSidebar') as HTMLElement;
    this.gaugeProbEl = document.getElementById('mlHailProbability') as HTMLElement;
    this.diamValEl = document.getElementById('mlEstimatedDiameter') as HTMLElement;
    this.shiValEl = document.getElementById('mlShiValue') as HTMLElement;
    this.poshValEl = document.getElementById('mlPoshValue') as HTMLElement;
    this.valCapeEl = document.getElementById('valCape') as HTMLElement;
    this.valLiEl = document.getElementById('valLi') as HTMLElement;
    this.valShearEl = document.getElementById('valShear') as HTMLElement;
    this.valFlEl = document.getElementById('valFreezingLevel') as HTMLElement;
    this.valM20El = document.getElementById('valMinus20') as HTMLElement;
    this.valVilEl = document.getElementById('valVil') as HTMLElement;

    this.bindEvents();
    this.initChart();
  }

  private bindEvents(): void {
    document.getElementById('btnToggleTelemetry')?.addEventListener('click', () => {
      this.toggle();
    });

    document.getElementById('btnCloseTelemetry')?.addEventListener('click', () => {
      this.close();
    });
  }

  public toggle(): void {
    this.sidebarEl.classList.toggle('open');
  }

  public open(): void {
    this.sidebarEl.classList.add('open');
  }

  public close(): void {
    this.sidebarEl.classList.remove('open');
  }

  public updateTelemetry(
    sounding: ConvectiveSounding,
    prediction: HailPrediction,
    maxDbz: number
  ): void {
    // Aggiorna valori ML e fisici
    this.gaugeProbEl.textContent = `${prediction.probability}%`;
    this.diamValEl.textContent = `${prediction.expectedDiameterCm} cm (${this.getSizeNickname(prediction.expectedDiameterCm)})`;
    this.shiValEl.textContent = `${prediction.shi} J/(m·s)`;
    this.poshValEl.textContent = `${prediction.posh}%`;

    // Aggiorna evidenziazione sulla scala dimensionale comparativa
    const scaleItems = document.querySelectorAll('#hailScaleBar .scale-item');
    scaleItems.forEach(item => {
      const sizeVal = parseFloat((item as HTMLElement).dataset.size || '0');
      const isTarget = (
        (prediction.expectedDiameterCm <= 2.2 && sizeVal === 1.5) ||
        (prediction.expectedDiameterCm > 2.2 && prediction.expectedDiameterCm <= 3.8 && sizeVal === 3.0) ||
        (prediction.expectedDiameterCm > 3.8 && prediction.expectedDiameterCm <= 5.5 && sizeVal === 4.5) ||
        (prediction.expectedDiameterCm > 5.5 && prediction.expectedDiameterCm <= 7.0 && sizeVal === 6.0) ||
        (prediction.expectedDiameterCm > 7.0 && sizeVal === 8.0)
      );
      item.classList.toggle('active', isTarget);
    });

    // Aggiorna indici convettivi
    this.valCapeEl.textContent = `${sounding.cape} J/kg`;
    this.valLiEl.textContent = `${sounding.liftedIndex} °C`;
    this.valShearEl.textContent = `${sounding.deepShear06km} m/s`;
    this.valFlEl.textContent = `${sounding.freezingLevel} m`;
    this.valM20El.textContent = `${sounding.minus20Level} m`;
    this.valVilEl.textContent = `${sounding.vil} kg/m²`;

    this.updateChart(maxDbz, sounding);
  }

  private initChart(): void {
    const canvas = document.getElementById('verticalProfileChart') as HTMLCanvasElement;
    if (!canvas) return;

    this.chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: ['0 km', '2 km', '3.5 km (0°C)', '5 km', '7 km (-20°C)', '9 km', '11 km', '13 km (Top)'],
        datasets: [
          {
            label: 'Riflettività (dBZ)',
            data: [35, 52, 64, 62, 56, 48, 30, 10],
            borderColor: '#ff0055',
            backgroundColor: 'rgba(255, 0, 85, 0.15)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointBackgroundColor: '#ff0055',
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 75,
            grid: {
              color: 'rgba(255, 255, 255, 0.08)'
            },
            ticks: {
              color: '#8e9bb0'
            },
            title: {
              display: true,
              text: 'dBZ',
              color: '#8e9bb0'
            }
          },
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.08)'
            },
            ticks: {
              color: '#8e9bb0',
              font: { size: 10 }
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }

  private updateChart(maxDbz: number, sounding: ConvectiveSounding): void {
    if (!this.chartInstance) return;

    // Genera curva calibrata basata su maxDbz e quota di zero termico
    const freezingFactor = sounding.freezingLevel / 4000;
    const profile = [
      Math.max(20, Math.round(maxDbz - 25 * freezingFactor)),
      Math.max(30, Math.round(maxDbz - 10 * freezingFactor)),
      maxDbz,
      Math.max(35, Math.round(maxDbz - 4)),
      Math.max(25, Math.round(maxDbz - 12)),
      Math.max(15, Math.round(maxDbz - 22)),
      Math.max(10, Math.round(maxDbz - 35)),
      5
    ];

    this.chartInstance.data.datasets[0].data = profile;
    this.chartInstance.update();
  }

  private getSizeNickname(diamCm: number): string {
    if (diamCm < 1.0) return 'Granella';
    if (diamCm < 2.0) return 'Moneta 1€';
    if (diamCm < 3.5) return 'Noce';
    if (diamCm < 5.0) return 'Pallina Golf';
    if (diamCm < 7.0) return 'Uovo';
    return 'Tennis / Gigante';
  }
}
