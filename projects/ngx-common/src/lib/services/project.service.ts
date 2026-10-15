import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from './api-url.token';

/** How a project's files are split for embedding. */
export interface ProjectChunkConfig {
  max_tokens: number;
  overlap_tokens: number;
}

/** Backend `ProjectResponse`. Dates are ISO strings. */
export interface Project {
  id: string;
  name: string;
  description: string | null;
  embedding_model: string;
  chunk_config: ProjectChunkConfig;
  created_at: string;
  updated_at: string;
}

/** Where a file is in indexing: uploaded → processing → indexed (or failed). */
export type ProjectFileStatus = 'uploaded' | 'processing' | 'indexed' | 'failed';

/** Backend `ProjectFileResponse`: returned by upload and by `GET /projects/{id}/files`. */
export interface ProjectFile {
  id: string;
  project_id: string;
  name: string;
  /** What the file is about; given at upload. Optional until the backend's response includes it. */
  description?: string | null;
  /** Bytes. */
  size: number;
  status: ProjectFileStatus;
  /** Why indexing failed, when `status` is `failed`. */
  error: string | null;
  chunk_count: number;
  created_at: string;
}

/** `PUT /projects/{id}` body: the editable fields (the embedding model and chunking are fixed once files are indexed). */
export interface ProjectUpdateRequest {
  name: string;
  description: string | null;
}

/** One matching chunk from `GET /projects/{id}/search`. */
export interface ProjectSearchResult {
  chunk_id: string;
  file_id: string;
  file_name: string;
  page: number;
  seq: number;
  text: string;
  /** Cosine similarity — compare within one search, not across searches. */
  score: number;
}

/** `POST /projects` body; leave optional fields out to use the server defaults. */
export interface ProjectCreateRequest {
  name: string;
  description?: string | null;
  embedding_model?: string | null;
  chunk_config?: ProjectChunkConfig | null;
}

/** The signed-in user's projects. */
@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  getProjects(): Observable<Project[]> {
    return this.http.get<Project[]>(`${this.base}/projects`);
  }

  getProject(id: string): Observable<Project> {
    return this.http.get<Project>(`${this.base}/projects/${encodeURIComponent(id)}`);
  }

  createProject(request: ProjectCreateRequest): Observable<Project> {
    return this.http.post<Project>(`${this.base}/projects`, request);
  }

  /** Semantic search over a project's indexed chunks (`top_k` omitted → the server's default). */
  searchProject(projectId: string, q: string, topK?: number | null): Observable<ProjectSearchResult[]> {
    let params = new HttpParams().set('q', q);
    if (topK != null) params = params.set('top_k', topK);
    return this.http.get<ProjectSearchResult[]>(`${this.base}/projects/${encodeURIComponent(projectId)}/search`, { params });
  }

  updateProject(projectId: string, request: ProjectUpdateRequest): Observable<Project> {
    return this.http.put<Project>(`${this.base}/projects/${encodeURIComponent(projectId)}`, request);
  }

  getProjectFiles(projectId: string): Observable<ProjectFile[]> {
    return this.http.get<ProjectFile[]>(`${this.base}/projects/${encodeURIComponent(projectId)}/files`);
  }

  /**
   * Upload one file (`POST /projects/{id}/files`, multipart: `description` — required, up to 200
   * characters — and `file`). Returns the created file, or null when the backend sends no body.
   */
  uploadProjectFile(projectId: string, file: File, description: string): Observable<ProjectFile | null> {
    const form = new FormData();
    form.append('description', description);
    form.append('file', file, file.name);
    return this.http.post<ProjectFile | null>(`${this.base}/projects/${encodeURIComponent(projectId)}/files`, form);
  }
}
