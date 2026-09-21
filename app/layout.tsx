import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Zona Nova · Análise de atendimento',
    description: 'Análise das conversas de WhatsApp da rede Zona Nova.',
    // Sistema interno: não deve aparecer em busca nenhuma.
    robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pt-BR">
            <body>{children}</body>
        </html>
    );
}
