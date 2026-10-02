import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  IonContent,
  IonSpinner,
  IonProgressBar,
  IonInput,
  IonButton,
  IonIcon,
  IonCard,
  IonBadge,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  personOutline,
  carOutline,
  mailOutline,
  lockClosedOutline,
  callOutline,
  documentTextOutline,
  cloudUploadOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  chevronBackOutline,
  arrowForwardOutline,
  cardOutline,
  documentAttachOutline,
  openOutline,
  keypadOutline,
  refreshOutline,
  mailUnreadOutline,
  sendOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    IonContent,
    IonSpinner,
    IonProgressBar,
    IonInput,
    IonButton,
    IonIcon,
    IonCard,
    IonBadge,
  ],
})
export class RegisterPage {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);

  // Wizard state
  currentStep = signal<number>(1);
  selectedRole = signal<'passenger' | 'driver'>('passenger');
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Async uniqueness check status: 'idle' | 'checking' | 'available' | 'taken'
  emailStatus = signal<'idle' | 'checking' | 'available' | 'taken'>('idle');
  phoneStatus = signal<'idle' | 'checking' | 'available' | 'taken'>('idle');

  // Uploaded file holders
  mtopCertFile: File | null = null;
  driversLicenseFile: File | null = null;
  mtopFileName = signal<string | null>(null);
  licenseFileName = signal<string | null>(null);

  // OTP Verification state (for driver registration)
  otpCode = signal<string>('');
  isVerifyingOtp = signal<boolean>(false);
  isResendingOtp = signal<boolean>(false);
  resendCooldown = signal<number>(0);
  private timerInterval: any = null;

  // Form definition
  regForm: FormGroup = this.fb.group({
    role: ['passenger', [Validators.required]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone_number: ['', [Validators.required, Validators.pattern(/^[0-9]{11}$/)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    password_confirmation: ['', [Validators.required]],
    // Driver-only fields
    full_name: [''],
    mtop_number: [''],
  });

  // Total steps computed based on role
  totalSteps = computed(() => (this.selectedRole() === 'driver' ? 5 : 3));

  // Progress percentage (0 to 1) for ion-progress-bar
  progressRatio = computed(() => {
    const step = this.currentStep();
    const total = this.totalSteps();
    return step / total;
  });

  // Progress percentage for text
  progressPct = computed(() => {
    return Math.round(this.progressRatio() * 100);
  });

  // Dynamic step titles & motivations
  stepMotivations = computed(() => {
    if (this.selectedRole() === 'driver') {
      return [
        { label: 'Role', motivate: 'Select Account Type', title: 'Choose your role', desc: 'Join as a verified TODA driver or passenger.' },
        { label: 'Details', motivate: 'Personal Info', title: 'Your contact details', desc: 'Provide your basic details for communications.' },
        { label: 'Password', motivate: 'Security Setup', title: 'Set account password', desc: 'Create a secure password to protect your account.' },
        { label: 'Docs', motivate: 'Driver Credentials', title: 'Upload TODA documents', desc: 'Submit your license and MTOP certificate for admin verification.' },
        { label: 'Verify', motivate: 'Gmail OTP Code', title: 'Verify your Gmail', desc: 'Enter the 6-digit verification code sent to your email inbox.' },
      ];
    }
    return [
      { label: 'Role', motivate: 'Select Account Type', title: 'Choose your role', desc: 'Join the SRH community to book fast and reliable rides.' },
      { label: 'Details', motivate: 'Personal Info', title: 'Your contact details', desc: 'Provide your basic account details.' },
      { label: 'Password', motivate: 'Security Setup', title: 'Set account password', desc: 'Create a secure password to protect your account.' },
    ];
  });

  constructor() {
    addIcons({
      personOutline,
      carOutline,
      mailOutline,
      lockClosedOutline,
      callOutline,
      documentTextOutline,
      cloudUploadOutline,
      checkmarkCircleOutline,
      alertCircleOutline,
      chevronBackOutline,
      arrowForwardOutline,
      cardOutline,
      documentAttachOutline,
      openOutline,
      keypadOutline,
      refreshOutline,
      mailUnreadOutline,
      sendOutline,
    });
  }

  selectRole(role: 'passenger' | 'driver'): void {
    this.selectedRole.set(role);
    this.regForm.get('role')?.setValue(role);
    if (role === 'driver') {
      this.regForm.get('full_name')?.setValidators([Validators.required]);
      this.regForm.get('mtop_number')?.setValidators([Validators.required, Validators.maxLength(6)]);
    } else {
      this.regForm.get('full_name')?.clearValidators();
      this.regForm.get('mtop_number')?.clearValidators();
    }
    this.regForm.get('full_name')?.updateValueAndValidity();
    this.regForm.get('mtop_number')?.updateValueAndValidity();
  }

  async showToast(message: string, color: 'danger' | 'success' | 'warning' = 'warning'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3500,
      color,
      position: 'top',
      buttons: [{ text: 'OK', role: 'cancel' }],
    });
    await toast.present();
  }

  // Real-time Field uniqueness check on blur
  checkEmailAvailability(): void {
    const emailControl = this.regForm.get('email');
    if (!emailControl || emailControl.invalid || !emailControl.value) return;

    this.emailStatus.set('checking');
    this.authService.checkField('email', emailControl.value).subscribe({
      next: (available) => {
        this.emailStatus.set(available ? 'available' : 'taken');
        if (!available) {
          emailControl.setErrors({ taken: true });
        }
      },
      error: () => this.emailStatus.set('idle'),
    });
  }

  checkPhoneAvailability(): void {
    const phoneControl = this.regForm.get('phone_number');
    if (!phoneControl || phoneControl.invalid || !phoneControl.value) return;

    this.phoneStatus.set('checking');
    this.authService.checkField('phone_number', phoneControl.value).subscribe({
      next: (available) => {
        this.phoneStatus.set(available ? 'available' : 'taken');
        if (!available) {
          phoneControl.setErrors({ taken: true });
        }
      },
      error: () => this.phoneStatus.set('idle'),
    });
  }

  // Password confirmation check
  get passwordsMatch(): boolean {
    const pwd = this.regForm.get('password')?.value;
    const confirm = this.regForm.get('password_confirmation')?.value;
    return pwd && confirm && pwd === confirm;
  }

  get passwordLengthValid(): boolean {
    const pwd = this.regForm.get('password')?.value;
    return !!pwd && pwd.length >= 8;
  }

  // File Upload Handlers
  onFileSelect(event: Event, type: 'mtop' | 'license'): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (type === 'mtop') {
        this.mtopCertFile = file;
        this.mtopFileName.set(file.name);
      } else {
        this.driversLicenseFile = file;
        this.licenseFileName.set(file.name);
      }
    }
  }

  // Navigation between steps
  goNext(): void {
    this.errorMessage.set(null);
    const step = this.currentStep();

    if (step === 1) {
      this.currentStep.set(2);
      return;
    }

    if (step === 2) {
      const name = this.regForm.get('name');
      const email = this.regForm.get('email');
      const phone = this.regForm.get('phone_number');

      name?.markAsTouched();
      email?.markAsTouched();
      phone?.markAsTouched();

      if (name?.invalid || email?.invalid || phone?.invalid || this.emailStatus() === 'taken' || this.phoneStatus() === 'taken') {
        this.showToast('Please verify all personal details before proceeding.', 'warning');
        return;
      }
      this.currentStep.set(3);
      return;
    }

    if (step === 3) {
      const pwd = this.regForm.get('password');
      const confirm = this.regForm.get('password_confirmation');

      pwd?.markAsTouched();
      confirm?.markAsTouched();

      if (pwd?.invalid || !this.passwordsMatch) {
        this.showToast('Please enter a matching password of at least 8 characters.', 'warning');
        return;
      }

      if (this.selectedRole() === 'driver') {
        if (!this.regForm.get('full_name')?.value) {
          this.regForm.get('full_name')?.setValue(this.regForm.get('name')?.value);
        }
        this.currentStep.set(4);
      } else {
        this.submitRegistration();
      }
    }
  }

  goBack(): void {
    this.errorMessage.set(null);
    if (this.currentStep() > 1) {
      this.currentStep.update((s) => s - 1);
    } else {
      this.router.navigate(['/login']);
    }
  }

  submitRegistration(): void {
    this.errorMessage.set(null);

    if (this.selectedRole() === 'driver') {
      const fn = this.regForm.get('full_name');
      const mtop = this.regForm.get('mtop_number');
      fn?.markAsTouched();
      mtop?.markAsTouched();

      if (fn?.invalid || mtop?.invalid) {
        this.showToast('Please enter your license name and MTOP body number.', 'warning');
        return;
      }

      if (!this.mtopCertFile || !this.driversLicenseFile) {
        const msg = 'Please upload both your MTOP Certificate and Driver\'s License.';
        this.errorMessage.set(msg);
        this.showToast(msg, 'warning');
        return;
      }
    }

    this.isLoading.set(true);

    const formData = new FormData();
    formData.append('role', this.selectedRole());
    formData.append('name', this.regForm.get('name')?.value);
    formData.append('email', this.regForm.get('email')?.value);
    formData.append('phone_number', this.regForm.get('phone_number')?.value);
    formData.append('password', this.regForm.get('password')?.value);
    formData.append('password_confirmation', this.regForm.get('password_confirmation')?.value);

    if (this.selectedRole() === 'driver') {
      formData.append('full_name', this.regForm.get('full_name')?.value);
      formData.append('mtop_number', this.regForm.get('mtop_number')?.value);
      if (this.mtopCertFile) formData.append('mtop_certificate', this.mtopCertFile);
      if (this.driversLicenseFile) formData.append('drivers_license', this.driversLicenseFile);
    }

    this.authService.register(formData).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.status === 'success') {
          if (res.requires_otp) {
            this.currentStep.set(5);
            this.startResendTimer();
            const email = this.regForm.get('email')?.value;
            this.showToast('📧 Verification code sent to ' + email + '. Check your Gmail inbox.', 'success');
          } else {
            this.showToast('🎉 Account registered successfully!', 'success');
            this.router.navigate(['/tabs/home'], { replaceUrl: true });
          }
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        const msg = err.message || 'Registration failed. Please check your details and try again.';
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

  submitDriverOtp(): void {
    const code = this.otpCode().trim();
    if (code.length !== 6) {
      this.showToast('Please enter the full 6-digit verification code.', 'warning');
      return;
    }

    this.isVerifyingOtp.set(true);
    const email = this.regForm.get('email')?.value;

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

  resendDriverOtp(): void {
    if (this.resendCooldown() > 0 || this.isResendingOtp()) return;

    this.isResendingOtp.set(true);
    const email = this.regForm.get('email')?.value;

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
