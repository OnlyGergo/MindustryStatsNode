export function removeColorsFromMindustry(text: string | null): string | null {
    if (text === null) return null;
    return text.replace(/\[([a-zA-Z0-9#]*?)]/g, '');
}