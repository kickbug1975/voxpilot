import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import * as XLSX from 'xlsx';
import crypto from 'crypto';

interface XlsxQuote {
  quote_number: string;
  title: string;
  revision: number;
  issue_date: string;
  expires_at: string | null;
  customers: { legal_name: string; primary_email: string | null } | null;
  contact_name: string | null;
  contact_email: string | null;
  status: string;
  public_note: string | null;
  terms: string | null;
  public_token_expires_at: string | null;
  organization_id: string;
}

interface XlsxQuoteItem {
  position: number;
  product_snapshot: { name: string; internal_sku: string; barcode: string | null } | null;
  sales_unit: string | null;
  quantity: number | null;
  unit_price: number;
  discount_rate: number;
  line_subtotal: number | null;
  tax_rate: number | null;
  landed_cost_snapshot: number | null;
  target_margin_rate: number | null;
  recommended_price: number | null;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

function sanitizeCell(val: unknown): unknown {
  if (typeof val === 'string') {
    if (val.startsWith('=') || val.startsWith('+') || val.startsWith('-') || val.startsWith('@')) {
      return `'${val}`;
    }
  }
  return val;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const type = searchParams.get('type') || 'client'; // default to client

    let quote: XlsxQuote | null = null;
    let items: XlsxQuoteItem[] = [];
    let isInternalAllowed = false;

    // 1. Fetch Quote and Items with security check
    if (token) {
      // Public Link access (token bypass)
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const adminClient = createAdminClient();

      const { data: qData, error: qError } = await adminClient
        .from('quotes')
        .select('*, customers(legal_name, primary_email)')
        .eq('id', id)
        .eq('public_token_hash', tokenHash)
        .single();

      if (qError || !qData) {
        return new NextResponse('Devis non trouvé ou lien public expiré.', { status: 404 });
      }

      // Check token expiration
      if (qData.public_token_expires_at && new Date(qData.public_token_expires_at) < new Date()) {
        return new NextResponse('Ce lien public a expiré.', { status: 403 });
      }

      // Public token access cannot access internal data
      if (type === 'internal') {
        return new NextResponse('Accès non autorisé aux données internes.', { status: 403 });
      }

      quote = qData as unknown as XlsxQuote;

      const { data: iData, error: iError } = await adminClient
        .from('quote_items')
        .select('*')
        .eq('quote_id', id)
        .order('position', { ascending: true });

      if (iError) throw iError;
      items = (iData || []) as unknown as XlsxQuoteItem[];
    } else {
      // Authenticated Workspace User access
      const supabase = await createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return new NextResponse('Utilisateur non authentifié.', { status: 401 });
      }

      const { data: qData, error: qError } = await supabase
        .from('quotes')
        .select('*, customers(legal_name, primary_email)')
        .eq('id', id)
        .single();

      if (qError || !qData) {
        return new NextResponse('Devis introuvable ou accès non autorisé.', { status: 404 });
      }

      quote = qData as unknown as XlsxQuote;

      // Check org membership and roles
      const { data: membership, error: memError } = await supabase
        .from('organization_memberships')
        .select('role')
        .eq('organization_id', qData.organization_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (memError || !membership) {
        return new NextResponse('Accès non autorisé à cette organisation.', { status: 403 });
      }

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('sales_can_view_costs')
        .eq('id', qData.organization_id)
        .single();

      if (orgError || !org) {
        return new NextResponse('Organisation non trouvée.', { status: 404 });
      }

      const userRole = membership.role;
      isInternalAllowed = ['owner', 'admin', 'manager'].includes(userRole) || 
        ((userRole === 'sales' || userRole === 'viewer') && org.sales_can_view_costs === true);

      if (type === 'internal' && !isInternalAllowed) {
        return new NextResponse('Accès refusé : vous n\'avez pas les permissions pour voir les coûts et marges.', { status: 403 });
      }

      const { data: iData, error: iError } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', id)
        .order('position', { ascending: true });

      if (iError) throw iError;
      items = (iData || []) as unknown as XlsxQuoteItem[];
    }

    // 2. Generate XLSX Workbook
    const showInternal = type === 'internal' && isInternalAllowed;

    const metadataRows = [
      ['Devis', quote.quote_number],
      ['Titre', quote.title],
      ['Révision', quote.revision],
      ['Date d\'émission', quote.issue_date],
      ['Date d\'expiration', quote.expires_at || 'N/A'],
      ['Client', quote.customers?.legal_name || 'N/A'],
      ['Contact', quote.contact_name || 'N/A'],
      ['Email du contact', quote.contact_email || 'N/A'],
      ['Statut', quote.status],
      ['Notes publiques', quote.public_note || 'N/A'],
      ['Conditions', quote.terms || 'N/A']
    ];

    const tableHeaders = showInternal
      ? [
          'Position', 'Désignation', 'SKU', 'Unité', 'Quantité', 
          'Prix Unitaire HT (€)', 'Remise (%)', 'Prix Net HT (€)', 'Total HT (€)', 'Taux TVA (%)',
          'Coût de Revient HT (€)', 'Marge HT (€)', 'Taux de Marge (%)', 'Taux de Markup (%)', 
          'Marge Cible (%)', 'Prix Conseillé HT (€)', 'Dérogation (Marge < Cible)'
        ]
      : [
          'Position', 'Désignation', 'SKU', 'Unité', 'Quantité', 
          'Prix Unitaire HT (€)', 'Remise (%)', 'Prix Net HT (€)', 'Total HT (€)', 'Taux TVA (%)'
        ];

    const itemRows = items.map((item) => {
      const unitPrice = item.unit_price || 0;
      const discount = item.discount_rate || 0;
      const netUnitPrice = unitPrice * (1 - discount);
      const quantity = item.quantity || 0;
      const lineSubtotal = item.line_subtotal !== null ? item.line_subtotal : (netUnitPrice * quantity);
      const taxRate = item.tax_rate || 0;

      const basicCols = [
        item.position,
        item.product_snapshot?.name || 'Produit',
        item.product_snapshot?.internal_sku || 'N/A',
        item.sales_unit || 'kg',
        item.quantity,
        unitPrice,
        discount * 100,
        netUnitPrice,
        lineSubtotal,
        taxRate * 100
      ];

      if (showInternal) {
        const landedCost = item.landed_cost_snapshot || 0;
        const marginAmount = netUnitPrice - landedCost;
        const marginRate = netUnitPrice > 0 ? (marginAmount / netUnitPrice) * 100 : 0;
        const markupRate = landedCost > 0 ? (marginAmount / landedCost) * 100 : 0;
        const targetMargin = (item.target_margin_rate || 0) * 100;
        const recPrice = item.recommended_price || 0;
        const isBelowTarget = marginRate < targetMargin ? 'Oui' : 'Non';

        return [
          ...basicCols,
          landedCost,
          marginAmount,
          marginRate,
          markupRate,
          targetMargin,
          recPrice,
          isBelowTarget
        ];
      }

      return basicCols;
    });

    const rows = [
      ...metadataRows,
      [], // blank row
      tableHeaders,
      ...itemRows
    ];

    // Apply sanitization for CSV injection prevention (FR-SEC-002)
    const sanitizedRows = rows.map(row => row.map(cell => sanitizeCell(cell)));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sanitizedRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Devis');

    // Write workbook to a buffer
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const clientNameCleaned = (quote.customers?.legal_name || 'Client')
      .replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `BlueMargin_${quote.quote_number}_${clientNameCleaned}_Rev${quote.revision}.xlsx`;

    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, max-age=60',
      },
    });

  } catch (err) {
    console.error('Error generating quote XLSX:', err);
    return new NextResponse('Une erreur est survenue lors de la génération du XLSX.', { status: 500 });
  }
}
