import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from './api-url.token';
import type { RoleType } from './user.service';

export type InviteStatus = 'Pending' | 'Accepted';

/** An invitation to join a tenant (backend `Invite`). Dates are ISO strings. */
export interface Invite {
  id: string;
  tenant_id: string;
  email: string;
  role: RoleType;
  /** uid of the user who sent it. */
  invited_by: string;
  invited_at: string;
  status: InviteStatus;
  /** Null until accepted. */
  accepted_at: string | null;
}

/** `POST /admin/invites` body: invite `email` to the active tenant with `role`. */
export interface CreateInviteRequest {
  email: string;
  role: RoleType;
}

/** Tenant invites; admin-only on the backend. */
@Injectable({ providedIn: 'root' })
export class InviteService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** Invites for the signed-in user's active tenant. */
  getInvites(): Observable<Invite[]> {
    return this.http.get<Invite[]>(`${this.base}/admin/invites`);
  }

  /** Invite someone to the active tenant; returns the created invite. */
  createInvite(request: CreateInviteRequest): Observable<Invite> {
    return this.http.post<Invite>(`${this.base}/admin/invites`, request);
  }
}
