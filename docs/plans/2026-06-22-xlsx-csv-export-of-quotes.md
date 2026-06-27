# XLSX/CSV Quote Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement client-facing and internal-facing XLSX/CSV export of quotes with strict role-based/organization preference checks and CSV injection neutralization.

**Architecture:** 
1. Create a Next.js API route at `src/app/api/quotes/[id]/xlsx/route.ts` that uses SheetJS (`xlsx`) to build and stream an XLSX file.
2. Check authorization: public access via token (only client data) vs authenticated user (based on role and org preference).
3. Escape cell contents beginning with dangerous formula characters (`=`, `+`, `-`, `@`) with a leading `'`.
4. Add action buttons on Quote Details Client Page and Public Quote View Client Page.

**Tech Stack:** Next.js (App Router), Supabase SSR, SheetJS (xlsx), Vitest.

---

### Task 1: Create failing tests for quote export permissions, structure, and injection neutralization

**Files:**
- Create: `tests/quote-export.test.ts`

**Step 1: Write the failing test**
Create a test suite mocking Supabase database queries and auth state to check:
1. `GET` with valid public token and `type=client` succeeds and returns client-facing headers (excluding cost/margins).
2. `GET` with valid public token and `type=internal` returns 403 Forbidden.
3. `GET` authenticated with manager role and `type=internal` returns internal-facing headers (including cost/margins).
4. `GET` authenticated with sales role and `type=internal` returns 403 when `sales_can_view_costs` is false, and 200 when `sales_can_view_costs` is true.
5. Cells starting with `=`, `+`, `-`, or `@` are escaped with `'` in the generated workbook to protect against CSV/XLSX injection.

**Step 2: Run test to verify it fails**
Run: `npx vitest run tests/quote-export.test.ts`
Expected: Fail (imports fail or route does not exist / 404).

---

### Task 2: Create the API Route at `src/app/api/quotes/[id]/xlsx/route.ts`

**Files:**
- Create: `src/app/api/quotes/[id]/xlsx/route.ts`

**Step 1: Implement authorization checks, security hashes, and queries**
1. Read `id` from params.
2. Read `token` and `type` (client/internal) from search params.
3. If public token is provided:
   - Compute SHA-256 hash.
   - Retrieve quote and check expiration/validity.
   - If `type === 'internal'`, return 403.
4. If authenticated workspace user:
   - Get user and active organization membership.
   - Verify access to the organization.
   - If `type === 'internal'`, verify role / org settings (`sales_can_view_costs` boolean). If not allowed, return 403.
5. Retrieve quote items sorted by position.

**Step 2: Format and construct the SheetJS workbook**
1. Prepend cell contents starting with `=`, `+`, `-`, `@` with a single quote `'`.
2. Format quote headers (metadata, customer, dates) and the item list.
3. Include internal fields (landed cost, margins, targets) only for authorized internal requests.
4. Export Workbook using `XLSX.write` with `{ type: 'buffer', bookType: 'xlsx' }`.
5. Return NextResponse with correct headers (content-type and disposition).

**Step 3: Run tests to verify they pass**
Run: `npx vitest run tests/quote-export.test.ts`
Expected: Pass.

---

### Task 3: Integrate XLSX download action in Quote Details page

**Files:**
- Modify: `src/app/(app)/[orgSlug]/quotes/[id]/QuoteDetailsClient.tsx`

**Step 1: Check permissions on frontend**
1. Determine if current user can view costs based on role and organization preferences.
2. Render "Télécharger en XLSX" action. If they can view costs, present a dropdown or separate actions for "XLSX Client" and "XLSX Interne". If not, only show "XLSX Client".

**Step 2: Add client-side download handlers**
1. Call `/api/quotes/${quoteId}/xlsx?type=client` (and `?type=internal` if allowed).
2. Create temporary anchor element to trigger browser file download.

---

### Task 4: Integrate XLSX download action in Public Quote page

**Files:**
- Modify: `src/app/q/[token]/PublicQuoteViewClient.tsx`

**Step 1: Add a download button on public page**
1. Add a button next to other actions (like PDF download).
2. Call `/api/quotes/${quote.id}/xlsx?token=${token}&type=client`.
3. Trigger download.

---

### Task 5: Run typechecks and full test suite

**Step 1: Run typecheck**
Run: `npm run typecheck`
Expected: Pass without errors.

**Step 2: Run all tests**
Run: `npm test`
Expected: All tests pass.
