// #Toolbar — sample-file labels come from the filename extension.
export function sampleKind(name: string): 'CSV' | 'JSONL' {
  return name.toLowerCase().endsWith('.csv') ? 'CSV' : 'JSONL';
}
