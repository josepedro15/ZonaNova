import { redirect } from 'next/navigation';

// O middleware decide o destino por papel e situação; aqui só encaminha.
export default function Home() {
    redirect('/dashboard');
}
