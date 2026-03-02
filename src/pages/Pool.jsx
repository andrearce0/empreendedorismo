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
    ListItemAvatar,
    Avatar,
    Divider,
    Paper,
    CircularProgress,
    InputAdornment
} from '@mui/material';
import { CreditCard, ArrowLeft, HeartHandshake } from 'lucide-react';
import { getPool, startPoolCheckout } from '../utils/orderStore';
import { getCurrentUser } from '../utils/userStore';

const Pool = () => {
    const { poolId, restaurantSlug, tableId } = useParams();
    const navigate = useNavigate();
    const [pool, setPool] = useState(null);
    const [contributionAmount, setContributionAmount] = useState('');
    const [contributorName, setContributorName] = useState('');
    const [loading, setLoading] = useState(true);
    const [checkoutLoading, setCheckoutLoading] = useState(false);

    useEffect(() => {
        const fetchPool = async () => {
            const data = await getPool(poolId);
            if (data) setPool(data);
            setLoading(false);
        };
        fetchPool();
        const intervalId = setInterval(fetchPool, 10000); // Atualiza mais rápido (10s)
        return () => clearInterval(intervalId);
    }, [poolId]);

    const handleFillRemaining = () => {
        if (pool?.remainingAmount) {
            setContributionAmount(pool.remainingAmount.toFixed(2));
        }
    };

    const handleCheckout = async () => {
        const normalizedAmount = contributionAmount.toString().replace(',', '.');
        const parsedAmount = parseFloat(normalizedAmount);

        if (!parsedAmount || parsedAmount <= 0) return alert("Digite um valor válido");
        if (parsedAmount > pool.remainingAmount + 0.01) return alert(`Valor máximo é R$ ${pool.remainingAmount.toFixed(2)}`);
        if (!contributorName.trim()) return alert("Por favor, informe seu nome ou apelido.");

        const finalAmount = Math.ceil(parsedAmount * 100) / 100;

        setCheckoutLoading(true);
        try {
            const user = getCurrentUser();
            const basePath = window.location.pathname.split('/pool')[0];
            localStorage.setItem('lastTablePath', basePath);

            const { url } = await startPoolCheckout({
                poolId,
                amount: finalAmount,
                contributorName: contributorName,
                itemName: `Vaquinha da Mesa - #${poolId}`,
                userId: user?.id,
                restaurantSlug,
                tableId
            });
            window.location.href = url;
        } catch (err) {
            alert(`Erro no pagamento: ${err.message}`);
        } finally {
            setCheckoutLoading(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress sx={{ color: 'var(--primary)' }} /></Box>;

    if (!pool) {
        return (
            <Box sx={{ textAlign: 'center', mt: 10, px: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 900, mb: 1 }}>Ops!</Typography>
                <Typography variant="body1" sx={{ color: 'var(--text-muted)', mb: 3 }}>Esta vaquinha não existe mais ou já foi finalizada.</Typography>
                <Button variant="contained" startIcon={<ArrowLeft />} onClick={() => navigate(-1)} sx={{ bgcolor: 'var(--primary)', borderRadius: '16px', py: 1.5, px: 4, fontWeight: 900 }}>Voltar</Button>
            </Box>
        );
    }

    return (
        <Box sx={{ pb: 8 }}>
            <Button startIcon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} sx={{ color: 'var(--text-muted)', mb: 2, fontWeight: 800 }}>Voltar</Button>

            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 900, mb: 1, letterSpacing: -1 }}>Ajudar na Conta</Typography>
                <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>Sua mesa está dividindo o pagamento.</Typography>
            </Box>

            {pool.isPaid ? (
                <Paper elevation={0} sx={{ p: 4, borderRadius: '24px', bgcolor: '#E8F5E9', border: '1px solid #C8E6C9', textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ color: '#2E7D32', fontWeight: 900, mb: 1 }}>Meta Atingida! 🎉</Typography>
                    <Typography variant="body1" sx={{ color: '#2E7D32' }}>A conta da mesa já foi 100% paga.</Typography>
                </Paper>
            ) : (
                <>
                    <Card elevation={0} sx={{ p: 4, borderRadius: '24px', mb: 4, border: '2px solid var(--primary)', textAlign: 'center', bgcolor: '#FFF9F2' }}>
                        <Typography variant="caption" sx={{ color: 'var(--primary)', fontWeight: 900, letterSpacing: 1 }}>FALTA ARRECADAR</Typography>
                        <Typography variant="h2" sx={{ fontWeight: 900, color: 'var(--text-main)', my: 1 }}>
                            <span style={{ fontSize: '1.5rem', verticalAlign: 'middle', marginRight: '4px' }}>R$</span>
                            {(pool.remainingAmount || 0).toFixed(2)}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'var(--text-muted)', fontWeight: 600 }}>Total da Conta: R$ {(pool.totalAmount || 0).toFixed(2)}</Typography>
                    </Card>

                    <Card elevation={0} sx={{ p: 3, borderRadius: '24px', mb: 4, border: '1px solid var(--border-color)' }}>
                        <Stack spacing={2.5}>
                            <Typography variant="h6" sx={{ fontWeight: 900 }}>Sua Parte</Typography>

                            <TextField
                                label="Seu Nome ou Apelido"
                                fullWidth
                                value={contributorName}
                                onChange={(e) => setContributorName(e.target.value)}
                                InputProps={{ sx: { borderRadius: '16px', fontWeight: 700 } }}
                            />

                            <Box sx={{ position: 'relative' }}>
                                <TextField
                                    label="Valor que vai pagar"
                                    type="text"
                                    inputMode="decimal"
                                    fullWidth
                                    value={contributionAmount}
                                    onChange={(e) => setContributionAmount(e.target.value.replace(',', '.'))}
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start" sx={{ fontWeight: 900, color: 'var(--text-main)' }}>R$</InputAdornment>,
                                        sx: { borderRadius: '16px', fontWeight: 900, fontSize: '1.2rem', pb: 1.5 }
                                    }}
                                />
                                <Button
                                    size="small"
                                    onClick={handleFillRemaining}
                                    sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', borderRadius: '10px', fontWeight: 800, bgcolor: '#F0F0F0', color: 'var(--text-main)', '&:hover': { bgcolor: '#E0E0E0' } }}
                                >
                                    Pagar Restante
                                </Button>
                            </Box>

                            <Button
                                variant="contained"
                                fullWidth
                                disabled={checkoutLoading}
                                startIcon={checkoutLoading ? <CircularProgress size={20} color="inherit" /> : <CreditCard size={22} />}
                                onClick={handleCheckout}
                                sx={{ height: 60, fontSize: '1.1rem', bgcolor: 'var(--primary)', borderRadius: '16px', fontWeight: 900, '&:hover': { bgcolor: 'var(--primary-hover)' } }}
                            >
                                {checkoutLoading ? 'Redirecionando...' : 'Pagar Agora'}
                            </Button>
                        </Stack>
                    </Card>
                </>
            )}

            {/* QUEM JÁ PAGOU */}
            {pool.contributions.length > 0 && (
                <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 2, display: 'flex', alignItems: 'center', gap: 1, color: 'var(--text-muted)' }}>
                        <HeartHandshake size={20} /> Quem já fortaleceu
                    </Typography>
                    <List disablePadding sx={{ borderRadius: '20px', border: '1px solid var(--border-color)', bgcolor: 'var(--card-bg)', overflow: 'hidden' }}>
                        {pool.contributions.map((c, idx) => (
                            <React.Fragment key={idx}>
                                <ListItem sx={{ py: 2, px: 3 }}>
                                    <ListItemAvatar>
                                        <Avatar sx={{ bgcolor: 'var(--primary)', color: '#FFF', fontWeight: 900 }}>
                                            {(c.contributorName || 'A').charAt(0).toUpperCase()}
                                        </Avatar>
                                    </ListItemAvatar>
                                    <ListItemText
                                        primary={<Typography sx={{ fontWeight: 800 }}>{c.contributorName}</Typography>}
                                        secondary={<Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography>}
                                    />
                                    <Typography sx={{ fontWeight: 900, color: '#2E7D32', fontSize: '1.1rem' }}>+ R$ {(c.amount || 0).toFixed(2)}</Typography>
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