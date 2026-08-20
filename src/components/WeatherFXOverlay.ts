export type WeatherFXType = 'hail' | 'rain' | 'wind' | 'lightning';

export interface WeatherFXOptions {
  type: WeatherFXType;
  title: string;
  intensity: string;
  detail: string;
  durationMs?: number; // default 3500ms
  loop?: boolean; // true = animazione in loop continuo (nessuna chiusura automatica)
}

export class WeatherFXOverlay {
  private static instance: WeatherFXOverlay | null = null;
  private containerEl: HTMLElement;
  private canvasEl: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private titleEl: HTMLElement;
  private intensityEl: HTMLElement;
  private detailEl: HTMLElement;
  private iconEl: HTMLElement;

  private animationFrameId: number | null = null;
  private dismissTimer: number | null = null;
  private hideTimer: number | null = null;
  private particles: any[] = [];
  private currentType: WeatherFXType = 'hail';

  constructor() {
    let container = document.getElementById('weatherFxPopup');
    if (!container) {
      container = document.createElement('div');
      container.id = 'weatherFxPopup';
      container.className = 'weather-fx-popup';
      container.innerHTML = `
        <div class="weather-fx-card glass-panel">
          <canvas id="weatherFxCanvas" class="weather-fx-canvas" width="280" height="130"></canvas>
          <div class="weather-fx-content">
            <div class="weather-fx-header">
              <span class="weather-fx-icon" id="weatherFxIcon">❄️</span>
              <div>
                <h4 class="weather-fx-title" id="weatherFxTitle">Allerta Grandine</h4>
                <div class="weather-fx-intensity" id="weatherFxIntensity">Chicchi stimati: 3.5 cm</div>
              </div>
            </div>
            <p class="weather-fx-detail" id="weatherFxDetail">Nucleo temporalesco ad alta riflettività radar</p>
          </div>
          <button class="weather-fx-close-btn" id="btnCloseWeatherFx">&times;</button>
        </div>
      `;
      document.body.appendChild(container);
    }

    this.containerEl = container;
    this.canvasEl = document.getElementById('weatherFxCanvas') as HTMLCanvasElement;
    this.ctx = this.canvasEl.getContext('2d')!;
    this.titleEl = document.getElementById('weatherFxTitle') as HTMLElement;
    this.intensityEl = document.getElementById('weatherFxIntensity') as HTMLElement;
    this.detailEl = document.getElementById('weatherFxDetail') as HTMLElement;
    this.iconEl = document.getElementById('weatherFxIcon') as HTMLElement;

    document.getElementById('btnCloseWeatherFx')?.addEventListener('click', () => {
      this.hide();
    });

    this.containerEl.addEventListener('click', (e) => {
      if (e.target === this.containerEl) {
        this.hide();
      }
    });
  }

  public static getInstance(): WeatherFXOverlay {
    if (!this.instance) {
      this.instance = new WeatherFXOverlay();
    }
    return this.instance;
  }

  /**
   * Mostra l'animazione immersiva per pochi secondi (default 3.5s)
   */
  public show(options: WeatherFXOptions): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

    this.currentType = options.type;
    this.titleEl.textContent = options.title;
    this.intensityEl.textContent = options.intensity;
    this.detailEl.textContent = options.detail;

    // Emoji icona
    switch (options.type) {
      case 'hail':
        this.iconEl.textContent = '❄️';
        break;
      case 'rain':
        this.iconEl.textContent = '🌧️';
        break;
      case 'wind':
        this.iconEl.textContent = '💨';
        break;
      case 'lightning':
        this.iconEl.textContent = '⚡';
        break;
    }

    this.initParticles(options.type);

    this.containerEl.classList.remove('hiding');
    this.containerEl.classList.add('active');

    this.startAnimation();

