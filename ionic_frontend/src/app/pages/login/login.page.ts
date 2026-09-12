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

  // Screen state: 'welcome' | 'login'
  screenMode = signal<'welcome' | 'login'>('welcome');
  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

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
      error: (err) => {
        this.isLoading.set(false);
        const msg = err.message || 'Login failed. Please verify your credentials.';
        this.errorMessage.set(msg);
        this.showToast(msg, 'danger');
      },
    });
  }
}
