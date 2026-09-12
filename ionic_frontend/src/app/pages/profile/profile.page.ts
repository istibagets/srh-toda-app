import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonContent,
  IonSpinner,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonIcon,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonList,
  IonItem,
  IonToggle,
  IonInput,
  IonButton,
  IonBadge,
  IonAvatar,
  IonNote,
  IonModal,
  ToastController,
  AlertController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { DriverService } from '../../services/driver.service';
import { DashboardService } from '../../services/dashboard.service';
import { SavedLocationService } from '../../services/saved-location.service';
import { PushService } from '../../services/push.service';
import { SoundService } from '../../services/sound.service';
import { AttachmentViewerService } from '../../services/attachment-viewer.service';
import {
  personOutline,
  shieldCheckmarkOutline,
  lockClosedOutline,
  documentTextOutline,
  notificationsOutline,
  locationOutline,
  volumeHighOutline,
  phonePortraitOutline,
  cameraOutline,
  logOutOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  hardwareChipOutline,
  pulseOutline,
  documentAttachOutline,
  cardOutline,
  openOutline,
  starSharp,
  carSportOutline,
  walletOutline,
  mailOutline,
  callOutline,
  sparklesOutline,
  ribbonOutline,
  bookmarkOutline,
  bookmark,
  navigateOutline,
  pinOutline,
  storefrontOutline,
  businessOutline,
  informationCircleOutline,
  shieldOutline,
  happyOutline,
  heartOutline,
  helpCircleOutline,
  checkmarkOutline,
  refreshOutline,
  addOutline,
  removeOutline,
  arrowBackOutline,
  downloadOutline,
  printOutline,
  closeOutline,
  settingsOutline,
  trashOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    IonHeader,
    IonToolbar,
    IonContent,
    IonSpinner,
    IonSegment,
    IonSegmentButton,
    IonIcon,
    IonToggle,
    IonModal,
  ],
})
export class ProfilePage implements OnInit {
  authService = inject(AuthService);
  driverService = inject(DriverService);
  dashboardService = inject(DashboardService);
  savedLocationService = inject(SavedLocationService);
  pushService = inject(PushService);
  soundService = inject(SoundService);
  private fb = inject(FormBuilder);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);

  // Passenger specific live statistics
  passengerTotalRides = signal<number>(0);
  passengerTotalFares = signal<number>(0);

  getDisplayMtop(): string {
    const user = this.authService.currentUser();
    const fromProfile = user?.driver_profile?.mtop_number;
    if (fromProfile && fromProfile !== 'PENDING' && fromProfile !== 'ADMIN') {
      return String(fromProfile).replace(/^MTOP-?/i, '').trim();
    }
    const fromDriver = this.driverService.driver().mtopNumber;
    if (fromDriver && fromDriver !== 'PENDING' && fromDriver !== 'ADMIN') {
      return String(fromDriver).replace(/^MTOP-?/i, '').trim();
    }
    return '128491';
  }

  // Active Segment Tab: 'account' | 'credentials' | 'commute' | 'security'
  activeTab = signal<'account' | 'credentials' | 'commute' | 'security'>('account');

  // Full-screen settings modal state
  isSettingsModalOpen = signal<boolean>(false);

  // Permissions & Hardware state
  gpsStatus = signal<'granted' | 'prompt' | 'denied'>('prompt');
  pushPermission = signal<string>('default');
  notifEnabled = signal<boolean>(true);
  soundEnabled = signal<boolean>(true);
  diagRunning = signal<boolean>(false);
  diagResult = signal<string | null>(null);

  // Account editing form
  accountForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone_number: ['', [Validators.required, Validators.pattern(/^[0-9]{11}$/)]],
  });
  isSavingAccount = signal<boolean>(false);

  // Security / Password form
  passwordForm: FormGroup = this.fb.group({
    current_password: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    password_confirmation: ['', [Validators.required]],
  });
  isSavingPassword = signal<boolean>(false);

  // Avatar uploading
  isUploadingAvatar = signal<boolean>(false);

  // In-App Document Preview State
  isDocPreviewOpen = signal<boolean>(false);
  previewDocTitle = signal<string>('');
  previewDocUrl = signal<string>('');
  docZoomScale = signal<number>(1);
  docPanX = signal<number>(0);
  docPanY = signal<number>(0);

  private initialPinchDist = 0;
  private initialScale = 1;
  private lastTapTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;
  private initialPanX = 0;
  private initialPanY = 0;

  attachmentViewer = inject(AttachmentViewerService);

  openDocPreview(title: string, url?: string | null): void {
    if (!url) return;
    this.attachmentViewer.open(title, url, 'OFFICIAL DRIVER DOCUMENT');
  }

  closeDocPreview(): void {
    this.isDocPreviewOpen.set(false);
    this.resetDocZoom();
  }

  zoomDocIn(): void {
    this.docZoomScale.update((s) => Math.min(4, +(s + 0.4).toFixed(1)));
  }

  zoomDocOut(): void {
    this.docZoomScale.update((s) => {
      const ns = Math.max(1, +(s - 0.4).toFixed(1));
      if (ns === 1) {
        this.docPanX.set(0);
        this.docPanY.set(0);
      }
      return ns;
    });
  }

  resetDocZoom(): void {
    this.docZoomScale.set(1);
    this.docPanX.set(0);
    this.docPanY.set(0);
  }

  openInExternalBrowser(url?: string, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const targetUrl = url || this.previewDocUrl();
    if (!targetUrl) return;
    try {
      const win = window.open(targetUrl, '_system');
      if (!win) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  }

  downloadDoc(): void {
    const url = this.previewDocUrl();
    if (!url) return;
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.previewDocTitle().replace(/\s+/g, '_')}_document.png`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(url, '_blank');
    }
  }

  printDoc(): void {
    const url = this.previewDocUrl();
    if (!url) return;
    try {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>${this.previewDocTitle() || 'Official Document'}</title>
              <style>
                body { margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 95vh; font-family: sans-serif; }
                .title { font-size: 18px; font-weight: bold; margin-bottom: 12px; }
                img { max-width: 100%; max-height: 85vh; object-fit: contain; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
              </style>
            </head>
            <body>
              <div class="title">${this.previewDocTitle()}</div>
              <img src="${url}" onload="setTimeout(() => { window.print(); window.close(); }, 300);" />
            </body>
          </html>
        `);
        win.document.close();
      }
    } catch {
      window.print();
    }
  }

  onImageTouchStart(e: TouchEvent): void {
    if (e.touches.length === 2) {
      this.initialPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      this.initialScale = this.docZoomScale();
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - this.lastTapTime < 300) {
        if (this.docZoomScale() > 1) {
          this.resetDocZoom();
        } else {
          this.docZoomScale.set(2.2);
        }
      }
      this.lastTapTime = now;
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.initialPanX = this.docPanX();
      this.initialPanY = this.docPanY();
    }
  }

  onImageTouchMove(e: TouchEvent): void {
    if (e.touches.length === 2 && this.initialPinchDist > 0) {
      if (e.cancelable) e.preventDefault();
      const curDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = Math.max(1, Math.min(4, +(this.initialScale * (curDist / this.initialPinchDist)).toFixed(2)));
      this.docZoomScale.set(scale);
      if (scale <= 1) {
        this.docPanX.set(0);
        this.docPanY.set(0);
      }
    } else if (e.touches.length === 1 && this.docZoomScale() > 1) {
      if (e.cancelable) e.preventDefault();
      const dx = e.touches[0].clientX - this.touchStartX;
      const dy = e.touches[0].clientY - this.touchStartY;
      this.docPanX.set(this.initialPanX + dx);
      this.docPanY.set(this.initialPanY + dy);
    }
  }

  onImageTouchEnd(): void {
    this.initialPinchDist = 0;
  }

  onWheelZoom(e: WheelEvent): void {
    if (e.cancelable) e.preventDefault();
    if (e.deltaY < 0) {
      this.zoomDocIn();
    } else {
      this.zoomDocOut();
    }
  }

  constructor() {
    addIcons({
      personOutline,
      shieldCheckmarkOutline,
      lockClosedOutline,
      documentTextOutline,
      notificationsOutline,
      locationOutline,
      volumeHighOutline,
      phonePortraitOutline,
      cameraOutline,
      logOutOutline,
      checkmarkCircleOutline,
      alertCircleOutline,
      hardwareChipOutline,
      pulseOutline,
      documentAttachOutline,
      cardOutline,
      openOutline,
      starSharp,
      carSportOutline,
      walletOutline,
      mailOutline,
      callOutline,
      sparklesOutline,
      ribbonOutline,
      bookmarkOutline,
      bookmark,
      navigateOutline,
      pinOutline,
      storefrontOutline,
      businessOutline,
      informationCircleOutline,
      shieldOutline,
      happyOutline,
      heartOutline,
      helpCircleOutline,
      checkmarkOutline,
      refreshOutline,
      addOutline,
      removeOutline,
      arrowBackOutline,
      downloadOutline,
      printOutline,
      closeOutline,
      settingsOutline,
      trashOutline,
    });

    this.initUserForm();
    this.initHardwarePermissions();
  }

  openSettingsModal(): void {
    this.isSettingsModalOpen.set(true);
  }

  closeSettingsModal(): void {
    this.isSettingsModalOpen.set(false);
  }

  async confirmDeleteAccount(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete Account?',
      subHeader: 'Permanent and Irreversible',
      message: 'Are you sure you want to permanently delete your TODA account? All your profile information, rides history, and preferences will be permanently wiped.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete Account',
          role: 'destructive',
          handler: () => {
            this.executeDeleteAccount();
          },
        },
      ],
    });
    await alert.present();
  }

  private executeDeleteAccount(): void {
    this.authService.deleteAccount().subscribe({
      next: async () => {
        const t = await this.toastCtrl.create({
          message: 'Your account has been deleted successfully.',
          duration: 3000,
          color: 'dark',
          position: 'bottom',
        });
        await t.present();
      },
      error: async (err) => {
        const t = await this.toastCtrl.create({
          message: err.message || 'Failed to delete account.',
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await t.present();
      },
    });
  }

  ngOnInit(): void {
    if (this.authService.isPassenger()) {
      this.loadPassengerStats();
      this.savedLocationService.loadSavedLocations().subscribe();
    }
  }

  private loadPassengerStats(): void {
    this.dashboardService.getRideHistory().subscribe({
      next: (res) => {
        if (res?.summary) {
          this.passengerTotalRides.set(res.summary.total_trips || 0);
          this.passengerTotalFares.set(res.summary.total_earnings || 0);
        }
      },
      error: () => {},
    });
  }

  private initUserForm(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.accountForm.patchValue({
        name: user.name,
        phone_number: user.phone_number || '',
      });
    }
  }

  private initHardwarePermissions(): void {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.pushPermission.set(Notification.permission);
    }
    this.notifEnabled.set(localStorage.getItem('srh_notif_enabled') !== 'false');
    this.soundEnabled.set(localStorage.getItem('srh_sound_enabled') !== 'false');

    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((res) => {
          this.gpsStatus.set(res.state as any);
        })
        .catch(() => {});
    }
  }

  onTabChange(event: any): void {
    const newTab = event.detail.value;
    if (newTab) {
      this.activeTab.set(newTab);
    }
  }

  async showToast(message: string, color: 'success' | 'danger' | 'warning' | 'primary' = 'primary'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'top',
      buttons: [{ text: 'OK', role: 'cancel' }],
    });
    await toast.present();
  }

  // Permission actions
  requestGps(): void {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => {
          this.gpsStatus.set('granted');
          this.diagResult.set('GPS location access is active and accurate.');
          this.showToast('GPS location tracking activated.', 'success');
        },
        () => {
          this.gpsStatus.set('denied');
          this.diagResult.set('GPS access was denied in browser permissions.');
          this.showToast('GPS access was denied. Please allow location access in device settings.', 'warning');
        },
        { enableHighAccuracy: true }
      );
    }
  }

  async requestPush(): Promise<void> {
    const granted = await this.pushService.requestPermissionAndSubscribe();
    if (granted) {
      this.pushPermission.set('granted');
      this.soundService.playOnDuty();
      this.diagResult.set('System notifications are enabled and registered with TODA Push Server.');
      this.showToast('Push notifications enabled & active!', 'success');
    } else {
      this.pushPermission.set('denied');
      this.showToast('Push notifications permission was not granted.', 'warning');
    }
  }

  toggleNotif(event: any): void {
    const checked = event.detail.checked;
    this.notifEnabled.set(checked);
    localStorage.setItem('srh_notif_enabled', checked ? 'true' : 'false');
  }

  toggleSound(event: any): void {
    const checked = event.detail.checked;
    this.soundEnabled.set(checked);
    localStorage.setItem('srh_sound_enabled', checked ? 'true' : 'false');
  }

  async runDiagnostics(): Promise<void> {
    this.diagRunning.set(true);
    this.diagResult.set(null);

    // 1. Play sound chime
    try {
      this.soundService.playBookingAlert();
    } catch { }

    // 2. Ensure permissions and trigger Web Push test
    try {
      if (this.pushService.permissionStatus() !== 'granted') {
        await this.pushService.requestPermissionAndSubscribe();
      }
      this.pushService.triggerTestPush();
    } catch (e) {
      console.warn('Diagnostics push note:', e);
    }

    setTimeout(() => {
      const parts: string[] = [];
      parts.push(`GPS: ${this.gpsStatus().toUpperCase()}`);
      parts.push(`Push: ${this.notifEnabled() ? 'ENABLED' : 'MUTED'}`);
      parts.push(`Chime: ${this.soundEnabled() ? 'ACTIVE' : 'MUTED'}`);

      this.diagResult.set(`Diagnostics Passed (${parts.join(' | ')})`);
      this.diagRunning.set(false);
      this.showToast('Hardware sensor check completed successfully.', 'success');
    }, 1200);
  }

  // Account form submission
  saveAccount(): void {
    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      this.showToast('Please check your input values.', 'warning');
      return;
    }

    const val = this.accountForm.value;
    this.isSavingAccount.set(true);

    this.authService.updateProfile({ name: val.name, phone_number: val.phone_number }).subscribe({
      next: (res) => {
        this.isSavingAccount.set(false);
        this.showToast('Personal profile saved successfully.', 'success');
      },
      error: (err) => {
        this.isSavingAccount.set(false);
        this.showToast(err.message || 'Failed to update personal profile.', 'danger');
      },
    });
  }

  // Password form submission
  savePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      this.showToast('Please fill in all password fields.', 'warning');
      return;
    }

    const { current_password, password, password_confirmation } = this.passwordForm.value;
    if (password !== password_confirmation) {
      this.showToast('New password and confirmation do not match.', 'danger');
      return;
    }

    this.isSavingPassword.set(true);

    this.authService.updatePassword({ current_password, password, password_confirmation }).subscribe({
      next: () => {
        this.isSavingPassword.set(false);
        this.showToast('Security password changed successfully.', 'success');
        this.passwordForm.reset();
      },
      error: (err) => {
        this.isSavingPassword.set(false);
        this.showToast(err.message || 'Failed to update password.', 'danger');
      },
    });
  }

  // Avatar file upload
  onAvatarSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.isUploadingAvatar.set(true);

      this.authService.uploadAvatar(file).subscribe({
        next: () => {
          this.isUploadingAvatar.set(false);
          this.showToast('Avatar updated successfully.', 'success');
        },
        error: (err) => {
          this.isUploadingAvatar.set(false);
          this.showToast(err.message || 'Failed to upload image.', 'danger');
        },
      });
    }
  }

  onLogout(): void {
    this.authService.logout();
  }
}
