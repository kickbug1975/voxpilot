import { getPriceForCustomerProduct } from '@/actions/portalPricing';

async function findClosestProduct(supabase: any, orgId: string, productName: string) {
  const cleanName = productName.trim();
  if (!cleanName) return null;

  // 1. Exact match (case insensitive)
  const { data: exact } = await supabase
    .from('products')
    .select('id, name, is_available, in_stock_ghlin')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .ilike('name', cleanName)
    .limit(1)
    .maybeSingle();

  if (exact) return exact;

  // 2. Substring match (e.g. "Saumon" -> "Saumon Atlantique")
  const { data: substring } = await supabase
    .from('products')
    .select('id, name, is_available, in_stock_ghlin')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .ilike('name', `%${cleanName}%`)
    .limit(1)
    .maybeSingle();

  if (substring) return substring;

  // 3. Split into words and try to match the first word that is long enough
  const words = cleanName.split(/\s+/).filter(w => w.length > 2);
  for (const word of words) {
    const { data: wordMatch } = await supabase
      .from('products')
      .select('id, name, is_available, in_stock_ghlin')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .ilike('name', `%${word}%`)
      .limit(1)
      .maybeSingle();
    if (wordMatch) return wordMatch;
  }

  return null;
}

async function findClosestCustomer(supabase: any, orgId: string, customerName: string) {
  const cleanName = customerName.trim();
  if (!cleanName) return null;

  // 1. Exact match (case insensitive)
  const { data: exact } = await supabase
    .from('customers')
    .select('id, legal_name')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .ilike('legal_name', cleanName)
    .limit(1)
    .maybeSingle();

  if (exact) return exact;

  // 2. Substring match
  const { data: substring } = await supabase
    .from('customers')
    .select('id, legal_name')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .ilike('legal_name', `%${cleanName}%`)
    .limit(1)
    .maybeSingle();

  if (substring) return substring;

  // 3. Word match
  const words = cleanName.split(/\s+/).filter(w => w.length > 2);
  for (const word of words) {
    const { data: wordMatch } = await supabase
      .from('customers')
      .select('id, legal_name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .ilike('legal_name', `%${word}%`)
      .limit(1)
      .maybeSingle();
    if (wordMatch) return wordMatch;
  }

  return null;
}

export async function performVoiceQueryLookup(
  validatedResult: any,
  orgId: string,
  supabase: any
): Promise<void> {
  if (validatedResult.action === 'query_stock') {
    const productName = validatedResult.data?.queryStockData?.productName;
    if (!productName) {
      validatedResult.data.content = "Nom de produit non spécifié.";
      return;
    }

    const product = await findClosestProduct(supabase, orgId, productName);
    if (!product) {
      validatedResult.data.content = `Produit "${productName}" non trouvé dans le catalogue.`;
      return;
    }

    const isAvailableStr = product.is_available ? 'disponible' : 'indisponible';
    const isGhlinStr = product.in_stock_ghlin ? 'Oui' : 'Non';
    validatedResult.data.content = `Le produit ${product.name} est ${isAvailableStr} (Stock Ghlin: ${isGhlinStr}).`;
  } else if (validatedResult.action === 'query_price') {
    const productName = validatedResult.data?.queryPriceData?.productName;
    const customerName = validatedResult.data?.queryPriceData?.customerName;

    if (!productName) {
      validatedResult.data.content = "Nom de produit non spécifié.";
      return;
    }

    const product = await findClosestProduct(supabase, orgId, productName);
    if (!product) {
      validatedResult.data.content = `Produit "${productName}" non trouvé dans le catalogue.`;
      return;
    }

    let customer = null;
    if (customerName) {
      customer = await findClosestCustomer(supabase, orgId, customerName);
    }

    if (customerName && !customer) {
      validatedResult.data.content = `Client "${customerName}" non trouvé.`;
      return;
    }

    const customerId = customer ? customer.id : '';
    const price = await getPriceForCustomerProduct(customerId, product.id, orgId);

    const formattedPrice = price.toFixed(2);
    const clientNameStr = customer ? customer.legal_name : 'Général';
    validatedResult.data.content = `Tarif ${product.name} pour ${clientNameStr} : ${formattedPrice} €/kg.`;
  }
}
