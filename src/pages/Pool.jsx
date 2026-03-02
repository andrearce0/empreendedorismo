import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Typography,
    Card,
    Stack,
    TextField,
    Button,
    List,
    ListItem,
    ListItemText,
    Divider,
    Paper,
    CircularProgress
} from '@mui/material';
import { Users2, CreditCard, ArrowLeft } from 'lucide-react';
import { getPool, startPoolCheckout } from '../utils/orderStore';
import { getCurrentUser } from '../utils/userStore';

const Pool = () => {
    const { poolId, restaurantSlug, tableId } = useParams();
    const navigate = useNavigate();
    const [pool, setPool] = useState(null);
    const [contributionAmount, setContributionAmount] = useState(''); // Renamed from 'amount'
    const [contributorName, setContributorName] = useState(''); // Renamed from 'name'
    const [loading, setLoading] = useState(true);
    const [checkoutLoading, setCheckoutLoading] = useState(false); // New state variable

    useEffect(() => {
        const fetchPool = async () => {
            const data = await getPool(poolId);
            if (data) {
                setPool(data);
            }
            setLoading(false);
        };
        fetchPool();

        const intervalId = setInterval(() => {
            fetchPool();
        }, 15000);

        return () => clearInterval(intervalId);
    }, [poolId]);

    const handleCheckout = async () => {
        // Normalizar: aceitar vírgula como separador decimal
        const normalizedAmount = contributionAmount.toString().replace(',', '.');
        const parsedAmount = parseFloat(normalizedAmount);

        if (!parsedAmount || parsedAmount <= 0) {
            alert("Valor inválido");
            return;
        }
        if (parsedAmount > pool.remainingAmount + 0.01) { // +0.01 de tolerância de float
            alert(`Valor máximo é R$ ${pool.remainingAmount.toFixed(2)}`);
            return;
        }
        if (!contributorName.trim()) {
            alert("Informe seu nome");
            return;
        }

        // Arredondar para 2 casas decimais antes de enviar
        const finalAmount = Math.ceil(parsedAmount * 100) / 100;

        setCheckoutLoading(true);
        try {
            const user = getCurrentUser();

            const basePath = window.location.pathname.split('/pool')[0];
            localStorage.setItem('lastTablePath', basePath)

            const { url } = await startPoolCheckout({
                poolId,
                amount: finalAmount,
                contributorName: contributorName || 'Anônimo',
                itemName: `Contribuição Mesa - Pool #${poolId}`,
                userId: user?.id,
                restaurantSlug,
                tableId
            });
            window.location.href = url;
        } catch (err) {
            console.error("Stripe Checkout Error:", err);
            alert(`Erro no pagamento: ${err.message}. Verifique se o servidor backend está rodando.`);
        } finally {
            setCheckoutLoading(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress color="inherit" /></Box>;

    if (!pool) {
        return (
            <Box sx={{ textAlign: 'center', mt: 10 }}>
                <Typography variant="h6">Pool não encontrada ou expirada.</Typography>
                <Button startIcon={<ArrowLeft />} onClick={() => navigate('/menu')} sx={{ mt: 2 }}>Voltar ao Menu</Button>
            </Box>
        );
    }

    return (
        <Box sx={{ pb: 4 }}>
            <Typography variant="h5" sx={{ fontWeight: 900, mb: 1 }}>
                Pool de Pagamento
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                ID: {pool.id}
            </Typography>

            <Card elevation={0} sx={{ p: 3, borderRadius: 4, mb: 3, border: '1px solid #F0F0F0', textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Valor Restante</Typography>
                <Typography variant="h3" sx={{ fontWeight: 900, color: '#FF8C00' }}>
                    R$ {(pool.remainingAmount || 0).toFixed(2)}
                </Typography>
                <Typography variant="body2" color="text.secondary">Total da Conta: R$ {(pool.totalAmount || 0).toFixed(2)}</Typography>
            </Card>

            {pool.isPaid ? (
                <Paper elevation={0} sx={{ p: 4, borderRadius: 4, bgcolor: '#e8f5e9', textAlign: 'center' }}>
                    <Typography variant="h6" sx={{ color: '#2e7d32', fontWeight: 800 }}>Mesa Paga! 🎉</Typography>
                    <Typography variant="body2" sx={{ color: '#2e7d32' }}>Obrigado pela preferência.</Typography>
                </Paper>
            ) : (
                <Card elevation={0} sx={{ p: 3, borderRadius: 4, mb: 3, border: '1px solid #F0F0F0' }}>
                    <Stack spacing={2}>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>Contribuir</Typography>
                        <TextField
                            label="Seu Nome"
                            fullWidth
                            value={contributorName}
                            onChange={(e) => setContributorName(e.target.value)}
                            size="small"
                        />
                        <TextField
                            label="Valor a Pagar (R$)"
                            type="text"
                            inputMode="decimal"
                            fullWidth
                            value={contributionAmount}
                            onChange={(e) => {
                                // Aceitar vírgula ou ponto como decimal
                                let raw = e.target.value.replace(',', '.');
                                // Permitir digitação livre (incluindo strings como "10.")
                                // mas validar ao sair do campo (onBlur)
                                setContributionAmount(raw);
                            }}
                            onBlur={() => {
                                // Ao sair do campo: normalizar e truncar a 2 casas decimais
                                let raw = contributionAmount.replace(',', '.');
                                let val = parseFloat(raw);
                                if (isNaN(val) || val <= 0) {
                                    setContributionAmount('');
                                    return;
                                }
                                // Truncar para 2 casas decimais (Math.ceil na 2ª casa)
                                val = Math.ceil(val * 100) / 100;
                                // Não pode ultrapassar o valor disponível
                                if (val > pool.remainingAmount) {
                                    val = Math.floor(pool.remainingAmount * 100) / 100;
                                }
                                setContributionAmount(val.toFixed(2));
                            }}
                            size="small"
                            placeholder={`Máx R$ ${(pool.remainingAmount || 0).toFixed(2)}`}
                            helperText="Use ponto ou vírgula para decimais (ex: 10,50 ou 10.50)"
                        />
                        <Button
                            variant="contained"
                            fullWidth
                            size="large"
                            disabled={checkoutLoading}
                            startIcon={checkoutLoading ? <CircularProgress size={20} color="inherit" /> : <CreditCard size={20} />}
                            onClick={handleCheckout}
                            sx={{
                                bgcolor: '#FF8C00',
                                height: 50,
                                fontWeight: 800,
                                '&:hover': { bgcolor: '#E67E00' }
                            }}
                        >
                            {checkoutLoading ? 'Processando...' : 'Pagar Minha Parte'}
                        </Button>
                    </Stack>
                </Card>
            )}

            {pool.contributions.length > 0 && (
                <Box sx={{ mt: 4 }}>
                    <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Users2 size={24} color="#FF8C00" /> Contribuições
                    </Typography>
                    <List dense sx={{ bgcolor: 'background.paper', borderRadius: 4, border: '1px solid #F0F0F0' }}>
                        {pool.contributions.map((c, idx) => (
                            <React.Fragment key={idx}>
                                <ListItem sx={{ py: 1.5 }}>
                                    <ListItemText
                                        primary={<Typography sx={{ fontWeight: 700 }}>{c.contributorName}</Typography>}
                                        secondary={new Date(c.timestamp).toLocaleTimeString()}
                                    />
                                    <Typography sx={{ fontWeight: 800, color: '#2e7d32' }}>+ R$ {(c.amount || 0).toFixed(2)}</Typography>
                                </ListItem>
                                {idx < pool.contributions.length - 1 && <Divider />}
                            </React.Fragment>
                        ))}
                    </List>
                </Box>
            )}
        </Box>
    );
};

export default Pool;
