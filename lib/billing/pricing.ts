export const USD_NGN_RATE = 1400;
export const GATEWAY_FEE_RATE = 0.02;
export type ProductId = 'single_recap' | 'recap_pack_10';
export type Product = { id: ProductId; label: string; usdBase: number; recaps: number };
export const PRODUCTS: Record<ProductId, Product> = {
  single_recap: { id: 'single_recap', label: 'Single recap', usdBase: 1.99, recaps: 1 },
  recap_pack_10: { id: 'recap_pack_10', label: '10-recap pack', usdBase: 14.99, recaps: 10 },
};
export function priceProduct(productId: string) {
  const product = PRODUCTS[productId as ProductId];
  if (!product) return null;
  const baseNgn = Math.round(product.usdBase * USD_NGN_RATE);
  const feeNgn = Math.round(baseNgn * GATEWAY_FEE_RATE);
  return { ...product, rate: USD_NGN_RATE, baseNgn, feeNgn, totalNgn: baseNgn + feeNgn, currency: 'NGN' as const };
}
export function formatNaira(value: number) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);
}
