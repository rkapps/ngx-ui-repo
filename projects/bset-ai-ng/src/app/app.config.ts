import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { API_BASE_URL, authInterceptor, LOGIN_CONFIG } from 'ngx-common';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import {
  ArrowUp,
  Bot,
  Calendar,
  ChartBar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  House,
  LoaderCircle,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  MessageSquarePlus,
  MessageSquareX,
  Mic,
  MicOff,
  Monitor,
  Moon,
  Palette,
  PanelLeft,
  RefreshCw,
  Settings,
  ShieldAlert,
  SquarePen,
  Sun,
  User,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-angular';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

const icons = {
  ArrowUp,
  Bot,
  Calendar,
  ChartBar,
  Check,
  ChevronsUpDown,
  Copy,
  House,
  LoaderCircle,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  MessageSquarePlus,
  MessageSquareX,
  Mic,
  MicOff,
  Monitor,
  Moon,
  Palette,
  PanelLeft,
  RefreshCw,
  Settings,
  ShieldAlert,
  SquarePen,
  Sun,
  User,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
  TrendingDown,
  TrendingUp,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    importProvidersFrom(LucideAngularModule.pick(icons)),
    { provide: API_BASE_URL, useValue: environment.apiUrl },
    { provide: LOGIN_CONFIG, useValue: { appName: 'Basset AI', enableEmail: true, enableGoogle: false, redirectTo: '/agents' } },
  ],
};
