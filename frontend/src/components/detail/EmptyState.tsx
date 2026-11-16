const PlaceholderIcon: React.FC = () => (
  <svg
    className="w-8 h-8 text-dim"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
    />
  </svg>
);

export const EmptyState: React.FC<{
  title: string;
  message: string;
  isError?: boolean;
  error?: string;
}> = ({ title, message, isError, error }) => (
  <div className="h-full flex items-center justify-center">
    <div className="text-center">
      <div className="w-16 h-16 bg-surf2 rounded flex items-center justify-center mb-4 mx-auto">
        <PlaceholderIcon />
      </div>
      <h3 className="text-xl font-semibold text-tx mb-2">{title}</h3>
      <p className={isError ? "text-bad" : "text-dim"}>{message}</p>
      {error && <p className="text-bad">{error}</p>}
    </div>
  </div>
);