export function readString(buffer: Buffer, offset: { value: number }): string {
  const length = buffer[offset.value] & 0xff;
  offset.value += 1;
  
  if (length <= 0) return "";
  
  const bytes = buffer.subarray(offset.value, offset.value + length);
  offset.value += length;
  
  return bytes.toString('utf8');
}
