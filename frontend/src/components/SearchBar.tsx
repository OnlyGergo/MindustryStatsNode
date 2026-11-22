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
                placeholder="Search servers…"
                aria-label="Search servers"
                className="field pr-7"
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