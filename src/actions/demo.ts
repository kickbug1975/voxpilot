'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

const DEMO_ORG_ID = 'e6326d9c-df7c-4860-93a0-c65d6c8b9a11';
const DEMO_ORG_SLUG = 'demo-maree-belgique';

export async function loadDemoData() {
  try {
    const admin = createAdminClient();

    // 1. Verify organization exists (it should be created by seed.sql)
    const { data: org, error: orgError } = await admin
      .from('organizations')
      .select('id')
      .eq('id', DEMO_ORG_ID)
      .single();

    if (orgError || !org) {
      // If it doesn't exist, create it
      const { error: insertOrgError } = await admin.from('organizations').insert({
        id: DEMO_ORG_ID,
        name: 'Demo Maree Belgique',
        slug: DEMO_ORG_SLUG,
        country_code: 'BE',
        currency: 'EUR',
        timezone: 'Europe/Brussels',
        default_margin_rate: 0.20, // default target 20%
        default_rounding_rule: 'up_0_05',
        default_quote_validity_days: 14,
        cost_increase_alert_rate: 0.05,
        sales_can_view_costs: true,
        sales_can_override_floor: false,
      });

      if (insertOrgError) throw insertOrgError;
    }

    // 2. Clean up existing demo data
    await admin.from('customer_tags').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('tags').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('crm_events').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('tasks').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('activities').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('alerts').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('email_messages').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('quote_events').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('quote_items').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('quotes').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('contacts').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('customer_locations').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('price_snapshots').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('price_import_rows').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('price_imports').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('product_sales_prices').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('margin_rules').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('supplier_products').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('products').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('product_categories').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('suppliers').delete().eq('organization_id', DEMO_ORG_ID);
    await admin.from('customers').delete().eq('organization_id', DEMO_ORG_ID);

    // 2.1 Set up Demo Users
    const getOrCreateUser = async (email: string, fullName: string, role: 'owner' | 'admin' | 'manager' | 'sales' | 'viewer') => {
      const { data: { users }, error: listError } = await admin.auth.admin.listUsers();
      if (listError) throw listError;
      
      let user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      let userId: string;
      
      if (user) {
        userId = user.id;
      } else {
        const { data: createData, error: createError } = await admin.auth.admin.createUser({
          email,
          password: 'Bluemargin2026!',
          email_confirm: true,
        });
        if (createError) throw createError;
        userId = createData.user.id;
      }
      
      await admin.from('profiles').upsert({
        id: userId,
        full_name: fullName,
        locale: 'fr-BE',
        last_active_organization_id: DEMO_ORG_ID,
      });
      
      await admin.from('organization_memberships').upsert({
        organization_id: DEMO_ORG_ID,
        user_id: userId,
        role,
        status: 'active',
      });
      
      return userId;
    };

    const aliceId = await getOrCreateUser('alice@bluemargin.com', 'Alice Admin', 'owner');
    const marcId = await getOrCreateUser('marc@bluemargin.com', 'Marc Manager', 'manager');
    const dimitriId = await getOrCreateUser('dimitri@bluemargin.com', 'Dimitri Commercial', 'sales');
    const sophieId = await getOrCreateUser('sophie@bluemargin.com', 'Sophie Commerciale', 'sales');

    // 3. Create Suppliers
    const suppliers = [
      {
        id: 'a0000000-0000-0000-0000-000000000001',
        organization_id: DEMO_ORG_ID,
        name: 'OceanNord Import',
        code: 'SU-OCEAN',
        email: 'commandes@oceannord.com',
        phone: '+32 2 555 12 34',
        payment_terms: '30 jours fin de mois',
      },
      {
        id: 'a0000000-0000-0000-0000-000000000002',
        organization_id: DEMO_ORG_ID,
        name: 'Atlantique Frais',
        code: 'SU-ATL',
        email: 'logistique@atlantiquefrais.fr',
        phone: '+33 2 97 00 11 22',
        payment_terms: 'Paiement à réception',
      },
    ];

    const { error: supError } = await admin.from('suppliers').insert(suppliers);
    if (supError) throw supError;

    // 4. Create Customers
    const customers = [
      {
        id: 'b0000000-0000-0000-0000-000000000001',
        organization_id: DEMO_ORG_ID,
        legal_name: 'Brasserie du Centre',
        code: 'CU-BRAS-CENTRE',
        segment: 'horeca',
        primary_email: 'contact@brasserieducentre.be',
        phone: '+32 65 12 34 56',
        payment_terms: '30 jours',
        lifecycle_status: 'customer',
        potential_level: 'high',
        owner_user_id: dimitriId,
        customer_since: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
      {
        id: 'b0000000-0000-0000-0000-000000000002',
        organization_id: DEMO_ORG_ID,
        legal_name: 'Marché Gourmet',
        code: 'CU-MARCHE-GOURMET',
        segment: 'retail',
        primary_email: 'achats@marchegourmet.be',
        phone: '+32 81 98 76 54',
        payment_terms: 'Paiement à réception',
        lifecycle_status: 'customer',
        potential_level: 'strategic',
        owner_user_id: sophieId,
        customer_since: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
      {
        id: 'b0000000-0000-0000-0000-000000000003',
        organization_id: DEMO_ORG_ID,
        legal_name: 'Cuisine Collective Horizon',
        code: 'CU-CUIS-HORIZON',
        segment: 'collectivite',
        primary_email: 'direction@cuisinehorizon.be',
        phone: '+32 65 99 88 77',
        payment_terms: '45 jours fin de mois',
        lifecycle_status: 'customer',
        potential_level: 'high',
        owner_user_id: dimitriId,
        customer_since: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
      {
        id: 'b0000000-0000-0000-0000-000000000004',
        organization_id: DEMO_ORG_ID,
        legal_name: 'Hôtel des Ardennes',
        code: 'CU-HOTEL-ARDENNES',
        segment: 'horeca',
        primary_email: 'reception@hotelardennes.be',
        phone: '+32 87 11 22 33',
        payment_terms: '30 jours',
        lifecycle_status: 'qualified',
        potential_level: 'high',
        owner_user_id: dimitriId,
      },
      {
        id: 'b0000000-0000-0000-0000-000000000005',
        organization_id: DEMO_ORG_ID,
        legal_name: 'Poissonnerie du Parc',
        code: 'CU-POIS-PARC',
        segment: 'retail',
        primary_email: 'poissonnerieparc@outlook.be',
        phone: '+32 2 777 88 99',
        payment_terms: 'Paiement comptant',
        lifecycle_status: 'prospect',
        potential_level: 'medium',
        owner_user_id: sophieId,
      },
      {
        id: 'b0000000-0000-0000-0000-000000000006',
        organization_id: DEMO_ORG_ID,
        legal_name: 'Restaurant La Vague',
        code: 'CU-RESTO-VAGUE',
        segment: 'horeca',
        primary_email: 'lavague@scarlet.be',
        phone: '+32 50 88 77 66',
        payment_terms: 'Paiement à réception',
        lifecycle_status: 'dormant',
        potential_level: 'medium',
        owner_user_id: dimitriId,
      },
    ];

    const { error: custError } = await admin.from('customers').insert(customers);
    if (custError) throw custError;

    // 4.1 Create Customer Locations
    const locations = [
      {
        id: 'e0000000-0000-0000-0000-000000000001',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000001',
        name: 'Mons - Restaurant Principal',
        location_type: 'restaurant',
        address: { street: 'Grand Place 12', city: 'Mons', postal_code: '7000', country: 'Belgique' },
        is_primary: true,
        is_active: true,
      },
      {
        id: 'e0000000-0000-0000-0000-000000000002',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000002',
        name: 'Namur - Siège et Magasin',
        location_type: 'shop',
        address: { street: 'Rue de Fer 45', city: 'Namur', postal_code: '5000', country: 'Belgique' },
        is_primary: true,
        is_active: true,
      },
      {
        id: 'e0000000-0000-0000-0000-000000000003',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000003',
        name: 'Cuisine Centrale Mons',
        location_type: 'central_kitchen',
        address: { street: 'Avenue de l\'Industrie 8', city: 'Mons', postal_code: '7000', country: 'Belgique' },
        is_primary: true,
        is_active: true,
      },
      {
        id: 'e0000000-0000-0000-0000-000000000004',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000003',
        name: 'Adresse de Facturation Namur',
        location_type: 'billing',
        address: { street: 'Avenue Albert Ier 102', city: 'Namur', postal_code: '5000', country: 'Belgique' },
        is_primary: false,
        is_active: true,
      },
      {
        id: 'e0000000-0000-0000-0000-000000000005',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000004',
        name: 'Spa - Hôtel/Restaurant',
        location_type: 'hotel',
        address: { street: 'Avenue Royale 15', city: 'Spa', postal_code: '4900', country: 'Belgique' },
        is_primary: true,
        is_active: true,
      },
      {
        id: 'e0000000-0000-0000-0000-000000000006',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000005',
        name: 'Bruxelles - Magasin Parc',
        location_type: 'shop',
        address: { street: 'Avenue de Tervueren 220', city: 'Woluwe-Saint-Pierre', postal_code: '1150', country: 'Belgique' },
        is_primary: true,
        is_active: true,
      },
      {
        id: 'e0000000-0000-0000-0000-000000000007',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000006',
        name: 'Knokke - Restaurant de plage',
        location_type: 'restaurant',
        address: { street: 'Zeedijk 35', city: 'Knokke-Heist', postal_code: '8300', country: 'Belgique' },
        is_primary: true,
        is_active: true,
      },
    ];

    const { error: locError } = await admin.from('customer_locations').insert(locations);
    if (locError) throw locError;

    // 4.2 Create Contacts
    const contacts = [
      {
        id: 'd0000000-0000-0000-0000-000000000101',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000001',
        location_id: 'e0000000-0000-0000-0000-000000000001',
        first_name: 'Jean',
        last_name: 'Dupont',
        job_title: 'Chef cuisinier / Propriétaire',
        decision_role: 'chef',
        influence_level: 'high',
        email: 'j.dupont@brasserieducentre.be',
        phone: '+32 65 12 34 57',
        is_primary: true,
        is_active: true,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000102',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000001',
        location_id: 'e0000000-0000-0000-0000-000000000001',
        first_name: 'Marie',
        last_name: 'Lenoir',
        job_title: 'Comptable',
        decision_role: 'finance',
        influence_level: 'medium',
        email: 'm.lenoir@brasserieducentre.be',
        phone: '+32 65 12 34 58',
        is_primary: false,
        is_active: true,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000103',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000002',
        location_id: 'e0000000-0000-0000-0000-000000000002',
        first_name: 'Pierre',
        last_name: 'Martin',
        job_title: 'Directeur des Achats',
        decision_role: 'buyer',
        influence_level: 'high',
        email: 'p.martin@marchegourmet.be',
        phone: '+32 81 98 76 55',
        is_primary: true,
        is_active: true,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000104',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000002',
        location_id: 'e0000000-0000-0000-0000-000000000002',
        first_name: 'Lucie',
        last_name: 'Dubois',
        job_title: 'Responsable Rayon Poisson',
        decision_role: 'chef',
        influence_level: 'medium',
        email: 'l.dubois@marchegourmet.be',
        phone: '+32 81 98 76 56',
        is_primary: false,
        is_active: true,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000105',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000003',
        location_id: 'e0000000-0000-0000-0000-000000000003',
        first_name: 'Bernard',
        last_name: 'Lambert',
        job_title: 'Directeur Général',
        decision_role: 'decision_maker',
        influence_level: 'high',
        email: 'b.lambert@cuisinehorizon.be',
        phone: '+32 65 99 88 78',
        is_primary: true,
        is_active: true,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000106',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000003',
        location_id: 'e0000000-0000-0000-0000-000000000003',
        first_name: 'Sophie',
        last_name: 'Vandevelde',
        job_title: 'Acheteuse',
        decision_role: 'buyer',
        influence_level: 'medium',
        email: 's.vandevelde@cuisinehorizon.be',
        phone: '+32 65 99 88 79',
        is_primary: false,
        is_active: true,
      },
    ];

    const { error: contactError } = await admin.from('contacts').insert(contacts);
    if (contactError) throw contactError;

    // (Activities and Tasks moved lower to avoid FK constraint violations on Quotes)

    // 5. Create Product Category
    const categoryId = 'e0000000-0000-0000-0000-000000000010';
    const categories = [
      {
        id: categoryId,
        organization_id: DEMO_ORG_ID,
        name: 'Poissons et Crustacés',
        sort_order: 1,
      }
    ];

    const { error: catError } = await admin.from('product_categories').insert(categories);
    if (catError) throw catError;

    // 6. Create Products
    const products = [
      {
        id: 'c0000000-0000-0000-0000-000000000001',
        organization_id: DEMO_ORG_ID,
        name: 'Saumon Atlantique Pavé',
        internal_sku: 'PR-SAUMON-PAVE',
        barcode: '5412345678901',
        category_id: categoryId,
        sales_unit: 'kg',
        default_yield_rate: 0.92,
      },
      {
        id: 'c0000000-0000-0000-0000-000000000002',
        organization_id: DEMO_ORG_ID,
        name: 'Cabillaud Filet sans peau',
        internal_sku: 'PR-CABILLAUD-FILET',
        barcode: '5412345678902',
        category_id: categoryId,
        sales_unit: 'kg',
        default_yield_rate: 0.85,
      },
      {
        id: 'c0000000-0000-0000-0000-000000000003',
        organization_id: DEMO_ORG_ID,
        name: 'Crevettes Grises épluchées',
        internal_sku: 'PR-CREVETTE-GRIS',
        barcode: '5412345678903',
        category_id: categoryId,
        sales_unit: 'kg',
        default_yield_rate: 1.00,
      },
      {
        id: 'c0000000-0000-0000-0000-000000000004',
        organization_id: DEMO_ORG_ID,
        name: 'Scampi Décortiqués',
        internal_sku: 'PR-SCAMPI-DEC',
        barcode: '5412345678904',
        category_id: categoryId,
        sales_unit: 'kg',
        default_yield_rate: 0.95,
      },
      {
        id: 'c0000000-0000-0000-0000-000000000005',
        organization_id: DEMO_ORG_ID,
        name: 'Truite Portion Fraîche',
        internal_sku: 'PR-TRUITE-UNIT',
        barcode: '5412345678905',
        category_id: categoryId,
        sales_unit: 'unit',
        default_yield_rate: 1.00,
      },
      {
        id: 'c0000000-0000-0000-0000-000000000006',
        organization_id: DEMO_ORG_ID,
        name: 'Daurade Royale entière',
        internal_sku: 'PR-DAURADE-ENT',
        barcode: '5412345678906',
        category_id: categoryId,
        sales_unit: 'kg',
        default_yield_rate: 0.80,
      },
      {
        id: 'c0000000-0000-0000-0000-000000000007',
        organization_id: DEMO_ORG_ID,
        name: 'Bar de Ligne Filet',
        internal_sku: 'PR-BAR-FILET',
        barcode: '5412345678907',
        category_id: categoryId,
        sales_unit: 'kg',
        default_yield_rate: 0.85,
      },
      {
        id: 'c0000000-0000-0000-0000-000000000008',
        organization_id: DEMO_ORG_ID,
        name: 'Saumon Fumé Écosse Tranché',
        internal_sku: 'PR-SAUMON-FUME',
        barcode: '5412345678908',
        category_id: categoryId,
        sales_unit: 'box',
        default_yield_rate: 1.00,
      },
      {
        id: 'c0000000-0000-0000-0000-000000000009',
        organization_id: DEMO_ORG_ID,
        name: 'Noix de Saint-Jacques 10/20',
        internal_sku: 'PR-ST-JACQUES',
        barcode: '5412345678909',
        category_id: categoryId,
        sales_unit: 'kg',
        default_yield_rate: 1.00,
      },
      {
        id: 'c0000000-0000-0000-0000-000000000010',
        organization_id: DEMO_ORG_ID,
        name: 'Huîtres Creuses N°3 Creuses',
        internal_sku: 'PR-HUITRES-N3',
        barcode: '5412345678910',
        category_id: categoryId,
        sales_unit: 'box',
        default_yield_rate: 1.00,
      },
    ];

    const { error: prodError } = await admin.from('products').insert(products);
    if (prodError) throw prodError;

    // 7. Create Supplier-Product references
    const supplierProducts = [
      {
        id: 'd0000000-0000-0000-0000-000000000001',
        organization_id: DEMO_ORG_ID,
        product_id: 'c0000000-0000-0000-0000-000000000001',
        supplier_id: 'a0000000-0000-0000-0000-000000000001',
        supplier_sku: 'OCEAN-SAUM-12',
        purchase_unit: 'box_10kg',
        conversion_factor: 10,
        yield_rate: 0.92,
        current_purchase_price: 120.50,
        current_landed_cost: 13.50,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000002',
        organization_id: DEMO_ORG_ID,
        product_id: 'c0000000-0000-0000-0000-000000000001',
        supplier_id: 'a0000000-0000-0000-0000-000000000002',
        supplier_sku: 'ATL-SAUMON-PAV',
        purchase_unit: 'kg',
        conversion_factor: 1,
        yield_rate: 0.92,
        current_purchase_price: 13.10,
        current_landed_cost: 13.90,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000003',
        organization_id: DEMO_ORG_ID,
        product_id: 'c0000000-0000-0000-0000-000000000002',
        supplier_id: 'a0000000-0000-0000-0000-000000000001',
        supplier_sku: 'OCEAN-CABI-05',
        purchase_unit: 'kg',
        conversion_factor: 1,
        yield_rate: 0.85,
        current_purchase_price: 9.80,
        current_landed_cost: 10.40,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000004',
        organization_id: DEMO_ORG_ID,
        product_id: 'c0000000-0000-0000-0000-000000000003',
        supplier_id: 'a0000000-0000-0000-0000-000000000002',
        supplier_sku: 'ATL-CREV-GRIS',
        purchase_unit: 'tub_2kg',
        conversion_factor: 2,
        yield_rate: 1.00,
        current_purchase_price: 68.00,
        current_landed_cost: 36.00,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000005',
        organization_id: DEMO_ORG_ID,
        product_id: 'c0000000-0000-0000-0000-000000000004',
        supplier_id: 'a0000000-0000-0000-0000-000000000001',
        supplier_sku: 'OCEAN-SCAMPI',
        purchase_unit: 'kg',
        conversion_factor: 1,
        yield_rate: 0.95,
        current_purchase_price: 15.50,
        current_landed_cost: 16.80,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000006',
        organization_id: DEMO_ORG_ID,
        product_id: 'c0000000-0000-0000-0000-000000000005',
        supplier_id: 'a0000000-0000-0000-0000-000000000002',
        supplier_sku: 'ATL-TRUITE-UNIT',
        purchase_unit: 'box_5kg',
        conversion_factor: 5,
        yield_rate: 1.00,
        current_purchase_price: 12.25,
        current_landed_cost: 2.45,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000007',
        organization_id: DEMO_ORG_ID,
        product_id: 'c0000000-0000-0000-0000-000000000006',
        supplier_id: 'a0000000-0000-0000-0000-000000000001',
        supplier_sku: 'OCEAN-DAUR-ENT',
        purchase_unit: 'kg',
        conversion_factor: 1,
        yield_rate: 0.80,
        current_purchase_price: 10.56,
        current_landed_cost: 13.20,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000008',
        organization_id: DEMO_ORG_ID,
        product_id: 'c0000000-0000-0000-0000-000000000007',
        supplier_id: 'a0000000-0000-0000-0000-000000000001',
        supplier_sku: 'OCEAN-BAR-LIG',
        purchase_unit: 'kg',
        conversion_factor: 1,
        yield_rate: 0.85,
        current_purchase_price: 26.50,
        current_landed_cost: 31.18,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000009',
        organization_id: DEMO_ORG_ID,
        product_id: 'c0000000-0000-0000-0000-000000000008',
        supplier_id: 'a0000000-0000-0000-0000-000000000001',
        supplier_sku: 'OCEAN-SAUM-FUM',
        purchase_unit: 'box_1kg',
        conversion_factor: 1,
        yield_rate: 1.00,
        current_purchase_price: 19.50,
        current_landed_cost: 19.50,
      },
      {
        id: 'd0000000-0000-0000-0000-000000000010',
        organization_id: DEMO_ORG_ID,
        product_id: 'c0000000-0000-0000-0000-000000000009',
        supplier_id: 'a0000000-0000-0000-0000-000000000002',
        supplier_sku: 'ATL-JACQUES',
        purchase_unit: 'kg',
        conversion_factor: 1,
        yield_rate: 1.00,
        current_purchase_price: 32.00,
        current_landed_cost: 34.50,
      },
    ];

    const { error: spError } = await admin.from('supplier_products').insert(supplierProducts);
    if (spError) throw spError;

    // 8. Create Product Sales Prices
    const salesPrices = [
      { organization_id: DEMO_ORG_ID, product_id: 'c0000000-0000-0000-0000-000000000001', sales_price: 16.50, source: 'Tarif Général' },
      { organization_id: DEMO_ORG_ID, product_id: 'c0000000-0000-0000-0000-000000000002', sales_price: 13.50, source: 'Tarif Général' },
      { organization_id: DEMO_ORG_ID, product_id: 'c0000000-0000-0000-0000-000000000003', sales_price: 42.00, source: 'Tarif Général' },
      { organization_id: DEMO_ORG_ID, product_id: 'c0000000-0000-0000-0000-000000000004', sales_price: 19.80, source: 'Tarif Général' },
      { organization_id: DEMO_ORG_ID, product_id: 'c0000000-0000-0000-0000-000000000005', sales_price: 3.20, source: 'Tarif Général' },
      { organization_id: DEMO_ORG_ID, product_id: 'c0000000-0000-0000-0000-000000000006', sales_price: 22.00, source: 'Tarif Général' },
      { organization_id: DEMO_ORG_ID, product_id: 'c0000000-0000-0000-0000-000000000007', sales_price: 35.00, source: 'Tarif Général' },
      { organization_id: DEMO_ORG_ID, product_id: 'c0000000-0000-0000-0000-000000000008', sales_price: 26.00, source: 'Tarif Général' },
      { organization_id: DEMO_ORG_ID, product_id: 'c0000000-0000-0000-0000-000000000009', sales_price: 45.00, source: 'Tarif Général' },
      { organization_id: DEMO_ORG_ID, product_id: 'c0000000-0000-0000-0000-000000000010', sales_price: 33.00, source: 'Tarif Général' },
    ];

    const { error: salesError } = await admin.from('product_sales_prices').insert(salesPrices);
    if (salesError) throw salesError;

    // 9. Create Margin Rules
    const marginRules = [
      {
        id: 'e0000000-0000-0000-0000-000000000001',
        organization_id: DEMO_ORG_ID,
        scope: 'customer_product',
        customer_id: 'b0000000-0000-0000-0000-000000000001',
        product_id: 'c0000000-0000-0000-0000-000000000001',
        target_margin_rate: 0.15,
        priority: 4,
      },
      {
        id: 'e0000000-0000-0000-0000-000000000002',
        organization_id: DEMO_ORG_ID,
        scope: 'customer',
        customer_id: 'b0000000-0000-0000-0000-000000000002',
        target_margin_rate: 0.22,
        priority: 2,
      },
      {
        id: 'e0000000-0000-0000-0000-000000000003',
        organization_id: DEMO_ORG_ID,
        scope: 'organization_category',
        category_id: categoryId,
        target_margin_rate: 0.20,
        priority: 1,
      },
    ];

    const { error: ruleError } = await admin.from('margin_rules').insert(marginRules);
    if (ruleError) throw ruleError;

    // 10. Create Demo Price Import
    const priceImportId = 'aa000000-0000-0000-0000-000000000001';
    const priceImport = {
      id: priceImportId,
      organization_id: DEMO_ORG_ID,
      supplier_id: 'a0000000-0000-0000-0000-000000000001',
      file_name: 'tarif_oceannord_juin.xlsx',
      file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sheet_name: 'Tarifs Poissons',
      status: 'confirmed',
      total_rows: 5,
      valid_rows: 5,
      error_rows: 0,
      confirmed_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    };

    const { error: importError } = await admin.from('price_imports').insert(priceImport);
    if (importError) throw importError;

    // 11. Create Demo Price Snapshots
    const priceSnapshots = [
      {
        organization_id: DEMO_ORG_ID,
        supplier_product_id: 'd0000000-0000-0000-0000-000000000001',
        price_import_id: priceImportId,
        purchase_price: 120.50,
        base_unit_cost: 12.05,
        landed_cost: 13.50,
        is_active: true,
        effective_date: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().split('T')[0],
      },
    ];

    const { error: snapshotError } = await admin.from('price_snapshots').insert(priceSnapshots);
    if (snapshotError) throw snapshotError;

    // 12. Create Quotes
    const quotes = [
      {
        id: 'f0000000-0000-0000-0000-000000000001',
        organization_id: DEMO_ORG_ID,
        quote_number: 'BM-2026-00001',
        revision: 1,
        customer_id: 'b0000000-0000-0000-0000-000000000002',
        contact_id: 'd0000000-0000-0000-0000-000000000103',
        location_id: 'e0000000-0000-0000-0000-000000000002',
        contact_name: 'Pierre Martin',
        contact_email: 'p.martin@marchegourmet.be',
        title: 'Tarif Annuel Marée',
        status: 'accepted',
        issue_date: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString().split('T')[0],
        expires_at: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
        accepted_at: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
        currency: 'EUR',
        subtotal: 495.00,
        tax_total: 29.70,
        grand_total: 524.70,
        has_complete_quantities: true,
        sales_owner_id: sophieId,
      },
      {
        id: 'f0000000-0000-0000-0000-000000000002',
        organization_id: DEMO_ORG_ID,
        quote_number: 'BM-2026-00002',
        revision: 1,
        customer_id: 'b0000000-0000-0000-0000-000000000001',
        contact_id: 'd0000000-0000-0000-0000-000000000101',
        location_id: 'e0000000-0000-0000-0000-000000000001',
        contact_name: 'Jean Dupont',
        contact_email: 'j.dupont@brasserieducentre.be',
        title: 'Proposition Cabillaud & Crevettes',
        status: 'sent',
        issue_date: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString().split('T')[0],
        expires_at: new Date(Date.now() + 13 * 24 * 3600 * 1000).toISOString(),
        sent_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
        currency: 'EUR',
        subtotal: 165.00,
        tax_total: 9.90,
        grand_total: 174.90,
        has_complete_quantities: true,
        sales_owner_id: dimitriId,
      },
      {
        id: 'f0000000-0000-0000-0000-000000000003',
        organization_id: DEMO_ORG_ID,
        quote_number: 'BM-2026-00003',
        revision: 1,
        customer_id: 'b0000000-0000-0000-0000-000000000003',
        contact_id: 'd0000000-0000-0000-0000-000000000105',
        location_id: 'e0000000-0000-0000-0000-000000000003',
        contact_name: 'Bernard Lambert',
        contact_email: 'b.lambert@cuisinehorizon.be',
        title: 'Offre Saison Estivale',
        status: 'draft',
        issue_date: new Date().toISOString().split('T')[0],
        expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
        currency: 'EUR',
        has_complete_quantities: false,
        sales_owner_id: dimitriId,
      },
    ];

    const { error: quoteInsertError } = await admin.from('quotes').insert(quotes);
    if (quoteInsertError) throw quoteInsertError;

    // 13. Create Quote Items
    const quoteItems = [
      {
        organization_id: DEMO_ORG_ID,
        quote_id: 'f0000000-0000-0000-0000-000000000001',
        position: 1,
        product_id: 'c0000000-0000-0000-0000-000000000001',
        product_snapshot: { name: 'Saumon Atlantique Pavé', internal_sku: 'PR-SAUMON-PAVE', sales_unit: 'kg' },
        sales_unit: 'kg',
        quantity: 10,
        landed_cost_snapshot: 13.50,
        target_margin_rate: 0.20,
        pricing_rule_source: 'organization_category',
        recommended_price: 16.90,
        unit_price: 16.50,
        discount_rate: 0.00,
        net_unit_price: 16.50,
        margin_amount: 3.00,
        margin_rate: 0.1818,
        tax_rate: 0.06,
        line_subtotal: 165.00,
        override_justification: 'Volume négocié à l\'année',
      },
      {
        organization_id: DEMO_ORG_ID,
        quote_id: 'f0000000-0000-0000-0000-000000000001',
        position: 2,
        product_id: 'c0000000-0000-0000-0000-000000000002',
        product_snapshot: { name: 'Cabillaud Filet sans peau', internal_sku: 'PR-CABILLAUD-FILET', sales_unit: 'kg' },
        sales_unit: 'kg',
        quantity: 20,
        landed_cost_snapshot: 10.40,
        target_margin_rate: 0.22,
        pricing_rule_source: 'customer',
        recommended_price: 13.35,
        unit_price: 13.50,
        discount_rate: 0.00,
        net_unit_price: 13.50,
        margin_amount: 3.10,
        margin_rate: 0.2296,
        tax_rate: 0.06,
        line_subtotal: 270.00,
      },
      {
        organization_id: DEMO_ORG_ID,
        quote_id: 'f0000000-0000-0000-0000-000000000001',
        position: 3,
        product_id: 'c0000000-0000-0000-0000-000000000005',
        product_snapshot: { name: 'Truite Portion Fraîche', internal_sku: 'PR-TRUITE-UNIT', sales_unit: 'unit' },
        sales_unit: 'unit',
        quantity: 20,
        landed_cost_snapshot: 2.45,
        target_margin_rate: 0.20,
        pricing_rule_source: 'organization_category',
        recommended_price: 3.10,
        unit_price: 3.00,
        discount_rate: 0.00,
        net_unit_price: 3.00,
        margin_amount: 0.55,
        margin_rate: 0.1833,
        tax_rate: 0.06,
        line_subtotal: 60.00,
        override_justification: 'Alignement concurrentiel local',
      },
      {
        organization_id: DEMO_ORG_ID,
        quote_id: 'f0000000-0000-0000-0000-000000000002',
        position: 1,
        product_id: 'c0000000-0000-0000-0000-000000000001',
        product_snapshot: { name: 'Saumon Atlantique Pavé', internal_sku: 'PR-SAUMON-PAVE', sales_unit: 'kg' },
        sales_unit: 'kg',
        quantity: 10,
        landed_cost_snapshot: 13.50,
        target_margin_rate: 0.20,
        pricing_rule_source: 'organization_category',
        recommended_price: 16.90,
        unit_price: 16.50,
        discount_rate: 0.00,
        net_unit_price: 16.50,
        margin_amount: 3.00,
        margin_rate: 0.1818,
        tax_rate: 0.06,
        line_subtotal: 165.00,
        override_justification: 'Remise distributeur',
      },
      {
        organization_id: DEMO_ORG_ID,
        quote_id: 'f0000000-0000-0000-0000-000000000003',
        position: 1,
        product_id: 'c0000000-0000-0000-0000-000000000003',
        product_snapshot: { name: 'Crevettes Grises épluchées', internal_sku: 'PR-CREVETTE-GRIS', sales_unit: 'kg' },
        sales_unit: 'kg',
        quantity: null,
        landed_cost_snapshot: 36.00,
        target_margin_rate: 0.20,
        pricing_rule_source: 'organization_category',
        recommended_price: 45.00,
        unit_price: 42.00,
        discount_rate: 0.00,
        net_unit_price: 42.00,
        margin_amount: 6.00,
        margin_rate: 0.1428,
        tax_rate: 0.06,
        line_subtotal: null,
      },
    ];

    const { error: itemsError } = await admin.from('quote_items').insert(quoteItems);
    if (itemsError) throw itemsError;

    // 13.5 Create Activities and Tasks (placed here to avoid foreign key violations on Quotes)
    const occurredBase = new Date();
    const activities = [
      {
        id: 'a0000000-0000-0000-0000-000000000001',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000001',
        location_id: 'e0000000-0000-0000-0000-000000000001',
        contact_id: 'd0000000-0000-0000-0000-000000000101',
        activity_type: 'call',
        direction: 'outbound',
        subject: 'Appel de courtoisie',
        content: 'Client très satisfait des dernières livraisons de saumon. Prêt à renouveler l\'offre mensuelle.',
        outcome: 'successful',
        occurred_at: new Date(occurredBase.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 10,
        is_pinned: false,
        created_by: dimitriId,
        updated_by: dimitriId,
      },
      {
        id: 'a0000000-0000-0000-0000-000000000002',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000001',
        location_id: 'e0000000-0000-0000-0000-000000000001',
        contact_id: 'd0000000-0000-0000-0000-000000000101',
        activity_type: 'visit',
        direction: 'outbound',
        subject: 'Visite annuelle',
        content: 'Présentation des nouveaux tarifs. Intéressé par le cabillaud pavé. A demandé une offre chiffrée.',
        outcome: 'quote_requested',
        occurred_at: new Date(occurredBase.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 45,
        is_pinned: false,
        created_by: dimitriId,
        updated_by: dimitriId,
      },
      {
        id: 'a0000000-0000-0000-0000-000000000003',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000002',
        location_id: 'e0000000-0000-0000-0000-000000000002',
        contact_id: 'd0000000-0000-0000-0000-000000000103',
        activity_type: 'email',
        direction: 'outbound',
        subject: 'Envoi grille de prix',
        content: 'Grille tarifaire mise à jour envoyée suite à notre entretien téléphonique.',
        outcome: 'successful',
        occurred_at: new Date(occurredBase.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        is_pinned: false,
        created_by: sophieId,
        updated_by: sophieId,
      },
      {
        id: 'a0000000-0000-0000-0000-000000000004',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000002',
        location_id: 'e0000000-0000-0000-0000-000000000002',
        contact_id: 'd0000000-0000-0000-0000-000000000103',
        activity_type: 'call',
        direction: 'outbound',
        subject: 'Relance tarif',
        content: 'Tentative de relance, pas de réponse. Laissé un message sur le répondeur.',
        outcome: 'no_answer',
        occurred_at: new Date(occurredBase.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 2,
        is_pinned: false,
        created_by: sophieId,
        updated_by: sophieId,
      },
      {
        id: 'a0000000-0000-0000-0000-000000000005',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000003',
        location_id: 'e0000000-0000-0000-0000-000000000003',
        contact_id: 'd0000000-0000-0000-0000-000000000105',
        activity_type: 'product_test',
        direction: 'outbound',
        subject: 'Dégustation crevettes',
        content: 'Test concluant pour la crevette grise. Le produit correspond parfaitement au cahier des charges.',
        outcome: 'successful',
        occurred_at: new Date(occurredBase.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 30,
        is_pinned: false,
        created_by: dimitriId,
        updated_by: dimitriId,
      },
      {
        id: 'a0000000-0000-0000-0000-000000000006',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000006',
        location_id: 'e0000000-0000-0000-0000-000000000007',
        activity_type: 'note',
        direction: 'internal',
        subject: 'Note de suivi saisonnier',
        content: 'IMPORTANT: Le restaurant est fermé durant la saison hivernale. À relancer à partir de la mi-mars pour l\'ouverture de Pâques.',
        is_pinned: true,
        occurred_at: new Date(occurredBase.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(),
        created_by: dimitriId,
        updated_by: dimitriId,
      },
    ];

    const { error: actError } = await admin.from('activities').insert(activities);
    if (actError) throw actError;

    const tasks = [
      {
        id: 'a0000000-0000-0000-0000-000000000201',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000001',
        location_id: 'e0000000-0000-0000-0000-000000000001',
        contact_id: 'd0000000-0000-0000-0000-000000000101',
        title: 'Appeler Brasserie du Centre',
        description: 'Vérifier la réception du nouveau tarif et planifier la commande mensuelle.',
        task_type: 'call',
        priority: 'high',
        status: 'open',
        due_at: new Date(occurredBase.getFullYear(), occurredBase.getMonth(), occurredBase.getDate(), 14, 0, 0).toISOString(),
        assigned_to: dimitriId,
        created_by: dimitriId,
      },
      {
        id: 'a0000000-0000-0000-0000-000000000202',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000003',
        location_id: 'e0000000-0000-0000-0000-000000000003',
        contact_id: 'd0000000-0000-0000-0000-000000000105',
        title: 'Visiter Cuisine Collective Horizon',
        description: 'Présenter la truite fraîche portion et finaliser le contrat d\'approvisionnement.',
        task_type: 'visit',
        priority: 'normal',
        status: 'open',
        due_at: new Date(occurredBase.getFullYear(), occurredBase.getMonth(), occurredBase.getDate(), 16, 0, 0).toISOString(),
        assigned_to: dimitriId,
        created_by: dimitriId,
      },
      {
        id: 'a0000000-0000-0000-0000-000000000203',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000004',
        title: 'Relancer Hôtel des Ardennes (Retard)',
        description: 'Prendre des nouvelles suite à la proposition qualifiée de partenariat.',
        task_type: 'call',
        priority: 'urgent',
        status: 'open',
        due_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        assigned_to: dimitriId,
        created_by: dimitriId,
      },
      {
        id: 'a0000000-0000-0000-0000-000000000204',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000004',
        title: 'Dégustation Hôtel des Ardennes',
        description: 'Dégustation sur place avec le chef de cuisine.',
        task_type: 'meeting',
        priority: 'normal',
        status: 'open',
        due_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        assigned_to: dimitriId,
        created_by: dimitriId,
      },
      {
        id: 'a0000000-0000-0000-0000-000000000205',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000002',
        location_id: 'e0000000-0000-0000-0000-000000000002',
        contact_id: 'd0000000-0000-0000-0000-000000000103',
        title: 'Préparer offre Marché Gourmet',
        description: 'Préparation du chiffrage pour le Saumon Atlantique.',
        task_type: 'quote',
        priority: 'normal',
        status: 'completed',
        due_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        completed_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        completed_by: sophieId,
        outcome: 'Offre préparée et envoyée pour révision.',
        assigned_to: sophieId,
        created_by: sophieId,
      },
      {
        id: 'a0000000-0000-0000-0000-000000000206',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000002',
        contact_id: 'd0000000-0000-0000-0000-000000000103',
        location_id: 'e0000000-0000-0000-0000-000000000002',
        quote_id: 'f0000000-0000-0000-0000-000000000001',
        title: 'Relance Devis BM-2026-00001 (R1)',
        description: 'Tâche automatique de relance du devis BM-2026-00001.',
        task_type: 'quote_follow_up',
        priority: 'normal',
        status: 'completed',
        due_at: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
        completed_at: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
        completed_by: sophieId,
        outcome: 'Devis accepté par le client.',
        assigned_to: sophieId,
        created_by: sophieId,
        automation_key: 'quote-followup:f0000000-0000-0000-0000-000000000001:rev:1',
      },
      {
        id: 'a0000000-0000-0000-0000-000000000207',
        organization_id: DEMO_ORG_ID,
        customer_id: 'b0000000-0000-0000-0000-000000000001',
        contact_id: 'd0000000-0000-0000-0000-000000000101',
        location_id: 'e0000000-0000-0000-0000-000000000001',
        quote_id: 'f0000000-0000-0000-0000-000000000002',
        title: 'Relance Devis BM-2026-00002 (R1)',
        description: 'Tâche automatique de relance du devis BM-2026-00002.',
        task_type: 'quote_follow_up',
        priority: 'normal',
        status: 'open',
        due_at: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
        assigned_to: dimitriId,
        created_by: dimitriId,
        automation_key: 'quote-followup:f0000000-0000-0000-0000-000000000002:rev:1',
      }
    ];

    const { error: taskError } = await admin.from('tasks').insert(tasks);
    if (taskError) throw taskError;

    // 14. Create Quote Events
    const quoteEvents = [
      {
        organization_id: DEMO_ORG_ID,
        quote_id: 'f0000000-0000-0000-0000-000000000001',
        event_type: 'sent',
        actor_type: 'user',
        actor_name: 'Sophie Commerciale',
        occurred_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      },
      {
        organization_id: DEMO_ORG_ID,
        quote_id: 'f0000000-0000-0000-0000-000000000001',
        event_type: 'accepted',
        actor_type: 'customer',
        actor_name: 'Pierre Martin',
        metadata: { role: 'Acheteur', comment: 'Validé pour la saison, merci.', ip: '192.168.1.0', userAgent: 'Chrome on Windows' },
        occurred_at: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
      },
      {
        organization_id: DEMO_ORG_ID,
        quote_id: 'f0000000-0000-0000-0000-000000000002',
        event_type: 'sent',
        actor_type: 'user',
        actor_name: 'Dimitri Commercial',
        occurred_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
      },
    ];

    const { error: eventError } = await admin.from('quote_events').insert(quoteEvents);
    if (eventError) throw eventError;

    // 15. Create Alerts
    const alerts = [
      {
        organization_id: DEMO_ORG_ID,
        type: 'cost_increase',
        priority: 'high',
        status: 'unread',
        title: 'Hausse de coût importante : Saumon Atlantique Pavé',
        message: 'Le coût rendu du produit a augmenté de 12.5% (passant de 12.00 € à 13.50 €) pour le fournisseur OceanNord Import.',
        entity_type: 'supplier_products',
        entity_id: 'd0000000-0000-0000-0000-000000000001',
        metadata: { oldLandedCost: 12.00, newLandedCost: 13.50, increasePct: 0.125, supplierName: 'OceanNord Import', productName: 'Saumon Atlantique Pavé' },
      },
      {
        organization_id: DEMO_ORG_ID,
        type: 'below_margin',
        priority: 'medium',
        status: 'unread',
        title: 'Marge insuffisante : Crevettes Grises épluchées',
        message: 'La marge brute actuelle (14.3%) est inférieure à la marge cible de 20.0% pour la catégorie Poissons et Crustacés.',
        entity_type: 'products',
        entity_id: 'c0000000-0000-0000-0000-000000000003',
        metadata: { currentMargin: 0.1428, targetMargin: 0.20, salesPrice: 42.00, landedCost: 36.00 },
      },
      {
        organization_id: DEMO_ORG_ID,
        type: 'quote_accepted',
        priority: 'high',
        status: 'unread',
        title: 'Offre acceptée : Marché Gourmet',
        message: 'Le devis BM-2026-00001 a été accepté en ligne par Pierre Martin (Directeur des Achats).',
        entity_type: 'quotes',
        entity_id: 'f0000000-0000-0000-0000-000000000001',
        metadata: { clientName: 'Pierre Martin', quoteNumber: 'BM-2026-00001' },
      },
      {
        organization_id: DEMO_ORG_ID,
        type: 'below_margin',
        priority: 'high',
        status: 'unread',
        title: 'Marge faible détectée : Bar de Ligne Filet',
        message: 'Le coût rendu (31.18 €) est proche du prix de vente (35.00 €), entraînant une marge très faible (10.9%).',
        entity_type: 'products',
        entity_id: 'c0000000-0000-0000-0000-000000000007',
        metadata: { currentMargin: 0.109, targetMargin: 0.20, salesPrice: 35.00, landedCost: 31.18 },
      },
      {
        organization_id: DEMO_ORG_ID,
        type: 'cost_increase',
        priority: 'medium',
        status: 'unread',
        title: 'Hausse de coût : Noix de Saint-Jacques 10/20',
        message: 'Le coût rendu a augmenté de 6.2% pour le fournisseur Atlantique Frais.',
        entity_type: 'supplier_products',
        entity_id: 'd0000000-0000-0000-0000-000000000010',
        metadata: { oldLandedCost: 32.50, newLandedCost: 34.50, increasePct: 0.0615, supplierName: 'Atlantique Frais', productName: 'Noix de Saint-Jacques 10/20' },
      },
    ];

    const { error: alertError } = await admin.from('alerts').insert(alerts);
    if (alertError) throw alertError;

    // 16. Rebuild CRM caches
    const { CustomerCrmService } = await import('@/domain/crm/CustomerCrmService');
    const customerIds = [
      'b0000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000002',
      'b0000000-0000-0000-0000-000000000003',
      'b0000000-0000-0000-0000-000000000004',
      'b0000000-0000-0000-0000-000000000005',
      'b0000000-0000-0000-0000-000000000006'
    ];
    for (const cid of customerIds) {
      await CustomerCrmService.rebuildCustomerCrmCaches(admin, cid);
    }

    try {
      revalidatePath(`/${DEMO_ORG_SLUG}`);
      revalidatePath(`/${DEMO_ORG_SLUG}/suppliers`);
      revalidatePath(`/${DEMO_ORG_SLUG}/customers`);
      revalidatePath(`/${DEMO_ORG_SLUG}/products`);
      revalidatePath(`/${DEMO_ORG_SLUG}/quotes`);
      revalidatePath(`/${DEMO_ORG_SLUG}/margins`);
      revalidatePath(`/${DEMO_ORG_SLUG}/contacts`);
      revalidatePath(`/${DEMO_ORG_SLUG}/activities`);
      revalidatePath(`/${DEMO_ORG_SLUG}/tasks`);
      revalidatePath(`/${DEMO_ORG_SLUG}/agenda`);
    } catch (e) {}
    
    return { success: true };
  } catch (err) {
    console.error('Error loading demo data:', err);
    const message = err instanceof Error ? err.message : 'Impossible de charger les données de démonstration.';
    return { error: message };
  }
}
