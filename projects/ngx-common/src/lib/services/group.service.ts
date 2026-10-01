import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-url.token';

export interface Group {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface GroupWithCount {
  group: Group;
  member_count: number;
}

export interface GroupRequest {
  name: string;
  description: string;
}

/** Admin group management (`/admin/groups`); every call is admin-only on the backend. */
@Injectable({ providedIn: 'root' })
export class GroupService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  getGroups(): Observable<GroupWithCount[]> {
    return this.http.get<GroupWithCount[]>(`${this.base}/admin/groups`);
  }

  createGroup(request: GroupRequest): Observable<Group> {
    return this.http.post<Group>(`${this.base}/admin/groups`, request);
  }

  updateGroup(id: string, request: Partial<GroupRequest>): Observable<Group> {
    return this.http.patch<Group>(`${this.base}/admin/groups/${encodeURIComponent(id)}`, request);
  }

  deleteGroup(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/groups/${encodeURIComponent(id)}`);
  }

  /** Member uids of the group. */
  getMembers(id: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/admin/groups/${encodeURIComponent(id)}/members`);
  }

  /** Replaces the group's membership with exactly `uids`. */
  setMembers(id: string, uids: string[]): Observable<void> {
    return this.http.patch<void>(`${this.base}/admin/groups/${encodeURIComponent(id)}/members`, { uids });
  }
}
