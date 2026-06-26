import React, { useState, useRef, useEffect } from "react";

interface SearchableSelectProps {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = "Search...",
}) => {
    const [inputValue, setInputValue] = useState(value);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setInputValue(value);
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setInputValue(value);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [value]);

    const filtered = options.filter((o) =>
        o.toLowerCase().includes(inputValue.toLowerCase())
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        setIsOpen(true);
        if (e.target.value !== value) {
            onChange("");
        }
    };

    const handleSelect = (option: string) => {
        onChange(option);
        setInputValue(option);
        setIsOpen(false);
    };

    return (
        <div className="searchable-select" ref={containerRef}>
            <input
                type="text"
                className="form-input"
                value={inputValue}
                onChange={handleInputChange}
                onFocus={() => setIsOpen(true)}
                placeholder={placeholder}
                autoComplete="off"
            />
            {isOpen && filtered.length > 0 && (
                <div className="searchable-select-dropdown">
                    {filtered.map((option) => (
                        <div
                            key={option}
                            className={`searchable-select-option${option === value ? " selected" : ""}`}
                            onMouseDown={() => handleSelect(option)}
                        >
                            {option}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
