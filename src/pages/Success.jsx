import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import { CheckCircle2, Receipt } from 'lucide-react';
import ky from 'ky';
import { getTableSession } from '../utils/tableStore'; // 🚀 IMPORTAMOS O GERENCIADOR DA MESA

const Success = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // 🚀 A GRANDE SACADA: 
    // Tenta pegar o caminho direto da sessão ativa do cliente. 
    // Se ele não tiver sessão (ex: amigo pagando pelo link), usa o Post-it do localStorage.
    const session = getTableSession();
    const activePath = session ? `/${session.restaurantSlug}/${session.tableCode}` : null;
    const lastTablePath = activePath || localStorage.getItem('lastTablePath') || '/menu';

    const [countdown, setCountdown] = useState(10);
    const [paymentType, setPaymentType] = useState(null);
    const hasFired = useRef(false);

    useEffect(() => {
        const confirmPayment = async () => {
            const type = searchParams.get('type');
            setPaymentType(type || 'pool');

            if (hasFired.current) return;
            hasFired.current = true;

            const poolId = searchParams.get('pool_id');
            const amount = searchParams.get('amount');
            const name = searchParams.get('name');
            const userIdParam = searchParams.get('user_id');

            if (poolId && amount && name) {
                try {
                    const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4242';

                    // Proteção contra o Bug do NaN que crasha o Banco de Dados
                    const parsedUserId = parseInt(userIdParam);
                    const validUserId = isNaN(parsedUserId) ? null : parsedUserId;

                    await ky.post(`${BASE_URL}/api/pool/confirm`, {
                        json: {
                            poolId,
                            amount: parseFloat(amount),
                            contributorName: name,
                            userId: validUserId
                        }
                    });
                } catch (e) {
                    console.error('Erro invisível ao confirmar o pagamento no backend:', e);
                }
            }
        };

        confirmPayment();

        const type = searchParams.get('type');
        const redirectTo = type === 'direct' ? `${lastTablePath}/bill` : `${lastTablePath}/menu`;

        const interval = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    navigate(redirectTo);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [navigate, searchParams, lastTablePath]);

    const isDirect = paymentType === 'direct';

    return (
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#FAFAFA', p: 3, textAlign: 'center' }}>
            <Box sx={{ width: 80, height: 80, borderRadius: '50%', bgcolor: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                <CheckCircle2 size={48} color="#2e7d32" />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 900, mb: 1, color: '#1A1A1A' }}>Pagamento Confirmado!</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 400 }}>
                {isDirect ? 'Conta paga! Você ainda está na mesa. Aproveite o restante da sua visita!' : 'Sua parte da conta foi paga com sucesso. Muito obrigado e volte sempre!'}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
                <CircularProgress variant="determinate" value={(countdown / 10) * 100} size={24} sx={{ color: '#FF8C00' }} />
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#FF8C00' }}>
                    {isDirect ? `Voltando para a conta em ${countdown}s...` : `Redirecionando ao menu principal em ${countdown}s...`}
                </Typography>
            </Box>

            <Button
                variant="outlined" startIcon={isDirect ? <Receipt size={18} /> : undefined}
                onClick={() => navigate(isDirect ? `${lastTablePath}/bill` : `${lastTablePath}/menu`)}
                sx={{ borderRadius: 4, borderColor: '#DDD', color: '#666', textTransform: 'none', fontWeight: 700, px: 4 }}
            >
                {isDirect ? 'Ver Minha Conta' : 'Voltar Agora'}
            </Button>
        </Box>
    );
};

export default Success;