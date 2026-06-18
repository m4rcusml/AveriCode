export type SearchParamValue = string | string[] | undefined;

export function firstSearchParamValue(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}
