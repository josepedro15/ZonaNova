import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

// eslint-config-next 16 já exporta flat config; não precisa de FlatCompat.
const config = [
    ...coreWebVitals,
    ...typescript,
    { ignores: ['.next/**', 'node_modules/**', 'supabase/**', 'design/**'] },
];

export default config;
