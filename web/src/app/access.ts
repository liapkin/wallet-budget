import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, throwError } from 'rxjs';

export type AccessProblem = 'connection' | 'session';

@Injectable({ providedIn: 'root' })
export class Access {
  readonly problem = signal<AccessProblem | null>(null);

  report(error: HttpErrorResponse) {
    if (error.status === 401 || this.isHtml(error)) this.problem.set('session');
    else if (error.status === 403) return;
    else if (error.status === 0 && this.problem() !== 'session') this.problem.set('connection');
  }

  reload() {
    window.location.reload();
  }

  private isHtml(error: HttpErrorResponse) {
    const contentType = error.headers.get('content-type')?.toLowerCase() ?? '';
    const body = typeof error.error === 'string' ? error.error.trimStart().toLowerCase() : '';
    return contentType.includes('text/html') || body.startsWith('<!doctype html') || body.startsWith('<html');
  }
}

export const accessInterceptor: HttpInterceptorFn = (request, next) => {
  const access = inject(Access);
  return next(request).pipe(catchError((error: unknown) => {
    if (request.url.startsWith('/api/') && error instanceof HttpErrorResponse) access.report(error);
    return throwError(() => error);
  }));
};
