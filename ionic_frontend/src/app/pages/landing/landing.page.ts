import { Component, OnInit, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowForwardOutline,
  shieldCheckmarkOutline,
  timeOutline,
  cashOutline,
  locationOutline,
  callOutline,
  mailOutline,
  chevronDownOutline,
  chevronUpOutline,
  checkmarkOutline,
  peopleOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';

interface FaqItem {
  question: string;
  answer: string;
  isOpen: boolean;
}

@Component({
  selector: 'app-landing',
  templateUrl: './landing.page.html',
  styleUrls: ['./landing.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonHeader, IonToolbar, IonIcon],
})
export class LandingPage implements OnInit {
  @ViewChild(IonContent) content!: IonContent;

  private router = inject(Router);
  private authService = inject(AuthService);

  logoUrl = signal<string>('assets/images/srh-logo.png');

  // FAQ Accordion State
  faqs = signal<FaqItem[]>([
    {
      question: 'How are tricycle fares determined in Santa Rosa Homes?',
      answer:
        'Fares strictly follow the official municipal tariff schedule: an initial base fare of ₱15.00 for the first kilometer, and ₱3.50 for each succeeding kilometer. Night differential applies between 10:00 PM and 5:00 AM.',
      isOpen: false,
    },
    {
      question: 'What is the standard passenger capacity and baggage policy?',
      answer:
        'Standard tricycle dispatch accommodates up to 2 regular passengers with reasonable personal baggage. Additional passengers or bulky cargo follow association-approved guidelines.',
      isOpen: false,
    },
    {
      question: 'How do drivers obtain MTOP franchise accreditation?',
      answer:
        'Drivers must possess an active Motorized Tricycle Operator Permit (MTOP) from the municipal licensing office, a valid driver’s license, and membership clearance with the Santa Rosa Homes TODA association.',
      isOpen: false,
    },
    {
      question: 'How can passengers report concerns, disputes, or lost property?',
      answer:
        'Passengers can contact the Santa Rosa Homes TODA Administration Center hotline with the tricycle’s 6-digit MTOP body number for prompt resolution.',
      isOpen: false,
    },
  ]);

  constructor() {
    addIcons({
      arrowForwardOutline,
      shieldCheckmarkOutline,
      timeOutline,
      cashOutline,
      locationOutline,
      callOutline,
      mailOutline,
      chevronDownOutline,
      chevronUpOutline,
      checkmarkOutline,
      peopleOutline,
    });
  }

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/tabs/home'], { replaceUrl: true });
      return;
    }

    const isPwa =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://') ||
        window.location.search.includes('source=pwa'));

    if (isPwa) {
      this.router.navigate(['/login'], { replaceUrl: true });
    }
  }

  onSignIn(): void {
    try {
      localStorage.setItem('srh_has_visited', 'true');
    } catch (e) {}
    this.router.navigate(['/login']);
  }

  toggleFaq(index: number): void {
    this.faqs.update((items) =>
      items.map((item, i) => (i === index ? { ...item, isOpen: !item.isOpen } : { ...item, isOpen: false }))
    );
  }

  async scrollToSection(sectionId: string): Promise<void> {
    if (sectionId === 'hero') {
      if (this.content) {
        await this.content.scrollToTop(400);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    const el = document.getElementById(sectionId);
    if (!el) return;

    if (this.content) {
      const scrollEl = await this.content.getScrollElement();
      if (scrollEl) {
        const headerOffset = window.innerWidth <= 600 ? 68 : 80;
        const elRect = el.getBoundingClientRect();
        const scrollElRect = scrollEl.getBoundingClientRect();
        const targetY = scrollEl.scrollTop + (elRect.top - scrollElRect.top) - headerOffset;

        await this.content.scrollToPoint(0, Math.max(0, targetY), 450);
        return;
      }
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
