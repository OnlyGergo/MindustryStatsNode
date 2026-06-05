import {useEffect, useState} from 'react';

export const useResponsive = () => {
    const [isMobile, setIsMobile] = useState<boolean>(false);

    useEffect(() => {
        const checkScreenSize = () => {
            setIsMobile(window.innerWidth < 950);
        };

        checkScreenSize();
        window.addEventListener('resize', checkScreenSize);

        return () => window.removeEventListener('resize', checkScreenSize);
    }, []);

    return { isMobile };
};