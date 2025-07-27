export const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
};

export const formatDateTime = (date: Date) => {
    return date.toLocaleString();
};