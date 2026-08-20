import { SpotterReport, Coordinates } from '../types/meteorology';
import { SpotterFeedService } from '../services/spotter-feed';

const ITALIAN_TOWNS_GEO: Record<string, Coordinates> = {
  'milano': { lat: 45.4642, lng: 9.1900 },
  'roma': { lat: 41.9028, lng: 12.4964 },
  'torino': { lat: 45.0703, lng: 7.6869 },
  'bologna': { lat: 44.4949, lng: 11.3426 },
  'firenze': { lat: 43.7696, lng: 11.2558 },
  'verona': { lat: 45.4384, lng: 10.9916 },
  'brescia': { lat: 45.5416, lng: 10.2118 },
  'bergamo': { lat: 45.6983, lng: 9.6773 },
  'padova': { lat: 45.4064, lng: 11.8768 },
  'vicenza': { lat: 45.5455, lng: 11.5354 },
  'treviso': { lat: 45.6669, lng: 12.2430 },
  'venezia': { lat: 45.4408, lng: 12.3155 },
  'modena': { lat: 44.6471, lng: 10.9252 },
  'reggio emilia': { lat: 44.6983, lng: 10.6307 },
  'parma': { lat: 44.8015, lng: 10.3279 },
  'piacenza': { lat: 45.0526, lng: 9.6930 },
  'ferrara': { lat: 44.8381, lng: 11.6198 },
  'ravenna': { lat: 44.4178, lng: 12.1977 },
  'forli': { lat: 44.2227, lng: 12.0407 },
  'cesena': { lat: 44.1396, lng: 12.2432 },
  'rimini': { lat: 44.0678, lng: 12.5695 },
  'desenzano del garda': { lat: 45.4674, lng: 10.5367 },
  'peschiera del garda': { lat: 45.4389, lng: 10.6933 },
  'castiglione delle stiviere': { lat: 45.3951, lng: 10.4908 },
  'san bonifacio': { lat: 45.3992, lng: 11.2755 },
  'mantova': { lat: 45.1564, lng: 10.7914 },
  'cremona': { lat: 45.1333, lng: 10.0333 },
  'monza': { lat: 45.5845, lng: 9.2744 },
  'como': { lat: 45.8081, lng: 9.0852 },
  'lecco': { lat: 45.8566, lng: 9.3977 },
  'varese': { lat: 45.8206, lng: 8.8251 },
  'trento': { lat: 46.0748, lng: 11.1217 },
  'bolzano': { lat: 46.4983, lng: 11.3548 },
  'udine': { lat: 46.0711, lng: 13.2346 },
  'pordenone': { lat: 45.9636, lng: 12.6606 },
  'trieste': { lat: 45.6495, lng: 13.7768 },
  'genova': { lat: 44.4056, lng: 8.9463 },
  'la spezia': { lat: 44.1025, lng: 9.8241 },
  'ancona': { lat: 43.6158, lng: 13.5189 },
  'perugia': { lat: 43.1107, lng: 12.3908 },
  'napoli': { lat: 40.8518, lng: 14.2681 },
  'bari': { lat: 41.1171, lng: 16.8719 },
  'palermo': { lat: 38.1157, lng: 13.3615 },
  'catania': { lat: 37.5079, lng: 15.0830 }
};

export class SpotterModalComponent {
  private modalEl: HTMLElement;
  private formEl: HTMLFormElement;
  private locationInput: HTMLInputElement;
  private timeInput: HTMLInputElement;
  private damageSelect: HTMLSelectElement;
  private notesInput: HTMLTextAreaElement;

  private onReportSubmittedCallback?: (report: SpotterReport) => void;
  private currentCoords: Coordinates | null = null;

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
    if (this.timeInput) {
      this.timeInput.value = `${hours}:${mins}`;
    }
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

  public open(prefilledLocation?: string, prefilledCoords?: Coordinates): void {
    if (prefilledLocation && this.locationInput) {
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

  private resolveCoordinates(locationName: string): Coordinates {
    if (this.currentCoords) return this.currentCoords;
    const clean = locationName.toLowerCase().replace(/\s*\(.*?\)/g, '').trim();

    for (const [town, coords] of Object.entries(ITALIAN_TOWNS_GEO)) {
      if (clean.includes(town) || town.includes(clean)) {
        return coords;
      }
    }

    // Default su coordinate realistiche nord Italia
    return { lat: 45.45, lng: 10.75 };
  }

  private handleSubmit(): void {
    const locName = this.locationInput.value.trim();
    if (!locName) {
      alert('Inserisci il nome del comune o località.');
      this.locationInput.focus();
      return;
    }

    const selectedPhenomRadio = document.querySelector('input[name="spotterPhenomenon"]:checked') as HTMLInputElement;
    const phenomenon = (selectedPhenomRadio ? selectedPhenomRadio.value : 'hail') as any;
    const selectedSizeRadio = document.querySelector('input[name="hailSize"]:checked') as HTMLInputElement;
    const hailSizeCm = parseFloat(selectedSizeRadio ? selectedSizeRadio.value : '2.0');
    const windSelect = document.getElementById('spotterWind') as HTMLSelectElement;
    const windSpeedKmh = windSelect ? parseInt(windSelect.value, 10) : 65;
    const timeStr = this.timeInput ? this.timeInput.value : new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const damageLevel = (this.damageSelect ? this.damageSelect.value : 'none') as any;
    const notes = this.notesInput ? this.notesInput.value.trim() : '';

    const coords = this.resolveCoordinates(locName);

    const newReport = SpotterFeedService.addReport({
      locationName: locName,
      coords,
      timestamp: timeStr,
      hailSizeCm,
      phenomenon,
      windSpeedKmh,
      damageLevel,
      notes: notes || 'Segnalazione confermata dalla rete di osservatori da terra HailCast.'
    });

    if (this.onReportSubmittedCallback) {
      this.onReportSubmittedCallback(newReport);
    }

    this.formEl.reset();
    this.currentCoords = null;
    this.close();
  }
}
