import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PdfQuote {
  quote_number: string;
  revision: number;
  issue_date: string;
  expires_at: string | null;
  customers: { legal_name: string; primary_email: string | null } | null;
  contact_name: string | null;
  contact_email: string | null;
  title: string;
  has_complete_quantities: boolean | null;
  subtotal: number | null;
  tax_total: number | null;
  grand_total: number | null;
  public_token_expires_at: string | null;
  public_note: string | null;
  terms: string | null;
}

interface PdfQuoteItem {
  position: number;
  product_snapshot: { name: string; internal_sku: string; barcode: string | null } | null;
  sales_unit: string | null;
  quantity: number | null;
  unit_price: number;
  discount_rate: number;
  line_subtotal: number | null;
  tax_rate: number | null;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    let quote: PdfQuote | null = null;
    let items: PdfQuoteItem[] = [];

    // 1. Fetch Quote and Items with security check
    if (token) {
      // Public Link access (token bypass)
      const crypto = await import('crypto');
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

      quote = qData as unknown as PdfQuote;

      const { data: iData, error: iError } = await adminClient
        .from('quote_items')
        .select('*')
        .eq('quote_id', id)
        .order('position', { ascending: true });

      if (iError) throw iError;
      items = (iData || []) as unknown as PdfQuoteItem[];
    } else {
      // Authenticated Workspace User access
      const supabase = await createClient();
      
      const { data: qData, error: qError } = await supabase
        .from('quotes')
        .select('*, customers(legal_name, primary_email)')
        .eq('id', id)
        .single();

      if (qError || !qData) {
        return new NextResponse('Devis introuvable ou accès non autorisé.', { status: 404 });
      }

      quote = qData as unknown as PdfQuote;

      const { data: iData, error: iError } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', id)
        .order('position', { ascending: true });

      if (iError) throw iError;
      items = (iData || []) as unknown as PdfQuoteItem[];
    }

    // 2. Generate PDF using jsPDF
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const primaryColor = [11, 31, 51]; // #0B1F33
    const textColor = [51, 65, 85]; // #334155
    const lightBg = [248, 250, 252]; // #F8FAFC
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = 25;

    // Header Logo & Brand
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('BlueMargin', margin, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Services de Cotations & Tarifs', margin, currentY + 5);

    // Right side: Quote metadata
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`Offre commerciale : ${quote.quote_number}`, pageWidth - margin, currentY, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.text(`Version : Révision ${quote.revision}`, pageWidth - margin, currentY + 5, { align: 'right' });
    doc.text(`Date d'émission : ${new Date(quote.issue_date).toLocaleDateString('fr-FR')}`, pageWidth - margin, currentY + 10, { align: 'right' });
    
    if (quote.expires_at) {
      doc.text(`Valable jusqu'au : ${new Date(quote.expires_at).toLocaleDateString('fr-FR')}`, pageWidth - margin, currentY + 15, { align: 'right' });
    }

    currentY += 24;

    // Customer details block
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.rect(margin, currentY, pageWidth - (margin * 2), 22, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('Client :', margin + 5, currentY + 6);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.text(quote.customers?.legal_name || 'Client', margin + 5, currentY + 11);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    if (quote.contact_name) {
      doc.text(`Contact : ${quote.contact_name}`, margin + 5, currentY + 16);
    }
    if (quote.contact_email) {
      doc.text(`Email : ${quote.contact_email}`, pageWidth - margin - 5, currentY + 11, { align: 'right' });
    }

    currentY += 30;

    // Title / Description
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(quote.title, margin, currentY);

    currentY += 7;

    // Render items table (NEVER show cost/margin columns!)
    const hasQuantities = quote.has_complete_quantities ?? true;
    
    const tableHeaders = hasQuantities
      ? [['Pos', 'Désignation', 'Unité', 'Quantité', 'Prix Unitaire HT', 'Remise', 'Total HT']]
      : [['Pos', 'Désignation', 'Unité', 'Prix Unitaire HT', 'TVA']];

    const tableRows = items.map((item) => {
      const discount = item.discount_rate ? `${(item.discount_rate * 100).toFixed(0)}%` : '0%';
      if (hasQuantities) {
        return [
          item.position,
          item.product_snapshot?.name || 'Produit',
          item.sales_unit || 'kg',
          item.quantity,
          `${item.unit_price.toFixed(2)} €`,
          discount,
          `${(item.line_subtotal || 0).toFixed(2)} €`,
        ];
      } else {
        const vat = item.tax_rate ? `${(item.tax_rate * 100).toFixed(0)}%` : '6%';
        return [
          item.position,
          item.product_snapshot?.name || 'Produit',
          item.sales_unit || 'kg',
          `${item.unit_price.toFixed(2)} €`,
          vat,
        ];
      }
    });

    autoTable(doc, {
      startY: currentY,
      head: tableHeaders,
      body: tableRows,
      margin: { left: margin, right: margin },
      theme: 'striped',
      headStyles: {
        fillColor: [11, 31, 51], // Brand dark blue
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [51, 65, 85],
      },
      columnStyles: hasQuantities ? {
        0: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 15, halign: 'center' },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 18, halign: 'center' },
        6: { cellWidth: 25, halign: 'right' },
      } : {
        0: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 35, halign: 'right' },
        4: { cellWidth: 20, halign: 'center' },
      },
    });

    const lastAutoTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
    let finalY = lastAutoTable.finalY + 10;

    // Totals block (only if all quantities are complete)
    if (hasQuantities && quote.subtotal) {
      if (finalY > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        finalY = 25;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);

      doc.text('Sous-total HT :', pageWidth - margin - 45, finalY);
      doc.text(`${quote.subtotal.toFixed(2)} €`, pageWidth - margin, finalY, { align: 'right' });
      
      finalY += 5.5;
      doc.text('TVA Informative :', pageWidth - margin - 45, finalY);
      doc.text(`${(quote.tax_total || 0).toFixed(2)} €`, pageWidth - margin, finalY, { align: 'right' });
      
      finalY += 7.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('Total TTC :', pageWidth - margin - 45, finalY);
      doc.text(`${(quote.grand_total || 0).toFixed(2)} €`, pageWidth - margin, finalY, { align: 'right' });
      
      finalY += 12;
    }

    // Public notes
    if (quote.public_note) {
      if (finalY > doc.internal.pageSize.getHeight() - 35) {
        doc.addPage();
        finalY = 25;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('Notes / Conditions particulières :', margin, finalY);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      const lines = doc.splitTextToSize(quote.public_note, pageWidth - (margin * 2));
      doc.text(lines, margin, finalY + 4.5);
      
      finalY += (lines.length * 4.5) + 10;
    }

    // General terms of sales
    if (quote.terms) {
      if (finalY > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage();
        finalY = 25;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('Conditions de règlement :', margin, finalY);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      const lines = doc.splitTextToSize(quote.terms, pageWidth - (margin * 2));
      doc.text(lines, margin, finalY + 4);
    }

    // Generate output buffer
    const pdfArrayBuffer = doc.output('arraybuffer');
    const pdfBuffer = Buffer.from(pdfArrayBuffer);

    const clientNameCleaned = (quote.customers?.legal_name || 'Client')
      .replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `BlueMargin_${quote.quote_number}_${clientNameCleaned}_Rev${quote.revision}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, max-age=60',
      },
    });

  } catch (err) {
    console.error('Error streaming quote PDF:', err);
    return new NextResponse('Une erreur est survenue lors de la génération du PDF.', { status: 500 });
  }
}
