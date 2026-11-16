import React from 'react';

interface SearchBarProps {
    onSearchValueChange: (value: string) => void;
    value: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearchValueChange, value }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onSearchValueChange(e.target.value);
    };

    const handleClear = () => {
        onSearchValueChange('');
    };

    return (
        <div className="relative flex-1">
            <input
                type="text"
                value={value}
                onChange={handleChange}
                placeholder="Search servers..."
                className="
                    w-full px-3 py-1 rounded
                    border border-bd
                    bg-surf
                    text-dim text-xs
                    focus:outline-none focus:border-acc
                    hover:bg-acc/18 hover:border-acc
                    transition-colors"
            />
            {value && (
                <button
                    onClick={handleClear}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-dim hover:text-tx text-xs"
                    aria-label="Clear"
                    tabIndex={0}
                >
                    &#10005;
                </button>
            )}
        </div>
    );
};

export default SearchBar;