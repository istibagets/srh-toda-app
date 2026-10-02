import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  IonContent,
  IonSpinner,
  IonInput,
  IonButton,
  IonCheckbox,
  IonIcon,
  IonItem,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  mailOutline,
  lockClosedOutline,
  eyeOutline,
  eyeOffOutline,
  chevronBackOutline,
  arrowForwardOutline,
  shieldCheckmarkOutline,
  alertCircleOutline,
  checkmarkCircleOutline,
  keypadOutline,
  refreshOutline,
  mailUnreadOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { PushService } from '../../services/push.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    IonContent,
    IonSpinner,
    IonInput,
    IonButton,
    IonCheckbox,
    IonIcon,
  ],
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private pushService = inject(PushService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);

  // Screen state: 'welcome' | 'login' | 'otp'
  screenMode = signal<'welcome' | 'login' | 'otp'>('welcome');
  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // OTP Verification for unverified drivers
  otpEmail = signal<string>('');
  otpCode = signal<string>('');
  isVerifyingOtp = signal<boolean>(false);
  isResendingOtp = signal<boolean>(false);
  resendCooldown = signal<number>(0);
  private timerInterval: any = null;

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [true],
  });

  constructor() {
    addIcons({
      mailOutline,
      lockClosedOutline,
      eyeOutline,
      eyeOffOutline,
      chevronBackOutline,
      arrowForwardOutline,
      shieldCheckmarkOutline,
      alertCircleOutline,
      checkmarkCircleOutline,
      keypadOutline,
      refreshOutline,
      mailUnreadOutline,
    });
  }

  showLogin(): void {
    this.errorMessage.set(null);
    this.screenMode.set('login');
  }

  showWelcome(): void {
    this.errorMessage.set(null);
    this.screenMode.set('welcome');
  }

  cancelOtp(): void {
    this.errorMessage.set(null);
    this.otpCode.set('');
    this.screenMode.set('login');
  }

  togglePassword(): void {
    this.showPassword.update((val) => !val);
  }

  async showToast(message: string, color: 'danger' | 'success' | 'warning' = 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3500,
      color,
      position: 'top',
      buttons: [{ text: 'OK', role: 'cancel' }],
    });
    await toast.present();
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.showToast('Please enter your valid email and password.', 'warning');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.loginForm.value;

    this.authService.login({ email, password }).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.status === 'success') {
          this.pushService.promptAppPermissionsIfNecessary();
          this.router.navigate(['/tabs/home'], { replaceUrl: true });
        }
      },
      error: (err: any) => {
        this.isLoading.set(false);
        if (err.requires_otp) {
          this.otpEmail.set(err.email || email);
          this.screenMode.set('otp');
          this.startResendTimer();
          this.showToast('📧 Verification code sent to ' + (err.email || email) + '. Enter code below.', 'warning');
          return;
        }
        const msg = err.message || 'Login failed. Please verify your credentials.';
        this.errorMessage.set(msg);
        this.showToast(msg, 'danger');
      },
    });
  }

  startResendTimer(): void {
    this.resendCooldown.set(60);
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.resendCooldown() > 1) {
        this.resendCooldown.update((v) => v - 1);
      } else {
        this.resendCooldown.set(0);
        clearInterval(this.timerInterval);
      }
    }, 1000);
  }

  onOtpInput(event: any): void {
    const val = event.target?.value || '';
    const clean = String(val).replace(/[^0-9]/g, '').slice(0, 6);
    this.otpCode.set(clean);
  }

  submitOtp(): void {
    const code = this.otpCode().trim();
    if (code.length !== 6) {
      this.showToast('Please enter the complete 6-digit verification code.', 'warning');
      return;
    }

    this.isVerifyingOtp.set(true);
    const email = this.otpEmail() || this.loginForm.get('email')?.value;

    this.authService.verifyOtp(code, email).subscribe({
      next: (res) => {
        this.isVerifyingOtp.set(false);
        this.showToast('🎉 Email verified successfully! Welcome to SRH LINK-TODA.', 'success');
        this.router.navigate(['/tabs/home'], { replaceUrl: true });
      },
      error: (err) => {
        this.isVerifyingOtp.set(false);
        const msg = err.message || 'Invalid verification code. Please check your Gmail.';
        this.showToast(msg, 'danger');
      },
    });
  }

  resendOtp(): void {
    if (this.resendCooldown() > 0 || this.isResendingOtp()) return;

    this.isResendingOtp.set(true);
    const email = this.otpEmail() || this.loginForm.get('email')?.value;

    this.authService.resendOtp(email).subscribe({
      next: (res) => {
        this.isResendingOtp.set(false);
        this.startResendTimer();
        this.showToast('Fresh 6-digit verification code sent to ' + email, 'success');
      },
      error: (err) => {
        this.isResendingOtp.set(false);
        this.showToast(err.message || 'Failed to resend code.', 'danger');
      },
    });
  }
}

