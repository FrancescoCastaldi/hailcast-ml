import { RainViewerFrame } from '../types/meteorology';

export class TimelineControllerComponent {
  private frames: RainViewerFrame[] = [];
  private currentIndex: number = 0;
  private isPlaying: boolean = false;
  private playbackSpeed: number = 1; // 1x, 2x, 4x
  private playIntervalId: number | null = null;
  private pastFramesCount: number = 0;

  private scrubberInput: HTMLInputElement;
  private progressBar: HTMLElement;
  private currentTimestampEl: HTMLElement;
  private frameModeBadge: HTMLElement;
  private btnPlayPause: HTMLElement;
  private iconPlay: HTMLElement;
  private iconPause: HTMLElement;

  private lblMinus60: HTMLElement | null;
  private lblMinus30: HTMLElement | null;
  private lblNow: HTMLElement | null;
  private lblPlus30: HTMLElement | null;
  private lblPlus60: HTMLElement | null;

  private onFrameChangeCallback?: (frame: RainViewerFrame, index: number, isNowcast: boolean, offsetMinutes: number) => void;

  constructor() {
    this.scrubberInput = document.getElementById('timelineScrubber') as HTMLInputElement;
    this.progressBar = document.getElementById('timelineProgressBar') as HTMLElement;
    this.currentTimestampEl = document.getElementById('frameClock') as HTMLElement;
    this.frameModeBadge = document.getElementById('frameModeBadge') as HTMLElement;
    this.btnPlayPause = document.getElementById('btnPlayPause') as HTMLElement;
    this.iconPlay = document.getElementById('iconPlay') as HTMLElement;
    this.iconPause = document.getElementById('iconPause') as HTMLElement;

    this.lblMinus60 = document.getElementById('lblTimeMinus60');
    this.lblMinus30 = document.getElementById('lblTimeMinus30');
    this.lblNow = document.getElementById('lblTimeNow');
    this.lblPlus30 = document.getElementById('lblTimePlus30');
    this.lblPlus60 = document.getElementById('lblTimePlus60');

    this.bindEvents();
    this.startLiveTimeTicker();
  }

  private startLiveTimeTicker(): void {
    const tick = () => {
      const now = new Date();
      const formatHm = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      const formatHms = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Aggiorna le etichette della barra temporale con l'orario reale calcolato dal momento corrente
      if (this.lblMinus60) {
        this.lblMinus60.textContent = `-60m (${formatHm(new Date(now.getTime() - 60 * 60000))})`;
      }
      if (this.lblMinus30) {
        this.lblMinus30.textContent = `-30m (${formatHm(new Date(now.getTime() - 30 * 60000))})`;
      }
      if (this.lblNow) {
        this.lblNow.textContent = `LIVE (${formatHm(now)})`;
      }
      if (this.lblPlus30) {
        this.lblPlus30.textContent = `+30m (${formatHm(new Date(now.getTime() + 30 * 60000))})`;
      }
      if (this.lblPlus60) {
        this.lblPlus60.textContent = `+60m (${formatHm(new Date(now.getTime() + 60 * 60000))})`;
      }

      // Se l'utente è posizionato sul frame LIVE (o non ci sono frame caricati), aggiorna i secondi in tempo reale
      const isLiveFrame = this.frames.length === 0 || this.currentIndex === (this.pastFramesCount - 1);
      if (isLiveFrame && this.currentTimestampEl) {
        this.currentTimestampEl.textContent = `${formatHms(now)} [LIVE ORA]`;
        if (this.frameModeBadge) {
          this.frameModeBadge.className = 'frame-mode-badge live';
          this.frameModeBadge.textContent = 'RADAR REALE (LIVE 🟢)';
        }
      }
    };

    tick();
    setInterval(tick, 1000);
  }

