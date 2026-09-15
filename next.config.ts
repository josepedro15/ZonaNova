import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    reactStrictMode: true,
    // O token da instância nunca vai para o cliente; nada de NEXT_PUBLIC além
    // da URL e da anon key do Supabase.
    typedRoutes: true,
};

export default nextConfig;
