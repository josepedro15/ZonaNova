import type { ReactNode } from 'react';

export function Pagina({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`flex w-full flex-col gap-5 px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pt-6 ${className}`}>
            {children}
        </div>
    );
}
