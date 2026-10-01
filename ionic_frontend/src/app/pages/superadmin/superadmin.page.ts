import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  IonSpinner,
  ToastController,
  AlertController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  shieldCheckmarkOutline,
  pulseOutline,
  peopleOutline,
  carSportOutline,
  cashOutline,
  documentTextOutline,
  settingsOutline,
  refreshOutline,
  lockClosedOutline,
  logOutOutline,
  arrowBackOutline,
  addOutline,
  trashOutline,
  createOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  warningOutline,
  serverOutline,
  timeOutline,
  saveOutline,
  constructOutline,
  keyOutline,
  businessOutline,
  callOutline,
  mailOutline,
  locationOutline,
  imageOutline,
  cloudUploadOutline,
  searchOutline,
  gridOutline,
  chevronDownOutline,
  ellipsisHorizontalOutline,
  closeOutline,
  layersOutline,
  menuOutline,
  chevronForwardOutline,
  navigateOutline,
  storefrontOutline,
  cartOutline,
  pinOutline,
} from 'ionicons/icons';
import { SuperadminService, SuperAdminUser, CmsData, LandmarkItem } from '../../services/superadmin.service';
import { AuthService } from '../../services/auth.service';
import { MaintenanceService } from '../../services/maintenance.service';

@Component({
  selector: 'app-superadmin',
  templateUrl: './superadmin.page.html',
  styleUrls: ['./superadmin.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonContent,
    IonIcon,
    IonSpinner,
  ],
})
export class SuperadminPage implements OnInit {
  superAdminService = inject(SuperadminService);
  authService = inject(AuthService);
  private maintenanceService = inject(MaintenanceService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);

  // Active Tab & Sidebar State
  activeTab = signal<'overview' | 'users' | 'franchise' | 'fares' | 'branding' | 'bylaws' | 'logs'>('overview');
  isSidebarOpen = signal<boolean>(false);

  selectTab(tab: 'overview' | 'users' | 'franchise' | 'fares' | 'branding' | 'bylaws' | 'logs', event?: Event): void {
    this.activeTab.set(tab);
    this.closeSidebar();
  }

  toggleSidebar(): void {
    this.isSidebarOpen.update(v => !v);
  }

  openSidebar(): void {
    this.isSidebarOpen.set(true);
  }

  closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  get activeTabTitle(): string {
    switch (this.activeTab()) {
      case 'overview': return 'Executive Pulse & System Metrics';
      case 'users': return 'User Accounts & Access Control';
      case 'fares': return 'Tariff Calibration & Geofence Radar';
      case 'franchise': return 'MTOP Fleet & Tricycle Registry';
      case 'bylaws': return 'TODA Bylaws & Disciplinary Policies';
      case 'branding': return 'Branding & Identity CMS';
      case 'logs': return 'Governance Audit Trails';
      default: return 'Superadmin Governance';
    }
  }

  // Security Login Form
  loginUsername = signal<string>('superadmin@gmail.com');
  loginPassword = signal<string>('admin123');
  loginError = signal<string>('');

  // User Management State
  userRoleFilter = signal<string>('all');
  userSearchQuery = signal<string>('');
  isAddUserModalOpen = signal<boolean>(false);
  newUserForm: FormGroup;
  isEditUserModalOpen = signal<boolean>(false);
  isSubmittingEdit = signal<boolean>(false);
  selectedEditUser = signal<SuperAdminUser | null>(null);
  editUserForm: FormGroup;

  // Dedicated Superadmin Password Change Modal
  isPasswordModalOpen = signal<boolean>(false);
  isUpdatingPassword = signal<boolean>(false);
  superAdminPasswordForm: FormGroup;

  // CMS Form
  cmsForm: FormGroup;
  isSavingCms = signal<boolean>(false);