    // Chiusura automatica dopo il tempo stabilito (in loop continuo se richiesto)
    if (!options.loop) {
      const duration = options.durationMs || 3500;
      this.dismissTimer = window.setTimeout(() => {
        this.hide();
      }, duration);
    }
  }

  public hide(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.containerEl.classList.add('hiding');
    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = null;
      this.containerEl.classList.remove('active', 'hiding');
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }, 280);
  }

  private initParticles(type: WeatherFXType): void {
    this.particles = [];
    const w = this.canvasEl.width;
    const h = this.canvasEl.height;

    if (type === 'hail') {
      // Chicchi di grandine 3D che cadono e rimbalzano
      for (let i = 0; i < 35; i++) {
        this.particles.push({
          x: Math.random() * w,
          y: Math.random() * (h + 40) - h,
          radius: 3 + Math.random() * 5,
          speedY: 7 + Math.random() * 8,
          speedX: (Math.random() - 0.3) * 3,
          bounces: 0,
          opacity: 0.8 + Math.random() * 0.2
        });
      }
    } else if (type === 'rain') {
      // Gocce di pioggia torrenziale inclinata e schizzi d'acqua
      for (let i = 0; i < 70; i++) {
        this.particles.push({
          x: Math.random() * (w + 60) - 30,
          y: Math.random() * -h,
          length: 12 + Math.random() * 16,
          speedY: 12 + Math.random() * 10,
          speedX: 3 + Math.random() * 2,
          opacity: 0.5 + Math.random() * 0.4
        });
      }
    } else if (type === 'wind') {
      // Strisce aerodinamiche di vento e vortici
      for (let i = 0; i < 40; i++) {
        this.particles.push({
          x: Math.random() * -w,
          y: 20 + Math.random() * (h - 40),
          length: 25 + Math.random() * 45,
          speedX: 10 + Math.random() * 12,
          speedY: (Math.random() - 0.5) * 2,
          opacity: 0.4 + Math.random() * 0.5
        });
      }
    } else if (type === 'lightning') {
      // Fulmini stocastici e particelle di ionizzazione
      for (let i = 0; i < 25; i++) {
        this.particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: 1.5 + Math.random() * 2.5,
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3,
          alpha: Math.random()
        });
      }
    }
  }

  private startAnimation(): void {
    const render = () => {
      this.drawFrame();
      this.animationFrameId = requestAnimationFrame(render);
    };
    render();
  }

  private drawFrame(): void {
    const w = this.canvasEl.width;
    const h = this.canvasEl.height;
    const ctx = this.ctx;

    // Sfondo semi-trasparente per scia motion blur
    ctx.fillStyle = 'rgba(8, 14, 26, 0.35)';
    ctx.fillRect(0, 0, w, h);

    if (this.currentType === 'hail') {
      // Disegna e anima chicchi di grandine
      for (const p of this.particles) {
        p.x += p.speedX;
        p.y += p.speedY;

        // Rimbalzo sul terreno
        if (p.y >= h - 10 && p.bounces < 2) {
          p.y = h - 10;
          p.speedY = -p.speedY * 0.45;
          p.speedX *= 0.8;
          p.bounces++;
          // Spruzzo di frammenti di ghiaccio
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.beginPath();
          ctx.arc(p.x + 3, h - 10, 1.5, 0, Math.PI * 2);
          ctx.arc(p.x - 3, h - 10, 1.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.y > h) {
          p.y = Math.random() * -30;
          p.x = Math.random() * w;
          p.speedY = 7 + Math.random() * 8;
          p.bounces = 0;
        }

        // Gradiente sfera di ghiaccio
        const grad = ctx.createRadialGradient(p.x - 1, p.y - 1, 1, p.x, p.y, p.radius);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.6, '#cbd5e1');
        grad.addColorStop(1, '#64748b');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.currentType === 'rain') {
      // Disegna strisce di pioggia inclinata
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#38bdf8';

      for (const p of this.particles) {
        p.x += p.speedX;
        p.y += p.speedY;

        if (p.y > h) {
          p.y = Math.random() * -20;
          p.x = Math.random() * (w + 40) - 20;
          // Schizzo ripple
          ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
          ctx.beginPath();
          ctx.ellipse(p.x, h - 4, 4, 1.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.speedX * 1.5, p.y + p.length);
        ctx.stroke();
      }
    } else if (this.currentType === 'wind') {
      // Linee di flusso vento
      ctx.lineWidth = 2;
      for (const p of this.particles) {
        p.x += p.speedX;
        p.y += p.speedY;

        if (p.x > w + 40) {
          p.x = Math.random() * -30;
          p.y = 15 + Math.random() * (h - 30);
        }

        const grad = ctx.createLinearGradient(p.x, p.y, p.x + p.length, p.y);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        grad.addColorStop(0.5, `rgba(255, 170, 0, ${p.opacity})`);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.bezierCurveTo(p.x + p.length * 0.3, p.y - 3, p.x + p.length * 0.7, p.y + 3, p.x + p.length, p.y);
        ctx.stroke();
      }
    } else if (this.currentType === 'lightning') {
      // Lampo e fulmine
      if (Math.random() < 0.12) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        let lx = w / 2 + (Math.random() - 0.5) * 40;
        let ly = 10;
        ctx.moveTo(lx, ly);
        while (ly < h - 15) {
          lx += (Math.random() - 0.5) * 30;
          ly += 15 + Math.random() * 20;
          ctx.lineTo(lx, ly);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  }
}
