import { SpotterReport, Coordinates } from '../types/meteorology';
import { SpotterFeedService } from '../services/spotter-feed';

export class SpotterModalComponent {
  private modalEl: HTMLElement;
  private formEl: HTMLFormElement;
  private locationInput: HTMLInputElement;
  private timeInput: HTMLInputElement;
  private damageSelect: HTMLSelectElement;
  private notesInput: HTMLTextAreaElement;

  private onReportSubmittedCallback?: (report: SpotterReport) => void;

  constructor() {
    this.modalEl = document.getElementById('spotterModal') as HTMLElement;
    this.formEl = document.getElementById('spotterReportForm') as HTMLFormElement;
    this.locationInput = document.getElementById('spotterLocation') as HTMLInputElement;
    this.timeInput = document.getElementById('spotterTime') as HTMLInputElement;
    this.damageSelect = document.getElementById('spotterDamage') as HTMLSelectElement;
    this.notesInput = document.getElementById('spotterNotes') as HTMLTextAreaElement;

    this.bindEvents();
    this.initDefaultTime();
  }

  private initDefaultTime(): void {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    this.timeInput.value = `${hours}:${mins}`;
  }

  private bindEvents(): void {
    document.getElementById('btnOpenSpotterModal')?.addEventListener('click', () => {
      this.open();
    });

    document.getElementById('btnCloseSpotterModal')?.addEventListener('click', () => {
      this.close();
    });

    document.getElementById('btnCancelSpotter')?.addEventListener('click', () => {
      this.close();
    });

    // Light dismiss: click fuori dal contenuto del modale
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.close();
      }
    });

    // Chiusura con tasto Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl.style.display === 'flex') {
        this.close();
      }
    });

    this.formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });
  }

  public setOnReportSubmitted(callback: (report: SpotterReport) => void): void {
    this.onReportSubmittedCallback = callback;
  }

  private currentCoords: Coordinates | null = null;

  public open(prefilledLocation?: string, prefilledCoords?: Coordinates): void {
    if (prefilledLocation) {
      this.locationInput.value = prefilledLocation;
    }
    if (prefilledCoords) {
      this.currentCoords = prefilledCoords;
    }
    this.initDefaultTime();
    this.modalEl.style.display = 'flex';
  }

  public close(): void {
    this.modalEl.style.display = 'none';
  }

  private handleSubmit(): void {
    const locName = this.locationInput.value.trim();
    const selectedSizeRadio = document.querySelector('input[name="hailSize"]:checked') as HTMLInputElement;
    const hailSizeCm = parseFloat(selectedSizeRadio ? selectedSizeRadio.value : '2.0');
    const timeStr = this.timeInput.value;
    const damageLevel = this.damageSelect.value as any;
    const notes = this.notesInput.value.trim();

    // Coordinate stimate (o centrate sull'area o coordinate GPS fornite)
    const coords: Coordinates = this.currentCoords || {
      lat: 45.4 + (Math.random() - 0.5) * 0.4,
      lng: 10.8 + (Math.random() - 0.5) * 0.6
    };

    const newReport = SpotterFeedService.addReport({
      locationName: locName,
      coords,
      timestamp: timeStr,
      hailSizeCm,
      damageLevel,
      notes: notes || 'Segnalazione grandine inviata tramite HailCast AI Spotter Network.'
    });

    if (this.onReportSubmittedCallback) {
      this.onReportSubmittedCallback(newReport);
    }

    this.formEl.reset();
    this.close();
  }
}
