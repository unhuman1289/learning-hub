const stop = new Set(['the','and','for','with','der','die','das','und','mit','von','ist','ein','eine','fur','cua','cho','voi','trong','nhung','mot','khi','lam','nhu','nay']);

export function terms(value: string, limit = 80): string[] {
  const normalized = value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replaceAll('đ', 'd').replaceAll('ß', 'ss');
  return [...new Set((normalized.match(/[\p{L}\p{N}]{2,32}/gu) ?? []).filter(word => !stop.has(word)))].slice(0, limit);
}