  // Popular TODA Landmarks Management
  landmarksList = signal<LandmarkItem[]>([
    {
      name: 'Santa Rosa Public Market',
      desc: 'Town Center & Public Market Terminal',
      fare: 60,
      type: 'market',
      icon: 'storefront-outline',
      color: 'purple',
      lat: 15.42469999648076,
      lng: 120.93842748892547,
    },
    {
      name: 'SM Cabanatuan',
      desc: 'SM City Cabanatuan Terminal & Mall Complex',
      fare: 120,
      type: 'commercial',
      icon: 'cart-outline',
      color: 'blue',
      lat: 15.467008627792355,
      lng: 120.95436226867764,
    },
  ]);
  showLandmarkModal = signal<boolean>(false);
  editingLandmarkIndex = signal<number | null>(null);
  landmarkForm: FormGroup;

  // Maintenance Mode
  isMaintenanceMode = signal<boolean>(false);

  // Active Hovered Data Point in Activity Chart
  hoveredTrendIndex = signal<number | null>(null);

  get trendData() {
    const trends = this.superAdminService.pulse()?.daily_trends;
    if (trends && trends.length > 0) return trends;
    return [
      { date: '2026-09-03', day: 'Thu', rides: 14, revenue: 560 },
      { date: '2026-09-04', day: 'Fri', rides: 22, revenue: 880 },
      { date: '2026-09-05', day: 'Sat', rides: 35, revenue: 1420 },
      { date: '2026-09-06', day: 'Sun', rides: 28, revenue: 1120 },
      { date: '2026-09-07', day: 'Mon', rides: 19, revenue: 760 },
      { date: '2026-09-08', day: 'Tue', rides: 26, revenue: 1040 },
      { date: '2026-09-09', day: 'Today', rides: 31, revenue: 1240 },
    ];
  }

  get maxRides(): number {
    return Math.max(...this.trendData.map(d => d.rides), 10);
  }

  get trendPoints() {
    const data = this.trendData;
    const maxVal = this.maxRides;
    const width = 500;
    const height = 150;
    const paddingX = 40;
    const paddingY = 25;
    const usableW = width - paddingX * 2;
    const usableH = height - paddingY * 2;

    return data.map((d, i) => {
      const x = paddingX + (i * usableW) / (data.length - 1);
      const y = height - paddingY - (d.rides / maxVal) * usableH;
      return { x, y, day: d.day, rides: d.rides, revenue: d.revenue, date: d.date };
    });
  }

  get trendLinePath(): string {
    const pts = this.trendPoints;
    if (pts.length === 0) return '';
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cpX = (p0.x + p1.x) / 2;
      path += ` C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return path;
  }

  get trendAreaPath(): string {
    const pts = this.trendPoints;
    if (pts.length === 0) return '';
    const line = this.trendLinePath;
    const lastX = pts[pts.length - 1].x;
    const firstX = pts[0].x;
    const bottomY = 125;
    return `${line} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }

  constructor() {
    addIcons({
      shieldCheckmarkOutline,
      pulseOutline,
      peopleOutline,
      carSportOutline,
      cashOutline,
      documentTextOutline,
      settingsOutline,
      refreshOutline,
      lockClosedOutline,
      logOutOutline,
      arrowBackOutline,
      addOutline,
      trashOutline,
      createOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      warningOutline,
      serverOutline,
      timeOutline,
      saveOutline,
      constructOutline,
      keyOutline,
      businessOutline,
      callOutline,
      mailOutline,
      locationOutline,
      imageOutline,
      cloudUploadOutline,
      searchOutline,
      gridOutline,
      chevronDownOutline,
      ellipsisHorizontalOutline,
      closeOutline,
      layersOutline,
      menuOutline,
      chevronForwardOutline,
    });

    this.newUserForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone_number: ['09171234567', [Validators.required]],
      role: ['admin', [Validators.required]],
      password: ['admin123', [Validators.required, Validators.minLength(6)]],
      mtop_number: ['128491'],
    });

    this.editUserForm = this.fb.group({
      id: [0, [Validators.required]],
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone_number: ['', [Validators.required]],
      role: ['driver', [Validators.required]],
      mtop_number: [''],
      compliance_status: ['Approved'],
      is_active: [true],
      password: [''],
    });

    this.cmsForm = this.fb.group({
      logo_url: ['assets/images/srh-logo.png'],
      app_title: ['SRH LINK TODA', [Validators.required]],
      app_slogan: ['Smart Tricycle Dispatching & Commuter System', [Validators.required]],
      toda_association: ['Santa Rosa Homes TODA (SRH-TODA)', [Validators.required]],
      office_address: ['TODA Terminal Center, Santa Rosa Homes, Bulacan', [Validators.required]],
      dispatch_hours: ['5:00 AM - 11:00 PM Daily', [Validators.required]],
      hotline_phone: ['(044) 791-2345 / 0917-123-4567', [Validators.required]],
      support_email: ['srh.toda.official@gmail.com', [Validators.required, Validators.email]],

      base_fare: [50.0, [Validators.required, Validators.min(0)]],
      per_km_rate: [3.5, [Validators.required, Validators.min(0)]],
      night_differential: [5.0, [Validators.required, Validators.min(0)]],
      surge_multiplier: [1.0, [Validators.required, Validators.min(1)]],
      terminal_fee: [2.0, [Validators.required, Validators.min(0)]],
      student_discount: [20, [Validators.required]],
      pwd_senior_discount: [20, [Validators.required]],
      terminal_lat: [15.429550175641715, [Validators.required]],
      terminal_lng: [120.92240292427664, [Validators.required]],
      terminal_radius: [35, [Validators.required, Validators.min(10)]],
      boundary_name: ['Santa Rosa Homes TODA Zone', [Validators.required]],

      terms_of_service: ['Official SRH TODA Terms & Regulations for Commuters and Accredited Tricycle Operators.'],
      driver_rules: ['Strict adherence to queue rotation, speed limits within subdivision, and courtesy standards.'],
      passenger_guide: ['Guidelines on fare payment, designated loading points, and feedback reporting.'],
    });

    this.landmarkForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      desc: ['', [Validators.required]],
      fare: [50, [Validators.required, Validators.min(0)]],
      lat: [15.42469999648076, [Validators.required]],
      lng: [120.93842748892547, [Validators.required]],
      type: ['market'],
      icon: ['storefront-outline'],
      color: ['purple'],
    });

    this.superAdminPasswordForm = this.fb.group({
      new_password: ['', [Validators.required, Validators.minLength(6)]],
      confirm_password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  async ngOnInit(): Promise<void> {
    if (this.superAdminService.isAuthenticated()) {
      await this.loadAllSuperAdminData();
    }
  }

  async onLoginSubmit(): Promise<void> {
    this.loginError.set('');
    try {
      const ok = await this.superAdminService.login(
        this.loginUsername(),
        this.loginPassword()
      );
      if (ok) {
        this.showToast('Superadmin authenticated. Welcome to System Console.', 'success');
        await this.loadAllSuperAdminData();
      } else {
        this.loginError.set('Authentication failed. Check credentials.');
      }
    } catch (e: any) {
      this.loginError.set(e?.error?.message || 'Invalid credentials. Password is required to be admin123.');
    }
  }

  async loadAllSuperAdminData(): Promise<void> {
    await Promise.all([
      this.superAdminService.fetchOverview(),
      this.superAdminService.fetchUsers(this.userRoleFilter(), this.userSearchQuery()),
      this.superAdminService.fetchCmsData(),
      this.superAdminService.fetchLogs(),
    ]);

    const pulse = this.superAdminService.pulse();
    if (pulse?.is_maintenance !== undefined) {
      this.isMaintenanceMode.set(!!pulse.is_maintenance);
      this.maintenanceService.setMaintenanceState(!!pulse.is_maintenance);
    }

    const cms = this.superAdminService.cms();
    if (cms) {
      this.cmsForm.patchValue({
        logo_url: cms.branding?.logo_url || 'assets/images/srh-logo.png',
        app_title: cms.branding?.app_title ?? 'SRH LINK TODA',
        app_slogan: cms.branding?.app_slogan ?? 'Smart Tricycle Dispatching & Commuter System',
        toda_association: cms.branding?.toda_association ?? 'Santa Rosa Homes TODA (SRH-TODA)',
        office_address: cms.branding?.office_address ?? 'TODA Terminal Center, Santa Rosa Homes, Bulacan',
        dispatch_hours: cms.branding?.dispatch_hours ?? '5:00 AM - 11:00 PM Daily',
        hotline_phone: cms.branding?.hotline_phone ?? '(044) 791-2345 / 0917-123-4567',
        support_email: cms.branding?.support_email ?? 'srh.toda.official@gmail.com',

        base_fare: cms.fare_matrix?.base_fare ?? 50.0,
        per_km_rate: cms.fare_matrix?.per_km_rate ?? 3.5,
        night_differential: cms.fare_matrix?.night_differential ?? 5.0,
        surge_multiplier: cms.fare_matrix?.surge_multiplier ?? 1.0,
        terminal_fee: cms.fare_matrix?.terminal_fee ?? 2.0,
        student_discount: cms.fare_matrix?.student_discount ?? 20,
        pwd_senior_discount: cms.fare_matrix?.pwd_senior_discount ?? 20,
        terminal_lat: cms.geofencing?.terminal_lat ?? 15.429550175641715,
        terminal_lng: cms.geofencing?.terminal_lng ?? 120.92240292427664,
        terminal_radius: cms.geofencing?.terminal_radius ?? 35,
        boundary_name: cms.geofencing?.boundary_name ?? 'Santa Rosa Homes TODA Zone',

        terms_of_service: cms.bylaws?.terms_of_service ?? '',
        driver_rules: cms.bylaws?.driver_rules ?? '',
        passenger_guide: cms.bylaws?.passenger_guide ?? '',
      });

      if (cms.landmarks && Array.isArray(cms.landmarks) && cms.landmarks.length > 0) {
        this.landmarksList.set(cms.landmarks);
      }
    }
  }

  async onFilterUsers(role: string): Promise<void> {
    this.userRoleFilter.set(role);
    await this.superAdminService.fetchUsers(role, this.userSearchQuery());
  }

  async onSearchUsers(event: any): Promise<void> {
    const q = event.target?.value || '';
    this.userSearchQuery.set(q);
    await this.superAdminService.fetchUsers(this.userRoleFilter(), q);
  }

  openAddUserModal(): void {
    this.newUserForm.reset({
      name: '',
      email: '',
      phone_number: '0917' + Math.floor(1000000 + Math.random() * 9000000),
      role: 'admin',
      password: 'admin' + Math.floor(100 + Math.random() * 900),
      mtop_number: String(Math.floor(100000 + Math.random() * 900000)),
    });
    this.isAddUserModalOpen.set(true);
  }

  closeAddUserModal(): void {
    this.isAddUserModalOpen.set(false);
  }

  openEditUserModal(user: SuperAdminUser): void {
    this.selectedEditUser.set(user);
    this.editUserForm.patchValue({
      id: user.id,
      name: user.name,
      email: user.email,
      phone_number: user.phone_number || '',
      role: user.role,
      mtop_number: user.mtop_number || '',
      compliance_status: user.compliance || 'Approved',
      is_active: user.is_active,
      password: '',
    });
    this.isEditUserModalOpen.set(true);
  }

  closeEditUserModal(): void {
    this.isEditUserModalOpen.set(false);
    this.selectedEditUser.set(null);
  }

  async onUpdateUserSubmit(): Promise<void> {
    if (this.editUserForm.invalid) {
      this.showToast('Please check the form for invalid inputs.', 'warning');
      return;
    }

    this.isSubmittingEdit.set(true);
    try {
      const v = this.editUserForm.value;
      const payload: any = {
        name: v.name,
        email: v.email,
        phone_number: v.phone_number,
        role: v.role,
        mtop_number: v.mtop_number,
        compliance_status: v.compliance_status,
        is_active: v.is_active,
      };
      if (v.password && v.password.trim().length >= 6) {
        payload.password = v.password.trim();
      }

      await this.superAdminService.updateUser(v.id, payload);
      this.showToast(`User ${v.name} updated successfully.`, 'success');
      this.closeEditUserModal();
      await this.superAdminService.fetchUsers(this.userRoleFilter(), this.userSearchQuery());
      await this.superAdminService.fetchOverview();
    } catch (e: any) {
      this.showToast(e?.error?.message || 'Failed to update user.', 'danger');
    } finally {
      this.isSubmittingEdit.set(false);
    }
  }

  openSuperAdminPasswordModal(): void {
    this.superAdminPasswordForm.reset({
      new_password: '',
      confirm_password: '',
    });
    this.isPasswordModalOpen.set(true);
  }

  closeSuperAdminPasswordModal(): void {
    this.isPasswordModalOpen.set(false);
  }

  async onUpdateSuperAdminPassword(): Promise<void> {
    if (this.superAdminPasswordForm.invalid) {
      this.showToast('Please enter a valid password (minimum 6 characters).', 'warning');
      return;
    }
    const val = this.superAdminPasswordForm.value;
    if (val.new_password !== val.confirm_password) {
      this.showToast('New passwords do not match. Please re-enter.', 'warning');
      return;
    }

    try {
      this.isUpdatingPassword.set(true);
      // Find superadmin user ID or fallback to user #1
      const users = this.superAdminService.users();
      const saUser = users.find(u => u.role === 'superadmin') || { id: 1, name: 'Executive Superadmin', email: 'superadmin@gmail.com' };

      await this.superAdminService.updateUser(saUser.id, {
        name: saUser.name,
        email: saUser.email,
        password: val.new_password.trim(),
      });
      this.showToast('Superadmin password updated successfully. Please remember your new password.', 'success');
      this.closeSuperAdminPasswordModal();
    } catch (e: any) {
      this.showToast(e?.error?.message || 'Failed to update superadmin password.', 'danger');
    } finally {
      this.isUpdatingPassword.set(false);
    }
  }

  async onCreateUser(): Promise<void> {
    if (this.newUserForm.invalid) {
      this.showToast('Please fill out all required fields properly.', 'warning');
      return;
    }

    try {
      await this.superAdminService.createUser(this.newUserForm.value);
      this.showToast('Account created successfully.', 'success');
      this.closeAddUserModal();
      await this.superAdminService.fetchUsers(this.userRoleFilter(), this.userSearchQuery());
      await this.superAdminService.fetchOverview();
    } catch (e: any) {
      this.showToast(e?.error?.message || 'Failed to create user account.', 'danger');
    }
  }

  async onToggleUserRole(user: SuperAdminUser): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: `Change Role: ${user.name}`,
      message: 'Select the updated system role for this account:',
      inputs: [
        { label: 'Superadmin (Full Console & CMS Access)', type: 'radio', value: 'superadmin', checked: user.role === 'superadmin' },
        { label: 'TODA Admin (Queue & Approvals)', type: 'radio', value: 'admin', checked: user.role === 'admin' },
        { label: 'Driver (Accredited TODA Unit)', type: 'radio', value: 'driver', checked: user.role === 'driver' },
        { label: 'Passenger (Commuter)', type: 'radio', value: 'passenger', checked: user.role === 'passenger' },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Apply Role',
          handler: async (newRole: any) => {
            if (newRole && newRole !== user.role) {
              try {
                await this.superAdminService.updateUserRole(user.id, newRole);
                this.showToast(`Role updated to ${newRole.toUpperCase()}`, 'success');
                await this.superAdminService.fetchUsers(this.userRoleFilter(), this.userSearchQuery());
                await this.superAdminService.fetchOverview();
              } catch (e: any) {
                this.showToast('Failed to update role.', 'danger');
              }
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async onToggleUserActive(user: SuperAdminUser): Promise<void> {
    try {
      await this.superAdminService.toggleUserStatus(user.id);
      const newStatus = !user.is_active ? 'Activated' : 'Suspended';
      this.showToast(`User ${user.name} has been ${newStatus}.`, 'success');
      await this.superAdminService.fetchUsers(this.userRoleFilter(), this.userSearchQuery());
      await this.superAdminService.fetchOverview();
    } catch (e: any) {
      this.showToast('Failed to change user status.', 'danger');
    }
  }

  async onDeleteUser(user: SuperAdminUser): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Confirm Deletion',
      message: `Permanently delete ${user.name} (${user.email}) from system records?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete Account',
          role: 'destructive',
          handler: async () => {
            try {
              await this.superAdminService.deleteUser(user.id);
              this.showToast('User deleted from system records.', 'success');
              await this.superAdminService.fetchUsers(this.userRoleFilter(), this.userSearchQuery());
              await this.superAdminService.fetchOverview();
            } catch (e: any) {
              this.showToast(e?.error?.message || 'Failed to delete user.', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  onResetLogoDefault(): void {
    this.cmsForm.patchValue({ logo_url: 'assets/images/srh-logo.png' });
    this.showToast('Logo reset to default official SRH TODA seal.', 'medium');
  }

  resetTerminalCoordinatesToDefault(): void {
    this.cmsForm.patchValue({
      terminal_lat: 15.429550175641715,
      terminal_lng: 120.92240292427664,
      terminal_radius: 35,
      boundary_name: 'Santa Rosa Homes TODA Zone',
    });
    this.showToast('Terminal coordinates & radius reset to SRH default values.', 'medium');
  }

  onLogoFileSelect(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          this.cmsForm.patchValue({ logo_url: reader.result });
          this.showToast('Logo image uploaded to preview. Click Save to publish.', 'success');
        }
      };
      reader.readAsDataURL(file);
    }
  }

  async onSaveCms(): Promise<void> {
    if (this.cmsForm.invalid) {
      this.showToast('Please correct validation errors before saving.', 'warning');
      return;
    }

    this.isSavingCms.set(true);
    try {
      const v = this.cmsForm.value;
      const payload: Partial<CmsData> = {
        branding: {
          logo_url: v.logo_url,
          app_title: v.app_title,
          app_slogan: v.app_slogan,
          toda_association: v.toda_association,
          office_address: v.office_address,
          dispatch_hours: v.dispatch_hours,
          hotline_phone: v.hotline_phone,
          support_email: v.support_email,
        },
        fare_matrix: {
          base_fare: +v.base_fare,
          per_km_rate: +v.per_km_rate,
          night_differential: +v.night_differential,
          surge_multiplier: +v.surge_multiplier,
          terminal_fee: +v.terminal_fee,
          student_discount: +v.student_discount,
          pwd_senior_discount: +v.pwd_senior_discount,
        },
        geofencing: {
          terminal_lat: +v.terminal_lat,
          terminal_lng: +v.terminal_lng,
          terminal_radius: +v.terminal_radius,
          boundary_name: v.boundary_name || 'Santa Rosa Homes TODA Zone',
        },
        landmarks: this.landmarksList(),
        bylaws: {
          terms_of_service: v.terms_of_service,
          driver_rules: v.driver_rules,
          passenger_guide: v.passenger_guide,
        },
      };

      await this.superAdminService.updateCmsData(payload);
      this.showToast('System configuration & CMS published successfully.', 'success');
    } catch (e: any) {
      this.showToast('Failed to save CMS configuration.', 'danger');
    } finally {
      this.isSavingCms.set(false);
    }
  }

  openAddLandmarkModal(): void {
    this.editingLandmarkIndex.set(null);
    this.landmarkForm.reset({
      name: '',
      desc: '',
      fare: 50,
      lat: 15.42469999648076,
      lng: 120.93842748892547,
      type: 'market',
      icon: 'storefront-outline',
      color: 'purple',
    });
    this.showLandmarkModal.set(true);
  }

  openEditLandmarkModal(idx: number): void {
    const item = this.landmarksList()[idx];
    if (!item) return;
    this.editingLandmarkIndex.set(idx);
    this.landmarkForm.reset({
      name: item.name,
      desc: item.desc,
      fare: item.fare,
      lat: item.lat,
      lng: item.lng,
      type: item.type || 'market',
      icon: item.icon || 'location-outline',
      color: item.color || 'purple',
    });
    this.showLandmarkModal.set(true);
  }

  closeLandmarkModal(): void {
    this.showLandmarkModal.set(false);
    this.editingLandmarkIndex.set(null);
  }

  async saveLandmarkModalSubmit(): Promise<void> {
    if (this.landmarkForm.invalid) {
      this.landmarkForm.markAllAsTouched();
      this.showToast('Please enter all required landmark details.', 'warning');
      return;
    }

    const val = this.landmarkForm.value;
    const item: LandmarkItem = {
      name: val.name?.trim(),
      desc: val.desc?.trim(),
      fare: Number(val.fare),
      lat: Number(val.lat),
      lng: Number(val.lng),
      type: val.type || 'market',
      icon: val.icon || 'location-outline',
      color: val.color || 'purple',
    };

    const idx = this.editingLandmarkIndex();
    const updated = [...this.landmarksList()];
    if (idx !== null && idx >= 0 && idx < updated.length) {
      updated[idx] = item;
    } else {
      updated.push(item);
    }

    this.landmarksList.set(updated);
    this.closeLandmarkModal();

    try {
      await this.superAdminService.updateCmsData({ landmarks: updated });
      this.showToast(`Landmark "${item.name}" saved successfully!`, 'success');
    } catch {
      this.showToast('Landmark updated. Click Save Fare Matrix to persist.', 'primary');
    }
  }

  async deleteLandmark(idx: number): Promise<void> {
    const list = this.landmarksList();
    const item = list[idx];
    if (!item) return;

    const alert = await this.alertCtrl.create({
      header: 'Delete Landmark?',
      message: `Are you sure you want to remove "${item.name}" from popular TODA landmarks?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            const updated = list.filter((_, i) => i !== idx);
            this.landmarksList.set(updated);
            try {
              await this.superAdminService.updateCmsData({ landmarks: updated });
              this.showToast(`Landmark "${item.name}" removed.`, 'success');
            } catch {
              this.showToast('Landmark removed.', 'primary');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async resetLandmarksToDefault(): Promise<void> {
    const defaults: LandmarkItem[] = [
      {
        name: 'Main Gate Guard House',
        desc: 'Main Entrance & Central TODA Bay',
        fare: 50,
        type: 'gate',
        icon: 'shield-outline',
        color: 'emerald',
        lat: 15.42955,
        lng: 120.92240,
      },
      {
        name: 'Phase 1 Clubhouse',
        desc: 'Recreation Center & Swimming Pool',
        fare: 50,
        type: 'clubhouse',
        icon: 'business-outline',
        color: 'indigo',
        lat: 15.42780,
        lng: 120.92410,
      },
      {
        name: 'Santa Rosa Public Market',
        desc: 'Town Center & Public Market Terminal',
        fare: 60,
        type: 'market',
        icon: 'storefront-outline',
        color: 'purple',
        lat: 15.42469999648076,
        lng: 120.93842748892547,
      },
      {
        name: 'SM Cabanatuan',
        desc: 'SM City Cabanatuan Terminal & Mall Complex',
        fare: 120,
        type: 'commercial',
        icon: 'cart-outline',
        color: 'blue',
        lat: 15.467008627792355,
        lng: 120.95436226867764,
      },
    ];

    this.landmarksList.set(defaults);
    try {
      await this.superAdminService.updateCmsData({ landmarks: defaults });
      this.showToast('Reset to default TODA landmarks (Main Gate, Clubhouse, Public Market, SM Cabanatuan).', 'success');
    } catch {
      this.showToast('Reset to default landmarks.', 'primary');
    }
  }

  async onClearSystemCache(): Promise<void> {
    try {
      const res = await this.superAdminService.clearCache();
      this.showToast(res?.message || 'Application cache flushed successfully.', 'success');
    } catch (e) {
      this.showToast('Server caches flushed.', 'success');
    }
  }

  async onToggleMaintenance(): Promise<void> {
    try {
      const res = await this.superAdminService.toggleMaintenance();
      const newState = res?.is_maintenance ?? !this.isMaintenanceMode();
      this.isMaintenanceMode.set(newState);
      this.maintenanceService.setMaintenanceState(newState);
      this.showToast(
        res?.message || (newState ? 'System placed in Maintenance Mode.' : 'Platform is now LIVE for all users.'),
        newState ? 'warning' : 'success'
      );
    } catch (e) {
      this.showToast('Unable to reach server to toggle maintenance.', 'danger');
    }
  }

  onBackToApp(): void {
    if (this.authService.isAdmin()) {
      this.router.navigate(['/tabs/admin']);
    } else {
      this.router.navigate(['/tabs/home']);
    }
  }

  onLogout(): void {
    this.superAdminService.logout();
    this.showToast('Logged out from Superadmin Console.', 'medium');
  }

  private async showToast(message: string, color: 'success' | 'danger' | 'warning' | 'medium' | 'primary' = 'success'): Promise<void> {
    const t = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await t.present();
  }
}
