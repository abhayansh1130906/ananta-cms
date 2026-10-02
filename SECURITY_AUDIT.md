# Ananta CMS Security Audit & Hardening Report

**System Overview:**
- **Admin App / Backend API:** Next.js (App Router, Node.js runtime) + Supabase (Postgres, Auth, Storage).
- **Public Site:** Next.js static export (`output: 'export'`) with zero runtime network dependencies on Supabase or backend API.
- **Database & Storage:** Supabase PostgreSQL with Row Level Security (RLS) and Storage buckets (`media`, `snapshots`).

---

## Executive Summary

A comprehensive security audit and hardening pass was conducted across the Ananta CMS architecture. Prior to this pass, the system contained several critical architectural and implementation vulnerabilities:
1. **Anon Role & RLS Bypass:** Supabase `anon` public role had table grants allowing read access to drafts, release snapshots, and audit logs.
2. **Missing Search Path & Privilege Escalation:** Database functions (`is_staff`, `is_admin`, `publish_all`, `restore_snapshot`) lacked pinned `search_path` declarations, making them susceptible to search-path hijacking.
3. **Missing Role Hierarchy & Database Authorization Verification:** User roles were not checked against the database in middleware or several API routes, and no `super_admin` tier existed for user governance.
4. **Stored XSS Vector:** Rich-text HTML inputs permitted arbitrary tags (including `<iframe>` and unsafe hyperlinks), and public rendering lacked server/build-time sanitization.
5. **MIME/Extension-only File Upload Validation:** Media uploads did not inspect file magic bytes, allowing arbitrary HTML, SVG, or executable payloads to be uploaded.
6. **Snapshot Tampering Risk:** Static site builds verified SHA-256 content hashes but lacked cryptographic authenticity signatures (HMAC), allowing an attacker with bucket or CDN access to substitute malicious content.
7. **CSRF & Missing Security Headers:** Mutating API endpoints lacked Origin/Referer verification, and response headers lacked strict CSP, clickjacking frame restrictions, and robots indexing protection.

All identified vulnerabilities have been remediated, verified with automated tests (48 passing vitest tests in `admin`, 0 eslint errors, clean npm audits), and locked down with database migrations and security headers.

---

## Findings Table (Ranked Critical to Low)

