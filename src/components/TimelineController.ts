import { RainViewerFrame } from '../types/meteorology';

export class TimelineControllerComponent {
  private frames: RainViewerFrame[] = [];
  private currentIndex: number = 0;
  private isPlaying: boolean = false;
  private playbackSpeed: number = 1; // 1x, 2x, 4x
  private playIntervalId: number | null = null;

  private scrubberInput: HTMLInputElement;
  private progressBar: HTMLElement;
  private currentTimestampEl: HTMLElement;
  private frameModeBadge: HTMLElement;
  private btnPlayPause: HTMLElement;
  private iconPlay: HTMLElement;
  private iconPause: HTMLElement;

  private onFrameChangeCallback?: (frame: RainViewerFrame, index: number, isNowcast: boolean) => void;

  constructor() {
    this.scrubberInput = document.getElementById('timelineScrubber') as HTMLInputElement;
    this.progressBar = document.getElementById('timelineProgressBar') as HTMLElement;
    this.currentTimestampEl = document.getElementById('frameClock') as HTMLElement;
    this.frameModeBadge = document.getElementById('frameModeBadge') as HTMLElement;
    this.btnPlayPause = document.getElementById('btnPlayPause') as HTMLElement;
    this.iconPlay = document.getElementById('iconPlay') as HTMLElement;
    this.iconPause = document.getElementById('iconPause') as HTMLElement;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.scrubberInput.addEventListener('input', (e) => {
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

  private pastFramesCount: number = 0;

  public setFrames(past: RainViewerFrame[], nowcast: RainViewerFrame[]): void {
    this.pastFramesCount = past.length;
    this.frames = [...past, ...nowcast];
    this.scrubberInput.max = (this.frames.length - 1).toString();
    
    // Se non stava già riproducendo, posizionati sull'ultimo frame passato (LIVE)
    if (!this.isPlaying) {
      this.currentIndex = Math.max(0, past.length - 1);
      this.scrubberInput.value = this.currentIndex.toString();
    } else {
      if (this.currentIndex >= this.frames.length) {
        this.currentIndex = 0;
      }
      this.scrubberInput.value = this.currentIndex.toString();
    }
    this.updateUI();
  }

  public setOnFrameChange(callback: (frame: RainViewerFrame, index: number, isNowcast: boolean) => void): void {
    this.onFrameChangeCallback = callback;
  }

  public goToFrame(index: number): void {
    if (index < 0 || index >= this.frames.length) return;
    this.currentIndex = index;
    this.scrubberInput.value = index.toString();
    this.updateUI();

    if (this.onFrameChangeCallback && this.frames[index]) {
      const isNowcast = index >= this.pastFramesCount;
      this.onFrameChangeCallback(this.frames[index], index, isNowcast);
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
    this.iconPlay.style.display = 'none';
    this.iconPause.style.display = 'block';
    this.startPlayLoop();
  }

  public pause(): void {
    this.isPlaying = false;
    this.iconPlay.style.display = 'block';
    this.iconPause.style.display = 'none';
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

    const frameDate = new Date(frame.time * 1000);
    const timeStr = frameDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const isNowcast = this.currentIndex >= this.pastFramesCount;
    const isLatestPast = this.currentIndex === (this.pastFramesCount - 1);

    const now = new Date();
    const diffMinutes = Math.round((now.getTime() - frameDate.getTime()) / 60000);

    let relativeStr = '';
    if (isNowcast) {
      const futureMins = Math.round((frameDate.getTime() - (this.frames[this.pastFramesCount - 1]?.time * 1000 || now.getTime())) / 60000);
      relativeStr = ` (+${futureMins}m)`;
      this.frameModeBadge.className = 'frame-mode-badge nowcast';
      this.frameModeBadge.textContent = `NOWCAST +${futureMins}m`;
    } else if (isLatestPast) {
      relativeStr = diffMinutes > 0 ? ` (Ultimo Scatto: -${diffMinutes}m)` : ` (Ultimo Scatto)`;
      this.frameModeBadge.className = 'frame-mode-badge live';
      this.frameModeBadge.textContent = 'RADAR REALE (LIVE)';
    } else {
      relativeStr = diffMinutes > 0 ? ` (-${diffMinutes}m)` : '';
      this.frameModeBadge.className = 'frame-mode-badge live';
      this.frameModeBadge.textContent = 'ARCHIVIO PASSATO';
    }

    this.currentTimestampEl.textContent = `${timeStr}${relativeStr}`;

    const percentage = this.frames.length > 1 
      ? (this.currentIndex / (this.frames.length - 1)) * 100 
      : 100;
    this.progressBar.style.width = `${percentage}%`;
  }
}
