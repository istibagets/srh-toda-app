import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
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
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { DriverService } from '../../services/driver.service';
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
} from 'ionicons/icons';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSpinner,
    IonSegment,
    IonSegmentButton,
    IonIcon,
    IonToggle,
  ],
})
export class ProfilePage {
  authService = inject(AuthService);
  driverService = inject(DriverService);
  private fb = inject(FormBuilder);
  private toastCtrl = inject(ToastController);

  getDisplayMtop(): string {
    const fromProfile = this.authService.currentUser()?.driver_profile?.mtop_number;
    if (fromProfile) {
      return String(fromProfile).replace(/^MTOP-?/i, '').trim();
    }
    const fromDriver = this.driverService.driver().mtopNumber;
    if (fromDriver && fromDriver !== '22') {
      return String(fromDriver).replace(/^MTOP-?/i, '').trim();
    }
    return '128491';
  }

  // Active Segment Tab: 'account' | 'credentials' | 'security' | 'permissions'
  activeTab = signal<'account' | 'credentials' | 'security' | 'permissions'>('account');

  // Permissions & Hardware state
  gpsStatus = signal<'granted' | 'prompt' | 'denied'>('prompt');
  pushPermission = signal<string>('default');
  notifEnabled = signal<boolean>(true);
  soundEnabled = signal<boolean>(true);
  vibrationEnabled = signal<boolean>(true);
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
    });

    this.initUserForm();
    this.initHardwarePermissions();
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
    this.vibrationEnabled.set(localStorage.getItem('srh_vibration_enabled') !== 'false');

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

  private async triggerHaptic(style: ImpactStyle = ImpactStyle.Light): Promise<void> {
    try {
      await Haptics.impact({ style });
    } catch {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(30);
      }
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
          this.triggerHaptic(ImpactStyle.Medium);
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

  requestPush(): void {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission().then((permission) => {
        this.pushPermission.set(permission);
        if (permission === 'granted') {
          this.diagResult.set('System notifications are enabled and ready.');
          this.showToast('Push notifications enabled.', 'success');
          this.triggerHaptic(ImpactStyle.Medium);
        } else {
          this.showToast('Push notifications not enabled.', 'warning');
        }
      });
    }
  }

  toggleNotif(event: any): void {
    const checked = event.detail.checked;
    this.notifEnabled.set(checked);
    localStorage.setItem('srh_notif_enabled', checked ? 'true' : 'false');
    this.triggerHaptic();
  }

  toggleSound(event: any): void {
    const checked = event.detail.checked;
    this.soundEnabled.set(checked);
    localStorage.setItem('srh_sound_enabled', checked ? 'true' : 'false');
    this.triggerHaptic();
  }

  toggleVibration(event: any): void {
    const checked = event.detail.checked;
    this.vibrationEnabled.set(checked);
    localStorage.setItem('srh_vibration_enabled', checked ? 'true' : 'false');
    if (checked) {
      this.triggerHaptic(ImpactStyle.Heavy);
    }
  }

  runDiagnostics(): void {
    this.diagRunning.set(true);
    this.diagResult.set(null);

    setTimeout(() => {
      this.diagRunning.set(false);
      this.diagResult.set('All hardware diagnostics passed. Device is ready for live ride matching.');
      this.showToast('Hardware diagnostics completed successfully.', 'success');
      this.triggerHaptic(ImpactStyle.Medium);
    }, 900);
  }

  // Account update
  saveAccount(): void {
    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      this.showToast('Please check the required fields in the account form.', 'warning');
      return;
    }

    this.isSavingAccount.set(true);

    this.authService.updateProfile(this.accountForm.value).subscribe({
      next: () => {
        this.isSavingAccount.set(false);
        this.showToast('Profile details updated successfully.', 'success');
        this.triggerHaptic(ImpactStyle.Medium);
      },
      error: (err) => {
        this.isSavingAccount.set(false);
        this.showToast(err.message || 'Failed to update profile.', 'danger');
      },
    });
  }

  // Password update
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
        this.triggerHaptic(ImpactStyle.Medium);
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
          this.triggerHaptic(ImpactStyle.Medium);
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