| # | Severity | Vulnerability | File & Line | Exploitability / Attack Vector | Fix Applied |
|---|---|---|---|---|---|
| **1** | **Critical** | RLS Open to `anon` Role & Missing Revocations | [20261001000000_init_cms.sql](file:///c:/CODE/ananta-cms/admin/supabase/migrations/20261001000000_init_cms.sql#L170-L220) | Supabase `anon` key had table grants on `content_items`, `releases`, `audit_log`, and `profiles`. Any visitor with the public project anon key could dump unpublished draft items, release snapshots, audit trails, and user emails. | Revoked all table/sequence permissions from `anon` in migration `20261003000000_security_hardening.sql`. Added explicit `anon` denial policies. |
| **2** | **Critical** | Automatic Profile Creation Trigger Enabled Open Dashboard Access | [20261001000000_init_cms.sql](file:///c:/CODE/ananta-cms/admin/supabase/migrations/20261001000000_init_cms.sql#L72-L86) | Trigger `on_auth_user_created` automatically inserted a profile with `role = 'editor'` whenever any user signed up. If Supabase public signups were enabled or triggered via auth API, attackers received valid editor access. | Dropped trigger `on_auth_user_created` and function `handle_new_user()`. Created super_admin-only user provisioning API (`/api/v1/users`). |
| **3** | **Critical** | `SECURITY DEFINER` Functions Lacked Pinned `search_path` | [20261001000000_init_cms.sql](file:///c:/CODE/ananta-cms/admin/supabase/migrations/20261001000000_init_cms.sql#L60-L80) | `is_staff()`, `is_admin()`, `build_snapshot_types()`, `publish_all()`, and `restore_snapshot()` ran with owner privileges without `SET search_path = public, auth, pg_temp`. An attacker could manipulate schemas to execute arbitrary SQL as superuser. | Pinned `search_path = public, auth, pg_temp` on all functions; added `is_super_admin()` and revoked public execute permissions. |
| **4** | **High** | Stored XSS via Rich-Text Rendering & Unsanitized HTML | [sanitize.ts](file:///c:/CODE/ananta-cms/admin/src/lib/content/sanitize.ts#L10-L30), [renderers/index.tsx](file:///c:/CODE/ananta-cms/web/src/components/renderers/index.tsx#L40-L100) | `iframe` was permitted in rich text, URL protocols were not restricted to `http:/https:`, and the public website rendered `field.value` as raw HTML without sanitization, permitting `javascript:` URIs and DOM-based XSS. | Removed `iframe` from allowed tags; restricted protocols strictly to `['http', 'https']`; added `sanitize-html` to both admin sanitization pipeline and public site renderer. |
| **5** | **High** | File Upload MIME-Type Spoofing & Malicious Executable/SVG Upload | [media/route.ts](file:///c:/CODE/ananta-cms/admin/src/app/api/v1/media/route.ts#L40-L80) | Upload validation relied solely on client-supplied `file.type` and extension. Attackers could rename HTML/SVG with embedded JS or executables as `.jpg` or `.png`, bypassing filters and staging stored XSS or malware distribution. | Added magic-byte verification (checking PNG `89 50 4e 47`, JPEG `ff d8 ff`, WebP `RIFF...WEBP`, AVIF `ftypavif`); strictly rejected SVG and executables; enforced 10MB limit and randomized storage paths. |
| **6** | **High** | Snapshot Tampering / Man-In-The-Middle at Build Time | [fetch-snapshot.ts](file:///c:/CODE/ananta-cms/web/scripts/fetch-snapshot.ts#L60-L85) | The public site build checked SHA-256 hash match against snapshot JSON but had no HMAC authenticity signature. If an attacker modified both the snapshot content and checksum in storage or CDN, the build would publish tampered content. | Implemented HMAC-SHA256 snapshot signing in `admin/src/lib/publish/checksum.ts` and mandatory verification in `web/scripts/fetch-snapshot.ts` using `SNAPSHOT_SIGNING_SECRET`. |
| **7** | **High** | Missing CSRF Protection on Mutating Admin API Endpoints | [proxy.ts](file:///c:/CODE/ananta-cms/admin/src/proxy.ts#L1-L30), [middleware.ts](file:///c:/CODE/ananta-cms/admin/src/middleware.ts#L1-L100) | State-changing routes (`POST`, `PUT`, `DELETE`, `PATCH`) relied solely on session cookies without validating Origin or Referer against the trusted host, exposing admin accounts to cross-site request forgery. | Added Origin and Referer validation in Next.js middleware for all mutating requests, blocking mismatched origins. |
| **8** | **High** | Missing Role Hierarchy & Privilege Escalation on Administrative Routes | [requireRole.ts](file:///c:/CODE/ananta-cms/admin/src/lib/auth/requireRole.ts#L1-L50), [media/route.ts](file:///c:/CODE/ananta-cms/admin/src/app/api/v1/media/route.ts#L30) | Editors could upload media, delete/reorder content, and no dedicated `super_admin` role existed to separate user administration from day-to-day content editors. | Added `super_admin` role; implemented strict role hierarchy (`super_admin > admin > editor`); restricted media uploads, content-type schemas, publishing, and rollback to `admin`/`super_admin`. |
| **9** | **Medium** | Unrestricted Input Lengths & Unbounded JSON Schemas | [buildZodSchema.ts](file:///c:/CODE/ananta-cms/admin/src/lib/content/buildZodSchema.ts#L15-L80) | Text, rich text, and list fields had no upper bounds, allowing denial-of-service via massive JSON payloads or oversized database allocations. | Enforced strict boundaries: `MAX_TEXT_LENGTH = 1,000`, `MAX_RICHTEXT_LENGTH = 100,000`, `MAX_URL_LENGTH = 2,048`, `MAX_LIST_ITEMS = 200`. Added UUID validation on all route parameters. |
| **10** | **Medium** | Lack of Brute-Force Rate Limiting & Account Lockout on Login | [login/route.ts](file:///c:/CODE/ananta-cms/admin/src/app/api/v1/auth/login/route.ts#L1-L70) | Login was executed client-side via Supabase JS without server-side throttling, allowing credential stuffing and password enumeration attacks. | Created `/api/v1/auth/login` server endpoint with in-memory IP rate limiting, account lockout (5 failed attempts per 15 minutes), generic failure messages, and MFA requirement checks. |
| **11** | **Medium** | Missing Clickjacking & Browser Security Headers | [middleware.ts](file:///c:/CODE/ananta-cms/admin/src/middleware.ts#L50-L80), [next.config.ts](file:///c:/CODE/ananta-cms/web/next.config.ts#L1-L35) | Admin dashboard and public site lacked `Content-Security-Policy`, `X-Frame-Options`, and `Permissions-Policy`. Admin portal was vulnerable to UI redressing (clickjacking). | Enforced headers in middleware: `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`. |
| **12** | **Medium** | Missing Append-Only Immutability on Audit Logs & Releases | [20261003000000_security_hardening.sql](file:///c:/CODE/ananta-cms/admin/supabase/migrations/20261003000000_security_hardening.sql#L120-L160) | Any user with database update permissions could modify historical `audit_log` records or alter published release records to conceal unauthorized activities. | Created PostgreSQL trigger functions `enforce_audit_log_immutable()` and `enforce_releases_immutable()` preventing `UPDATE` or `DELETE` operations on audit trails and live releases. |
| **13** | **Medium** | Timing Attack in Secret Comparison on Cron Verification | [cron/verify/route.ts](file:///c:/CODE/ananta-cms/admin/src/app/api/v1/cron/verify/route.ts#L15) | Cron secret verification used standard string equality (`authHeader !== ...`), which is vulnerable to timing-based character leak attacks. | Replaced with `crypto.timingSafeEqual` over SHA-256 digests. |
| **14** | **Low** | Stack Trace & Internal Error Leaks in API Responses | [http.ts](file:///c:/CODE/ananta-cms/admin/src/lib/http.ts#L60-L90) | Unhandled database exceptions or internal errors returned detailed messages and potential schema paths to clients. | Redacted internal errors in `withHandler`; returned generic messages (`"Internal server error"`, `"Database operation failed"`) along with a unique `request_id` for server-side correlation. |
| **15** | **Low** | Missing Environment Variable Startup Validation | [admin/src/lib/env.ts](file:///c:/CODE/ananta-cms/admin/src/lib/env.ts), [web/src/lib/env.ts](file:///c:/CODE/ananta-cms/web/src/lib/env.ts) | Missing critical secrets (`SUPABASE_SECRET_KEY`, `SNAPSHOT_SIGNING_SECRET`) resulted in runtime failures rather than failing fast at boot. | Implemented strict Zod environment schemas that validate all required configurations during initialization. |

---

## Detailed Vulnerability Analysis & Fixes

### 1. Database Access & Row Level Security Hardening
- **Vulnerability:** Supabase automatically grants table usage to the `anon` role unless explicitly revoked. In initial migrations, public read policies allowed access to content items, profiles, releases, and audit logs.
- **Remediation:** 
  - Revoked all schema, table, and sequence permissions from `anon`:
    ```sql
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
    revoke usage on schema public from anon;
    ```
  - Added PostgreSQL triggers to prevent tampering with `audit_log` and published `releases`:
    ```sql
    create or replace function enforce_audit_log_immutable() returns trigger as $$
    begin
      raise exception 'audit_log is append-only and cannot be updated or deleted';
    end;
    $$ language plpgsql;
    ```
  - Added `admin/supabase/tests/rls_tests.sql` verifying that `anon` cannot read or write to any table, and validating that `editor`, `admin`, and `super_admin` have strictly segregated permissions.

### 2. Authentication, Rate Limiting & User Management
- **Vulnerability:** Signups were publicly open via Supabase Auth and automatically granted `editor` roles via trigger.
- **Remediation:**
  - Dropped trigger `on_auth_user_created` so no unapproved user can ever obtain a profile.
  - Implemented `/api/v1/auth/login` with 5-attempt/15-minute account lockout, IP rate limiting, generic error messages (preventing username enumeration), and MFA verification checks.
  - Built `/api/v1/users` and `/api/v1/users/[id]` restricted exclusively to `super_admin` for creating, listing, role-assigning, and deleting user accounts. Self-deletion and self-demotion are blocked.

### 3. File Uploads & Storage Protection
- **Vulnerability:** Uploads only checked the HTTP `Content-Type` header and file extension, allowing SVG (XSS vector) and executable uploads.
- **Remediation:**
  - Implemented magic byte validation inspecting the first 16 bytes:
    - PNG: `0x89, 0x50, 0x4E, 0x47`
    - JPEG: `0xFF, 0xD8, 0xFF`
    - WebP: `RIFF` ... `WEBP`
    - AVIF: `ftypavif`
  - SVG uploads are completely rejected.
  - Enforced 10 MB maximum file size and generated random UUID paths.
  - Updated storage policies: `media` bucket is public-read, admin-only write; `snapshots` bucket is private (service role only).

### 4. Build-Time Snapshot Signing & Supply Chain Integrity
- **Vulnerability:** Static public site builds downloaded snapshots from storage/URL without authenticity verification.
- **Remediation:**
  - Added HMAC-SHA256 signature generation in `admin/src/lib/publish/checksum.ts` using `SNAPSHOT_SIGNING_SECRET`.
  - Added mandatory HMAC verification in `web/scripts/fetch-snapshot.ts` using `crypto.timingSafeEqual`.
  - Builds now fail immediately if the snapshot is missing, corrupted, or has an invalid signature.
  - Created `.github/workflows/security.yml` and `.github/dependabot.yml` for automated dependency audits, linting, and Gitleaks secret scanning.

### 5. Static Site Offline Guarantee
- **Verification:** Audited all files in `web/src`. Zero instances of `@supabase/supabase-js`, `createClient`, or dynamic API calls exist in the public web app.
- At runtime, the static site serves pre-compiled HTML and assets from `src/data/content.json`. The static site remains 100% operational when the backend API and Supabase are completely offline.

---

## Verification & Testing Summary

1. **Automated Unit & Integration Tests:**
   - Vitest test suite (`admin/tests`): **7 test files, 48 tests passed (100% passing)**.
     - `rbac.test.ts`: Role hierarchy and `hasRequiredRole` verification.
     - `api-auth.test.ts`: 18 tests verifying unauthenticated (anon), editor, admin, and super_admin access controls across all admin routes.
     - `buildZodSchema.test.ts`: Schema bounds and sanitization testing.
     - `checksum.test.ts`: Snapshot checksum and HMAC signature verification.
     - `snapshot.test.ts`: Snapshot generation and integrity.
     - `verify.test.ts`: Release verification and timeout logic.
     - `slug.test.ts`: Safe slug formatting and collision prevention.
2. **Linting & Code Quality:**
   - `admin`: ESLint passed with 0 errors.
   - `web`: ESLint passed with 0 errors.
3. **Dependency Vulnerability Audits:**
   - `admin`: `npm audit` returned **0 vulnerabilities**.
   - `web`: `npm audit` returned **0 vulnerabilities**.
4. **Database RLS Test Suite:**
   - `admin/supabase/tests/rls_tests.sql` covers tests for `anon`, `editor`, `admin`, and `super_admin` against all tables and functions.

---

## Remaining Risks & Operational Notes

1. **In-Memory Rate Limiting:**
   - Current rate limiters use an in-memory cache. In a multi-instance serverless deployment, rate limiting state is per-instance. For enterprise multi-region scaling, back rate limiting with Redis (e.g., Upstash Redis).
2. **Storage CDN Cache Invalidation:**
   - Newly uploaded media files have cache headers. When replacing assets with identical names, ensure CDN cache purging is configured.
3. **MFA Enforcement:**
   - MFA factor checking is implemented in `/api/v1/auth/login`. Administrators must register TOTP factors via Supabase Auth settings to enable multi-factor enforcement.

---

## Manual Configuration Checklist

The following actions must be configured manually in external dashboards:

### 1. Supabase Dashboard Configuration

- [ ] **Disable Public Sign-ups:**
  - Navigate to **Authentication** > **Sign In / Up** > **Email**.
  - Toggle **"Enable Signups"** to **OFF** (prevents external registration).
- [ ] **Enforce Email Confirmations:**
  - In **Authentication** > **Providers** > **Email**, toggle **"Confirm email"** to **ON**.
- [ ] **Restrict Redirect URLs:**
  - Navigate to **Authentication** > **URL Configuration**.
  - Set **Site URL** to `https://admin.yourdomain.com`.
  - In **Redirect URLs**, whitelist ONLY `https://admin.yourdomain.com/**` (disallow `*` or wildcard domains).
- [ ] **Session & JWT Expiry:**
  - Under **Authentication** > **Sessions**, configure:
    - **JWT Expiry limit:** 3600 seconds (1 hour).
    - **Refresh Token Inactivity Expiry:** 7 days.
- [ ] **Enable Multi-Factor Authentication (MFA / TOTP):**
  - Navigate to **Authentication** > **MFA**.
  - Enable TOTP (Authenticator App) as an allowed factor.
- [ ] **Point-In-Time Recovery (PITR) & Backups:**
  - Under **Database** > **Backups**, ensure PITR or daily automated backups are enabled.
  - Document restore procedure: *In disaster scenarios, restore via the Supabase dashboard to a new target instance, then update `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`*.

### 2. Hosting & Deployment Configuration (Vercel / Cloudflare)

- [ ] **Environment Variables:**
  - Admin App: Configure `SUPABASE_SECRET_KEY`, `DEPLOY_HOOK_URL`, `SNAPSHOT_SIGNING_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Public Site: Configure `SNAPSHOT_URL` (signed URL or private endpoint) and `SNAPSHOT_SIGNING_SECRET`.
  - Ensure `SUPABASE_SECRET_KEY` and `SNAPSHOT_SIGNING_SECRET` are marked as sensitive and never exposed to client bundles.
- [ ] **Subdomain Separation:**
  - Public static site: `www.yourdomain.com` or `yourdomain.com`.
  - Admin portal: `admin.yourdomain.com` (isolated origin preventing cookie/localStorage sharing).
- [ ] **Admin Origin Restrictions (Cloudflare Access / WAF):**
  - If feasible, put `admin.yourdomain.com` behind Cloudflare Zero Trust (Access) or an IP allowlist restricting access to staff IP addresses or VPN.
- [ ] **Static Site Deployment Trigger:**
  - Configure the webhook from `DEPLOY_HOOK_URL` in your hosting platform (e.g., Vercel Deploy Hook) to trigger static regeneration whenever a release is published.

### 3. DNS & HTTPS Hardening

- [ ] **Enforce HTTPS & HSTS:**
  - Ensure SSL/TLS encryption mode is set to **Full (Strict)**.
  - Verify HSTS preload readiness (`max-age=63072000; includeSubDomains; preload`).
- [ ] **DNS CAA Records:**
  - Add CAA records restricting Certificate Authority issuance to your chosen provider (e.g., Let's Encrypt or DigiCert).
