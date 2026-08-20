import { Coordinates, LocationRiskAssessment } from '../types/meteorology';
import { GeocodingService } from '../services/geocoding';

export class LocationSearchComponent {
  private inputEl: HTMLInputElement;
  private clearBtn: HTMLElement;
  private gpsBtn: HTMLElement;
  private dropdownEl: HTMLElement;
  private riskCardEl: HTMLElement;
  private closeCardBtn: HTMLElement;

  private onLocationSelectedCallback?: (coords: Coordinates, name: string) => void;
  private debounceTimer: number | null = null;

  constructor() {
    this.inputEl = document.getElementById('locationSearchInput') as HTMLInputElement;
    this.clearBtn = document.getElementById('searchClearBtn') as HTMLElement;
    this.gpsBtn = document.getElementById('searchGpsBtn') as HTMLElement;
    this.dropdownEl = document.getElementById('searchResultsDropdown') as HTMLElement;
    this.riskCardEl = document.getElementById('locationRiskCard') as HTMLElement;
    this.closeCardBtn = document.getElementById('btnCloseRiskCard') as HTMLElement;

    this.bindEvents();
  }

  public setOnLocationSelected(callback: (coords: Coordinates, name: string) => void): void {
    this.onLocationSelectedCallback = callback;
  }

  private bindEvents(): void {
    this.inputEl.addEventListener('input', () => {
      const q = this.inputEl.value.trim();
      this.clearBtn.style.display = q ? 'block' : 'none';

      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => {
        this.performSearch(q);
      }, 250);
    });

    this.clearBtn.addEventListener('click', () => {
      this.inputEl.value = '';
      this.clearBtn.style.display = 'none';
      this.dropdownEl.style.display = 'none';
    });

    this.gpsBtn.addEventListener('click', () => {
      this.locateUserGPS();
    });

    this.closeCardBtn.addEventListener('click', () => {
      this.riskCardEl.style.display = 'none';
    });

    // Chiudi dropdown al click fuori
    document.addEventListener('click', (e) => {
      if (!this.inputEl.contains(e.target as Node) && !this.dropdownEl.contains(e.target as Node)) {
        this.dropdownEl.style.display = 'none';
      }
    });
  }

  private async performSearch(query: string): Promise<void> {
    if (query.length < 2) {
      this.dropdownEl.style.display = 'none';
      return;
    }

    const results = await GeocodingService.search(query);
    if (results.length === 0) {
      this.dropdownEl.innerHTML = '<div class="dropdown-item empty">Nessun comune trovato</div>';
      this.dropdownEl.style.display = 'block';
      return;
    }

    this.dropdownEl.innerHTML = '';
    for (const res of results) {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
        <span>${res.name}</span>
      `;
      item.addEventListener('click', () => {
        this.inputEl.value = res.name.split(',')[0];
        this.dropdownEl.style.display = 'none';
        if (this.onLocationSelectedCallback) {
          this.onLocationSelectedCallback(res.coords, res.name);
        }
      });
      this.dropdownEl.appendChild(item);
    }

    this.dropdownEl.style.display = 'block';
  }

  private locateUserGPS(): void {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: Coordinates = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
          this.inputEl.value = `Posizione GPS (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})`;
          if (this.onLocationSelectedCallback) {
            this.onLocationSelectedCallback(coords, 'La tua posizione GPS');
          }
        },
        (err) => {
          console.warn('Errore GPS o permesso negato:', err);
          // Fallback su Verona per test
          const fallback: Coordinates = { lat: 45.4384, lng: 10.9916 };
          this.inputEl.value = 'Verona (Fallback GPS)';
          if (this.onLocationSelectedCallback) {
            this.onLocationSelectedCallback(fallback, 'Verona (Fallback)');
          }
        }
      );
    }
  }

  public showRiskCard(assessment: LocationRiskAssessment): void {
    const cityNameEl = document.getElementById('riskCardCityName') as HTMLElement;
    const coordsEl = document.getElementById('riskCardCoords') as HTMLElement;
    const badgeEl = document.getElementById('riskBadgeLevel') as HTMLElement;
    const hailProbEl = document.getElementById('riskHailProb') as HTMLElement;
    const hailDiamEl = document.getElementById('riskHailDiameter') as HTMLElement;
    const stormDistEl = document.getElementById('riskStormDist') as HTMLElement;
    const stormEtaEl = document.getElementById('riskStormETA') as HTMLElement;
    const advisoryEl = document.getElementById('riskAdvisoryText') as HTMLElement;

    cityNameEl.textContent = assessment.locationName.split(',').slice(0, 2).join(',');
    coordsEl.textContent = `${assessment.coords.lat.toFixed(4)}° N, ${assessment.coords.lng.toFixed(4)}° E`;

    badgeEl.className = `risk-badge risk-${assessment.severityLevel}`;
    badgeEl.textContent = this.getBadgeText(assessment.severityLevel);

    hailProbEl.textContent = `${assessment.hailProbability}%`;
    hailDiamEl.textContent = `${assessment.estimatedDiameterCm} cm`;
    stormDistEl.textContent = assessment.nearestStormDistanceKm < 900 ? `${assessment.nearestStormDistanceKm} km` : 'Nessuna';
    stormEtaEl.textContent = assessment.estimatedArrivalMinutes ? `~${assessment.estimatedArrivalMinutes} min` : 'Non in rotta';
    advisoryEl.textContent = assessment.advisoryText;

    this.riskCardEl.style.display = 'block';
  }

  private getBadgeText(severity: string): string {
    switch (severity) {
      case 'destructive': return 'ALLERTA CRITICA';
      case 'severe': return 'RISCHIO ELEVATO';
      case 'moderate': return 'RISCHIO MEDIO';
      case 'minor': return 'RISCHIO BASSO';
      default: return 'RISCHIO TRASCURABILE';
    }
  }
}