  private bindEvents(): void {
    this.scrubberInput?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      this.goToFrame(val);
    });

    document.getElementById('btnPrevFrame')?.addEventListener('click', () => {
      this.prevFrame();
    });

    document.getElementById('btnNextFrame')?.addEventListener('click', () => {
      this.nextFrame();
    });

    this.btnPlayPause?.addEventListener('click', () => {
      this.togglePlay();
    });

    document.getElementById('btnGoLive')?.addEventListener('click', () => {
      this.jumpToLive();
    });

    // Speed buttons
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        const target = e.currentTarget as HTMLElement;
        target.classList.add('active');
        this.playbackSpeed = parseFloat(target.dataset.speed || '1');
        if (this.isPlaying) {
          this.stopPlayLoop();
          this.startPlayLoop();
        }
      });
    });
  }

  public jumpToLive(): void {
    const liveIndex = Math.max(0, this.pastFramesCount - 1);
    this.goToFrame(liveIndex);
  }

  public setFrames(past: RainViewerFrame[], nowcast: RainViewerFrame[]): void {
    this.pastFramesCount = past.length;
    this.frames = [...past, ...nowcast];
    if (this.scrubberInput) {
      this.scrubberInput.max = Math.max(0, this.frames.length - 1).toString();
    }
    
    // Posizionati sull'ultimo frame passato (LIVE)
    if (!this.isPlaying) {
      this.currentIndex = Math.max(0, past.length - 1);
      if (this.scrubberInput) {
        this.scrubberInput.value = this.currentIndex.toString();
      }
    } else {
      if (this.currentIndex >= this.frames.length) {
        this.currentIndex = 0;
      }
      if (this.scrubberInput) {
        this.scrubberInput.value = this.currentIndex.toString();
      }
    }
    this.updateUI();
  }

  public setOnFrameChange(callback: (frame: RainViewerFrame, index: number, isNowcast: boolean, offsetMinutes: number) => void): void {
    this.onFrameChangeCallback = callback;
  }

  private getOffsetMinutesForIndex(index: number): number {
    if (this.frames.length === 0) return 0;
    const liveIndex = Math.max(0, this.pastFramesCount - 1);
    
    // Se abbiamo i frame di RainViewer con timestamp reale
    const currentFrame = this.frames[index];
    const liveFrame = this.frames[liveIndex];
    if (currentFrame && liveFrame && currentFrame.time && liveFrame.time) {
      return Math.round((currentFrame.time - liveFrame.time) / 60);
    }

    // Fallback: scatti da 10 minuti
    return (index - liveIndex) * 10;
  }

  public goToFrame(index: number): void {
    if (index < 0 || index >= this.frames.length) return;
    this.currentIndex = index;
    if (this.scrubberInput) {
      this.scrubberInput.value = index.toString();
    }
    this.updateUI();

    if (this.onFrameChangeCallback && this.frames[index]) {
      const isNowcast = index >= this.pastFramesCount;
      const offsetMinutes = this.getOffsetMinutesForIndex(index);
      this.onFrameChangeCallback(this.frames[index], index, isNowcast, offsetMinutes);
    }
  }

  public nextFrame(): void {
    let next = this.currentIndex + 1;
    if (next >= this.frames.length) {
      next = 0; // loop
    }
    this.goToFrame(next);
  }

  public prevFrame(): void {
    let prev = this.currentIndex - 1;
    if (prev < 0) {
      prev = this.frames.length - 1;
    }
    this.goToFrame(prev);
  }

  public togglePlay(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public play(): void {
    this.isPlaying = true;
    if (this.iconPlay) this.iconPlay.style.display = 'none';
    if (this.iconPause) this.iconPause.style.display = 'block';
    this.startPlayLoop();
  }

  public pause(): void {
    this.isPlaying = false;
    if (this.iconPlay) this.iconPlay.style.display = 'block';
    if (this.iconPause) this.iconPause.style.display = 'none';
    this.stopPlayLoop();
  }

  private startPlayLoop(): void {
    const delay = Math.max(200, 800 / this.playbackSpeed);
    this.playIntervalId = window.setInterval(() => {
      this.nextFrame();
    }, delay);
  }

  private stopPlayLoop(): void {
    if (this.playIntervalId !== null) {
      clearInterval(this.playIntervalId);
      this.playIntervalId = null;
    }
  }

  private updateUI(): void {
    const frame = this.frames[this.currentIndex];
    if (!frame) return;

    const offsetMinutes = this.getOffsetMinutesForIndex(this.currentIndex);
    const now = new Date();
    // Calcola l'orario reale dinamico basato sul momento esatto in cui l'utente guarda la pagina
    const dynamicFrameDate = new Date(now.getTime() + offsetMinutes * 60000);
    const timeStr = dynamicFrameDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const isNowcast = this.currentIndex >= this.pastFramesCount;
    const isLatestPast = this.currentIndex === (this.pastFramesCount - 1);

    if (isNowcast) {
      if (this.frameModeBadge) {
        this.frameModeBadge.className = 'frame-mode-badge nowcast';
        this.frameModeBadge.textContent = `NOWCAST +${offsetMinutes}m`;
      }
      if (this.currentTimestampEl) {
        this.currentTimestampEl.textContent = `${timeStr} (Previsione +${offsetMinutes}m)`;
      }
    } else if (isLatestPast) {
      if (this.frameModeBadge) {
        this.frameModeBadge.className = 'frame-mode-badge live';
        this.frameModeBadge.textContent = 'RADAR REALE (LIVE 🟢)';
      }
      if (this.currentTimestampEl) {
        this.currentTimestampEl.textContent = `${timeStr} [LIVE ORA]`;
      }
    } else {
      if (this.frameModeBadge) {
        this.frameModeBadge.className = 'frame-mode-badge live';
        this.frameModeBadge.textContent = `ARCHIVIO (${offsetMinutes}m)`;
      }
      if (this.currentTimestampEl) {
        this.currentTimestampEl.textContent = `${timeStr} (${offsetMinutes} min fa)`;
      }
    }

    if (this.progressBar) {
      const percentage = this.frames.length > 1 
        ? (this.currentIndex / (this.frames.length - 1)) * 100 
        : 100;
      this.progressBar.style.width = `${percentage}%`;
    }
  }
}
