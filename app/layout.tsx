import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import './globals.css';

// next/font auto-hospeda: sem request para o Google em produção, sem salto de
// layout, e as fontes continuam disponíveis se a rede do cliente bloquear CDNs.
const display = Bricolage_Grotesque({
    subsets: ['latin'],
    weight: ['500', '600', '700'],
    variable: '--fonte-display',
    display: 'swap',
});

const corpo = Instrument_Sans({
    subsets: ['latin'],
    weight: ['400', '500', '600'],
    variable: '--fonte-corpo',
    display: 'swap',
});

export const metadata: Metadata = {
    title: 'Zona Nova · Análise de atendimento',
    description: 'Análise das conversas de WhatsApp da rede Zona Nova.',
    // Sistema interno: não deve aparecer em busca nenhuma.
    robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pt-BR" className={`${display.variable} ${corpo.variable}`}>
            <body>{children}</body>
        </html>
    );
}
