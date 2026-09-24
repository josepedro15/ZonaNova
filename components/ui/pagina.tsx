import type { ReactNode } from 'react';

export function Pagina({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 lg:gap-7 lg:px-12 lg:pb-14 lg:pt-9 ${className}`}>
            {children}
        </div>
    );
}
