import React, { useState } from 'react';

interface ShareButtonProps {
    serverId: number;
    className?: string;
}

const ShareButton: React.FC<ShareButtonProps> = ({ serverId, className }) => {
    const [copied, setCopied] = useState(false);

    const handleShare = async () => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?serverId=${serverId}`;
        
        // Try native share first (works on mobile)
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Mindustry Server',
                    url: shareUrl
                });
                return;
            } catch {
                // User cancelled or share failed, fall back to clipboard
            }
        }
        
        // Fall back to clipboard
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <button
            onClick={handleShare}
            className={className}
            title="Share server link"
        >
            {copied ? (
                <>
                    <svg className="inline w-3.5 h-3.5 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                    </svg>
                    Copied!
                </>
            ) : (
                <>
                    <svg className="inline w-3.5 h-3.5 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"></path>
                    </svg>
                    Share
                </>
            )}
        </button>
    );
};

export default ShareButton;
