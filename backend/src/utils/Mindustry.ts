export function removeColors(text: string): string {
    if (text === null) return "null";
    return text.replace(/\[([a-zA-Z0-9#]*?)]/g, '');
}