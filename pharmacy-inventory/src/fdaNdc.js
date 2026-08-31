const FDA_NDC_ENDPOINT = 'https://api.fda.gov/drug/ndc.json'

const clean = (value) => (typeof value === 'string' ? value.trim() : '')

const formatIngredients = (ingredients = []) => ingredients
  .map((ingredient) => [clean(ingredient.name), clean(ingredient.strength)].filter(Boolean).join(' '))
  .filter(Boolean)
  .join('; ')

const mapRecord = (record) => {
  const packageRecord = record.packaging?.[0]
  const packageNdc = clean(packageRecord?.package_ndc)
  const productNdc = clean(record.product_ndc)

  return {
    id: packageNdc || productNdc || `${record.brand_name}-${record.labeler_name}`,
    ndc: packageNdc || productNdc,
    productNdc,
    packageDescription: clean(packageRecord?.description),
    brandName: clean(record.brand_name),
    genericName: clean(record.generic_name),
    ingredients: formatIngredients(record.active_ingredients),
    dosageForm: clean(record.dosage_form),
    route: Array.isArray(record.route) ? record.route.join(', ') : clean(record.route),
    labelerName: clean(record.labeler_name),
    marketingCategory: clean(record.marketing_category),
    listingStatus: clean(record.listing_status),
  }
}

export async function searchNdcDirectory(query, signal) {
  const value = clean(query)
  if (value.length < 2) return []

  const isNdc = /^[\d\s-]+$/.test(value)
  const normalized = value.replace(/[^\d]/g, '')
  const escapedValue = value.replace(/["\\]/g, '\\$&')
  const search = isNdc
    ? `(package_ndc:${normalized} OR product_ndc:${normalized} OR package_ndc:"${escapedValue}" OR product_ndc:"${escapedValue}")`
    : `(brand_name:"${escapedValue}" OR generic_name:"${escapedValue}" OR active_ingredients.name:"${escapedValue}")`
  const url = `${FDA_NDC_ENDPOINT}?search=${encodeURIComponent(search)}&limit=8`
  const response = await fetch(url, { signal })

  if (response.status === 404) return []
  if (!response.ok) throw new Error('The FDA directory could not be reached right now.')

  const payload = await response.json()
  return (payload.results || []).map(mapRecord)
}