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
};

export default nextConfig;
