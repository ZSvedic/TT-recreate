// #Toolbar — sample-file labels come from the filename extension.
export function sampleLabel(name: string): 'CSV' | 'JSONL' {
  return name.toLowerCase().endsWith('.csv') ? 'CSV' : 'JSONL';
}
