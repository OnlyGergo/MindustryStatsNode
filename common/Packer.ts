export interface ApiError {
    code: string;
    message: string;
    details?: any;
}

// Envelope structure: [Success Status, Payload OR Error]
export type ApiResponsePacket =
    | [success: true, data: any[][], keys: string[]]
    | [success: false, error: ApiError];

export class ApiPacker {
    static pack<T extends object>(data: T[]): ApiResponsePacket {
        if (data.length === 0) {
            return [true, [], []]; // Return empty keys and values for empty data
        }

        // Union of every object's keys: optional fields (currentData on a server
        // with no fresh stats) are simply absent, and taking only the first
        // object's keys would drop that field from every row.
        const keySet = new Set<string>();
        for (const item of data) for (const key in item) keySet.add(key);
        const keys = [...keySet] as Array<keyof T>;

        // Map objects to arrays of values matching the key order
        const values = data.map(item =>
            keys.map(key => item[key])
        );

        return [true, values, keys as string[]];
    }

    static unpack<T>(packet: ApiResponsePacket): T[] {
        const [success, values, keys] = packet;

        if (!success) {
            const error = values as ApiError;
            throw new Error(`API Error: ${error.code} - ${error.message}`);
        }

        // Reconstruct the objects by mapping keys back to values
        return values.map(row => {
            const obj = {} as any;
            keys.forEach((key, index) => {
                obj[key] = row[index];
            });
            return obj as T; // Cast safely back to the expected Type
        });
    }
}