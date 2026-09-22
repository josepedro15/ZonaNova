import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    reactStrictMode: true,
    // O token da instância nunca vai para o cliente; nada de NEXT_PUBLIC além
    // da URL e da anon key do Supabase.
    typedRoutes: true,
    // O `npm run tunel` expõe o dev server por um domínio *.trycloudflare.com.
    // Sem isto o Next 16 bloqueia os recursos de desenvolvimento vindos desse
    // domínio e a página abre sem JavaScript.
    allowedDevOrigins: ['*.trycloudflare.com'],
    // Nada de CSP de script aqui: o Next injeta scripts inline e uma política
    // errada deixaria a tela sem JavaScript. O que entra é o que não quebra
    // nada e fecha o óbvio: a tela de aprovação e a de papéis não podem ser
    // embutidas num iframe de outro site (clickjacking).
    async headers() {
        return [{
            source: '/:path*',
            headers: [
                { key: 'X-Frame-Options', value: 'DENY' },
                { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
            ],
        }];
    },
};

export default nextConfig;
