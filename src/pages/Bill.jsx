import React, { useState, useEffect } from 'react';
import ky from 'ky';
import {
    Typography,
    Box,
    List,
    ListItem,
    ListItemText,
    Divider,
    Stack,
    Button,
    Slider,
    TextField,
    Paper,
    Card,
    InputAdornment,
    IconButton,
    Snackbar,
    Alert,
    Chip,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Tooltip,
    Checkbox,
    FormControlLabel,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from '@mui/material';
import { CreditCard, Users2, Copy, Share2, QrCode, LogOut, ChevronDown, Trash2, CheckCircle, Clock, Receipt } from 'lucide-react';
import { getOrders, createPool, getPoolBySession, getAllPools, removePoolItem, startPoolCheckout } from '../utils/orderStore';
import { getTableSession, clearTableSession } from '../utils/tableStore';
import { getCurrentUser } from '../utils/userStore';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate, useParams } from 'react-router-dom';

const Bill = () => {
    const navigate = useNavigate();

    const { restaurantSlug, tableId } = useParams();
    const basePath = `/${restaurantSlug || 'demo'}${tableId ? `/${tableId}` : ''}`;

    const [orders, setOrders] = useState([]);
    const [waiterTipPercent, setWaiterTipPercent] = useState(10);
    const [myPayment, setMyPayment] = useState('');
    const [pool, setPool] = useState(null);          // pool PENDENTE ativa
    const [allPools, setAllPools] = useState([]);    // histórico de todas as pools
    const [openSnackbar, setOpenSnackbar] = useState(false);
    const [snackMsg, setSnackMsg] = useState('');
    const [selectedItemIds, setSelectedItemIds] = useState([]); // IDs dos itens selecionados para a próxima pool/pagamento
    const [isFirstLoad, setIsFirstLoad] = useState(true);
    const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

    // IDs dos itens que já estão em pools CAPTURADO (pagas) — excluídos da conta
    const paidItemIds = allPools
        .filter(p => p.status === 'CAPTURADO')
        .flatMap(p => p.items?.map(i => i.orderItemId) ?? []);

    useEffect(() => {
        const fetchData = async () => {
            const session = getTableSession();
            if (!session) return;

            const [allOrders, existingPool, poolHistory] = await Promise.all([
                getOrders(session.sessionId),
                getPoolBySession(session.sessionId),
                getAllPools(session.sessionId)
            ]);

            setOrders(allOrders);
            setPool(existingPool);
            setAllPools(poolHistory);

            // Sincronizar selectedItemIds com a pool ativa se ela existir
            if (existingPool) {
                setSelectedItemIds(existingPool.items?.map(i => i.orderItemId) || []);
            } else if (isFirstLoad && allOrders.length > 0) {
                // Seleção padrão: todos os itens ativos (que não foram pagos)
                const activeIds = allOrders
                    .filter(o => o.status !== 'Cancelado' && !paidItemIds.includes(o.orderItemId))
                    .map(o => o.orderItemId);
                if (activeIds.length > 0) {
                    setSelectedItemIds(activeIds);
                    setIsFirstLoad(false);
                }
            }
        };

        fetchData();

        const intervalId = setInterval(fetchData, 15000);
        return () => clearInterval(intervalId);
    }, [isFirstLoad, paidItemIds.length]);

    // Itens ativos: excluir Cancelados e já pagos
    const activeOrders = orders.filter(o =>
        o.status !== 'Cancelado' &&
        !paidItemIds.includes(o.orderItemId)
    );

    // Itens selecionados para a Pool/Pagamento atual
    const selectedOrders = activeOrders.filter(o => selectedItemIds.includes(o.orderItemId));

    const subtotal = selectedOrders.reduce((acc, item) =>
        acc + (parseFloat(item.finalPrice ?? item.price ?? 0) * (item.quantity ?? item.quantidade ?? 1)), 0);
    const waiterTip = subtotal * (waiterTipPercent / 100);
    const appTax = subtotal * 0.03; // Taxa do app fixada em 3%
    const total = subtotal + waiterTip + appTax;

    const handleToggleItemSelection = async (itemId) => {
        if (!pool) {
            // Seleção local apenas
            setSelectedItemIds(prev =>
                prev.includes(itemId)
                    ? prev.filter(id => id !== itemId)
                    : [...prev, itemId]
            );
        } else {
            // Sincronizar com pool do backend em tempo real
            try {
                if (selectedItemIds.includes(itemId)) {
                    await removePoolItem(pool.id, itemId);
                } else {
                    const session = getTableSession();
                    // Adicionamos o item à pool existente chamando createPool (o backend trata o vínculo se já houver PENDENTE)
                    await createPool(0, 0, session.sessionId, [itemId]);
                }
                // Refresh data
                const session = getTableSession();
                const [updatedPool, updatedHistory] = await Promise.all([
                    getPoolBySession(session.sessionId),
                    getAllPools(session.sessionId)
                ]);
                setPool(updatedPool);
                setAllPools(updatedHistory);
            } catch (e) {
                alert('Erro ao atualizar pool: ' + e.message);
            }
        }
    };

    const handleCreatePool = async () => {
        const payAmount = parseFloat(myPayment) || 0;
        if (payAmount >= total && total > 0) {
            alert("Para pagar o valor total, use o botão 'Pagar Integral'");
            return;
        }
        const session = getTableSession();
        if (!session) {
            alert('Não há mesa vinculada.');
            return;
        }
        try {
            // Passar os IDs dos itens SELECIONADOS para vincular à pool
            const orderItemIds = selectedItemIds.filter(Boolean);
            if (orderItemIds.length === 0) {
                alert('Selecione pelo menos um item para criar a pool.');
                return;
            }
            const newPool = await createPool(total, payAmount, session.sessionId, orderItemIds);
            setPool(newPool);
            // Atualizar histórico de pools
            const updatedHistory = await getAllPools(session.sessionId);
            setAllPools(updatedHistory);
            setSnackMsg('Pool criada/retomada com sucesso!');
            setOpenSnackbar(true);
        } catch (e) {
            alert(e.message || 'Erro ao criar Pool.');
        }
    };

    const handleRemoveItemFromPool = async (poolId, orderItemId) => {
        try {
            await removePoolItem(poolId, orderItemId);
            const session = getTableSession();
            if (session) {
                const [updatedPool, updatedHistory] = await Promise.all([
                    getPoolBySession(session.sessionId),
                    getAllPools(session.sessionId)
                ]);
                setPool(updatedPool);
                setAllPools(updatedHistory);
            }
            setSnackMsg('Item removido da pool.');
            setOpenSnackbar(true);
        } catch (e) {
            alert(e.message || 'Erro ao remover item da pool.');
        }
    };

    const handleStripeCheckout = async () => {
        const session = getTableSession();
        const user = getCurrentUser();

        if (!session) {
            alert('Não há mesa vinculada.');
            return;
        }

        if (selectedOrders.length === 0) {
            alert('Não há itens selecionados para pagar.');
            return;
        }

        try {
            // PASSO 1: Criar uma pool com os itens SELECIONADOS (Freeze)
            const orderItemIds = selectedItemIds.filter(Boolean);
            const newPool = await createPool(total, total, session.sessionId, orderItemIds);

            // PASSO 2: Iniciar checkout Stripe usando essa nova pool
            const { url } = await startPoolCheckout({
                poolId: newPool.id,
                amount: total,
                contributorName: user?.nome_completo || 'Cliente Integral',
                itemName: `Pagamento Integral Mesa ${session.tableIdentifier}`,
                userId: user?.id,
                type: 'direct', // Indica para o Success.jsx o redirecionamento
                restaurantSlug,
                tableId
            });

            window.location.href = url;
        } catch (err) {
            console.error("Stripe Checkout Error:", err);
            alert(`Erro no pagamento: ${err.message}.`);
        }
    };

    const poolUrl = pool ? `${window.location.origin}${basePath}/pool/${pool.id}` : '';

    const copyToClipboard = () => {
        navigator.clipboard.writeText(poolUrl);
        setSnackMsg('Link copiado!');
        setOpenSnackbar(true);
    };

    const handleLeaveTable = () => {
        //clearTableSession();
        //navigate(`/${restaurantSlug || 'demo'}/menu`);
        if (activeOrders.length > 0 && !isFullyPaid) {
            setConfirmLeaveOpen(true); // Levanta a barreira!
        } else {
            executeLeave(); // Caminho livre
        }
    };

    // Função real que limpa e redireciona
    const executeLeave = () => {
        clearTableSession();
        navigate(`/${restaurantSlug}/menu`);
    };

    const isFullyPaid = pool?.isPaid || false;

    // Pools abertas (PENDENTE) exibidas na seção de pools
    const openPools = allPools.filter(p => p.status === 'PENDENTE');
    // Pools fechadas (CAPTURADO)
    const closedPools = allPools.filter(p => p.status === 'CAPTURADO');

    const statusChip = (status) => {
        if (status === 'PENDENTE') return <Chip label="Aberta" size="small" icon={<Clock size={12} />} sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 800, fontSize: '0.7rem', borderRadius: '8px' }} />;
        if (status === 'CAPTURADO') return <Chip label="Paga" size="small" icon={<CheckCircle size={12} />} sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 800, fontSize: '0.7rem', borderRadius: '8px' }} />;
        return <Chip label={status} size="small" sx={{ borderRadius: '8px' }} />;
    };

    if (activeOrders.length === 0 && allPools.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', mt: 10, px: 3 }}>
                <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
                    <Receipt size={64} color="#CCC" />
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 900, mb: 1, color: 'var(--text-main)' }}>Sua conta está vazia</Typography>
                <Typography variant="body1" sx={{ color: 'var(--text-muted)' }}>Peça itens pelo Menu para começar a acompanhar seus gastos.</Typography>
                <Button
                    variant="contained"
                    onClick={() => navigate('/menu')}
                    sx={{
                        mt: 4, bgcolor: 'var(--primary)', fontWeight: 900, borderRadius: '16px', py: 1.5, px: 4,
                        '&:hover': { bgcolor: 'var(--primary-hover)' }
                    }}
                >
                    Ir ao Menu
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ pb: 8 }}>
            <Typography variant="h4" sx={{ fontWeight: 900, mb: 1, letterSpacing: -1 }}>
                Minha Conta
            </Typography>
            <Typography variant="body1" sx={{ color: 'var(--text-muted)', mb: 4, fontWeight: 500 }}>
                Acompanhe e pague seus pedidos.
            </Typography>

            {/* ─── ITENS DA CONTA ─── */}
            {activeOrders.length > 0 ? (
                <Card
                    elevation={0}
                    sx={{
                        p: 0,
                        borderRadius: '24px',
                        mb: 4,
                        border: '1px solid var(--border-color)',
                        bgcolor: 'var(--card-bg)',
                        overflow: 'hidden'
                    }}
                >
                    <Box sx={{ p: 3, borderBottom: '1px dashed var(--border-color)', bgcolor: '#FDFDFD' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            ITENS SELECIONADOS
                        </Typography>
                    </Box>
                    <List disablePadding>
                        {activeOrders.map((item, index) => (
                            <React.Fragment key={item.orderItemId ?? index}>
                                <ListItem
                                    sx={{
                                        px: 3,
                                        py: 2.5,
                                        alignItems: 'flex-start',
                                        transition: 'bgcolor 0.2s',
                                        '&:hover': { bgcolor: '#FAFAFA' }
                                    }}
                                    onClick={() => handleToggleItemSelection(item.orderItemId)}
                                >
                                    <Checkbox
                                        checked={selectedItemIds.includes(item.orderItemId)}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={() => handleToggleItemSelection(item.orderItemId)}
                                        sx={{
                                            p: 0,
                                            mr: 2,
                                            mt: 0.3,
                                            color: 'var(--border-color)',
                                            '&.Mui-checked': { color: 'var(--primary)' }
                                        }}
                                    />
                                    <ListItemText
                                        secondaryTypographyProps={{ component: 'div' }}

                                        primary={
                                            <Typography sx={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '1rem' }}>
                                                {item.quantity ?? item.quantidade ?? 1}x {item.name}
                                            </Typography>
                                        }
                                        secondary={
                                            <Box sx={{ mt: 0.5 }}>
                                                {(item.selectedAddons?.length > 0 || item.observations) && (
                                                    <Typography variant="caption" sx={{ color: 'var(--text-muted)', display: 'block', mb: 0.5, lineHeight: 1.4 }}>
                                                        {item.selectedAddons?.map(a => a.name).join(', ')}
                                                        {item.observations && ` • "${item.observations}"`}
                                                    </Typography>
                                                )}
                                                <Chip
                                                    label={item.status}
                                                    size="small"
                                                    sx={{
                                                        fontSize: '0.65rem',
                                                        height: 20,
                                                        fontWeight: 800,
                                                        borderRadius: '6px',
                                                        bgcolor: item.status === 'Pronto' ? '#E8F5E9' : '#F5F5F5',
                                                        color: item.status === 'Pronto' ? '#2E7D32' : 'var(--text-muted)'
                                                    }}
                                                />
                                            </Box>
                                        }
                                    />
                                    <Typography sx={{ fontWeight: 900, ml: 2, color: 'var(--text-main)' }}>
                                        R$ {(parseFloat(item.finalPrice ?? item.price ?? 0) * (item.quantity ?? item.quantidade ?? 1)).toFixed(2)}
                                    </Typography>
                                </ListItem>
                                {index < activeOrders.length - 1 && <Divider sx={{ borderStyle: 'solid', mx: 3, borderColor: 'var(--border-color)' }} />}
                            </React.Fragment>
                        ))}

                        <Box sx={{ p: 4, bgcolor: '#FAFAFA', borderTop: '1px dashed var(--border-color)' }}>
                            <Stack spacing={1.5}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography sx={{ color: 'var(--text-muted)', fontWeight: 600 }}>Subtotal</Typography>
                                    <Typography sx={{ fontWeight: 700 }}>R$ {subtotal.toFixed(2)}</Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography sx={{ color: 'var(--text-muted)', fontWeight: 600 }}>Gorjeta Garçom</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <TextField
                                            type="number"
                                            size="small"
                                            value={waiterTipPercent}
                                            onChange={(e) => setWaiterTipPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                                            disabled={!!pool}
                                            sx={{
                                                width: 60,
                                                '& .MuiOutlinedInput-root': {
                                                    borderRadius: '10px',
                                                    height: 32,
                                                    fontSize: '0.85rem',
                                                    fontWeight: 800
                                                }
                                            }}
                                        />
                                        <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>%</Typography>
                                    </Box>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography sx={{ color: 'var(--text-muted)', fontWeight: 600 }}>Taxa do App (3%)</Typography>
                                    <Typography sx={{ fontWeight: 700 }}>R$ {appTax.toFixed(2)}</Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 2, borderTop: '2px solid var(--border-color)' }}>
                                    <Typography variant="h6" sx={{ fontWeight: 900 }}>Total</Typography>
                                    <Typography variant="h6" sx={{ fontWeight: 900, color: 'var(--primary)' }}>R$ {total.toFixed(2)}</Typography>
                                </Box>
                            </Stack>
                        </Box>
                    </List>
                </Card>
            ) : (
                <Box sx={{
                    p: 4, borderRadius: '24px', mb: 4,
                    bgcolor: '#E8F5E9', border: '1px solid #C8E6C9',
                    textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1
                }}>
                    <CheckCircle size={32} color="#2e7d32" />
                    <Typography variant="h6" sx={{ fontWeight: 900, color: '#2e7d32' }}>Tudo Pago!</Typography>
                    <Typography variant="body2" sx={{ color: '#2e7d32', opacity: 0.8 }}>Não há itens pendentes de pagamento.</Typography>
                </Box>
            )}

            {/* ─── POOL ATIVA (PENDENTE) ─── */}
            {activeOrders.length > 0 && (
                !pool ? (
                    <Card elevation={0} sx={{ p: 4, borderRadius: '24px', mb: 4, border: '1px solid var(--border-color)', bgcolor: 'var(--card-bg)' }}>
                        <Stack spacing={3}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Box sx={{ p: 1.5, bgcolor: '#FFF5E6', borderRadius: '14px', color: 'var(--primary)' }}>
                                    <Users2 size={28} />
                                </Box>
                                <Box>
                                    <Typography variant="h6" sx={{ fontWeight: 900, color: 'var(--text-main)' }}>Dividir Conta</Typography>
                                    <Typography variant="body2" sx={{ color: 'var(--text-muted)' }}>Crie um grupo para dividir o valor integral ou parcial.</Typography>
                                </Box>
                            </Box>

                            <TextField
                                fullWidth
                                label="Quanto você paga agora?"
                                placeholder="0.00"
                                type="number"
                                value={myPayment}
                                onChange={(e) => {
                                    let val = parseFloat(e.target.value);
                                    if (val > total) val = total;
                                    setMyPayment(isNaN(val) ? '' : val.toString());
                                }}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start" sx={{ fontWeight: 800 }}>R$</InputAdornment>,
                                    sx: { borderRadius: '16px', fontWeight: 900, fontSize: '1.1rem' }
                                }}
                            />

                            <Button
                                variant="outlined"
                                fullWidth
                                size="large"
                                startIcon={<Share2 size={24} />}
                                onClick={handleCreatePool}
                                sx={{
                                    borderRadius: '16px',
                                    borderColor: 'var(--primary)',
                                    color: 'var(--primary)',
                                    fontWeight: 900,
                                    py: 2.2,
                                    fontSize: '1rem',
                                    borderWidth: 2,
                                    '&:hover': { borderWidth: 2, borderColor: 'var(--primary-hover)', bgcolor: '#FFF9F2' }
                                }}
                            >
                                Compartilhar e Dividir
                            </Button>
                        </Stack>
                    </Card>
                ) : (
                    <Card
                        elevation={0}
                        sx={{
                            p: 4, borderRadius: '32px', mb: 4,
                            border: '2px solid var(--primary)',
                            textAlign: 'center',
                            bgcolor: 'var(--card-bg)',
                            boxShadow: '0 20px 40px rgba(255,140,0,0.1)'
                        }}
                    >
                        <Typography variant="h5" sx={{ fontWeight: 900, mb: 1 }}>Pool Ativa 🔥</Typography>
                        <Typography variant="body2" sx={{ color: 'var(--text-muted)', mb: 3 }}>Aguardando contribuições do grupo</Typography>

                        <Box sx={{
                            p: 2, bgcolor: '#FFF', borderRadius: '24px',
                            display: 'inline-block', mb: 3,
                            border: '1px solid var(--border-color)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                        }}>
                            <QRCodeSVG value={poolUrl} size={160} />
                        </Box>

                        <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'var(--text-main)', mb: 1 }}>Envie o link para seus amigos:</Typography>
                        <Box sx={{
                            display: 'flex', alignItems: 'center', bgcolor: '#F5F5F5',
                            p: 1, borderRadius: '16px', mb: 4, border: '1px solid var(--border-color)'
                        }}>
                            <Typography variant="caption" sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', px: 1, fontWeight: 600 }}>
                                {poolUrl}
                            </Typography>
                            <IconButton onClick={copyToClipboard} sx={{ bgcolor: '#FFF', borderRadius: '12px' }}><Copy size={18} /></IconButton>
                        </Box>

                        <Stack direction="row" spacing={2}>
                            <Box sx={{ flex: 1, p: 2, bgcolor: '#FFF9F2', borderRadius: '20px', border: '1px solid #FFE0B2' }}>
                                <Typography variant="caption" sx={{ color: 'var(--primary)', fontWeight: 800, display: 'block' }}>TOTAL</Typography>
                                <Typography variant="h6" sx={{ fontWeight: 900 }}>R$ {pool.totalAmount?.toFixed(2)}</Typography>
                            </Box>
                            <Box sx={{ flex: 1, p: 2, bgcolor: '#F0F0F0', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
                                <Typography variant="caption" sx={{ color: 'var(--text-muted)', fontWeight: 800, display: 'block' }}>RESTANTE</Typography>
                                <Typography variant="h6" sx={{ fontWeight: 900 }}>R$ {pool.remainingAmount?.toFixed(2)}</Typography>
                            </Box>
                        </Stack>

                        {pool.items?.length > 0 && (
                            <Box sx={{ mt: 4, textAlign: 'left' }}>
                                <Typography variant="caption" sx={{ fontWeight: 900, color: 'var(--text-muted)', mb: 2, display: 'block' }}>ITENS NA POOL:</Typography>
                                {pool.items.map((item) => (
                                    <Box key={item.orderItemId} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.2, borderBottom: '1px solid #F5F5F5' }}>
                                        <Typography sx={{ fontWeight: 800, fontSize: '0.85rem' }}>{item.quantity}x {item.name}</Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <Typography sx={{ fontWeight: 900, fontSize: '0.9rem' }}>R$ {parseFloat(item.finalPrice).toFixed(2)}</Typography>
                                            <IconButton size="small" onClick={() => handleRemoveItemFromPool(pool.id, item.orderItemId)} sx={{ color: '#FF5252', bgcolor: '#FFF0F0' }}>
                                                <Trash2 size={14} />
                                            </IconButton>
                                        </Box>
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Card>
                )
            )}

            {/* ─── AÇÕES DE PAGAMENTO ─── */}
            {activeOrders.length > 0 && !isFullyPaid && (
                <Button
                    variant="contained"
                    fullWidth
                    disabled={!!pool}
                    startIcon={<CreditCard size={24} />}
                    onClick={handleStripeCheckout}
                    sx={{
                        height: 70, fontSize: '1.1rem', bgcolor: 'var(--secondary)',
                        borderRadius: '20px', fontWeight: 900,
                        boxShadow: '0 12px 24px rgba(0,0,0,0.2)',
                        '&:hover': { bgcolor: '#000', transform: 'translateY(-2px)' },
                        '&.Mui-disabled': { bgcolor: '#EEEEEE', color: '#999' }
                    }}
                >
                    {pool ? 'Pool Ativa' : 'Pagar Tudo no Cartão'}
                </Button>
            )}

            {isFullyPaid && (
                <Button
                    variant="contained"
                    fullWidth
                    startIcon={<LogOut size={24} />}
                    onClick={handleLeaveTable}
                    sx={{
                        height: 70, fontSize: '1.2rem', bgcolor: '#2E7D32',
                        borderRadius: '20px', fontWeight: 900,
                        '&:hover': { bgcolor: '#1B5E20' }
                    }}
                >
                    Mesa Paga — Sair agora
                </Button>
            )}

            {/* ─── HISTÓRICO DE POOLS ─── */}
            {allPools.length > 0 && (
                <Box sx={{ mt: 6 }}>
                    <Typography variant="h6" sx={{ fontWeight: 900, mb: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Users2 size={24} color="var(--primary)" /> Pagamentos em Grupo
                    </Typography>
                    <Stack spacing={2}>
                        {allPools.map((p) => (
                            <Accordion
                                key={p.id}
                                elevation={0}
                                disableGutters
                                sx={{
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '20px !important',
                                    bgcolor: 'var(--card-bg)',
                                    overflow: 'hidden',
                                    '&:before': { display: 'none' }
                                }}
                            >
                                <AccordionSummary expandIcon={<ChevronDown size={20} />}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', pr: 1 }}>
                                        {statusChip(p.status)}
                                        <Typography variant="body2" sx={{ fontWeight: 800, flexGrow: 1 }}>Pool #{p.id}</Typography>
                                        <Typography sx={{ fontWeight: 900, color: p.status === 'CAPTURADO' ? '#2e7d32' : 'var(--primary)' }}>
                                            R$ {p.totalAmount?.toFixed(2)}
                                        </Typography>
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails sx={{ bgcolor: '#F9F9F9', p: 3, pt: 0 }}>
                                    <Divider sx={{ mb: 2 }} />
                                    {p.items?.length > 0 && (
                                        <Box sx={{ mb: 2.5 }}>
                                            <Typography variant="caption" sx={{ fontWeight: 900, color: 'var(--text-muted)', display: 'block', mb: 1 }}>ITENS NESTA POOL:</Typography>
                                            {p.items.map((item) => (
                                                <Box key={item.orderItemId} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{item.quantity}x {item.name}</Typography>
                                                    <Typography variant="caption" sx={{ fontWeight: 800 }}>R$ {parseFloat(item.finalPrice).toFixed(2)}</Typography>
                                                </Box>
                                            ))}
                                        </Box>
                                    )}
                                    {p.contributions?.length > 0 ? (
                                        <Box sx={{ mb: 2 }}>
                                            <Typography variant="caption" sx={{ fontWeight: 900, color: 'var(--text-muted)', mb: 1, display: 'block' }}>CONTRIBUIÇÕES:</Typography>
                                            {p.contributions.map((c, i) => (
                                                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                                    <Typography variant="caption" sx={{ fontWeight: 800 }}>{c.contributorName}</Typography>
                                                    <Typography variant="caption" sx={{ color: '#2e7d32', fontWeight: 900 }}>+ R$ {c.amount?.toFixed(2)}</Typography>
                                                </Box>
                                            ))}
                                        </Box>
                                    ) : (
                                        <Typography variant="caption" sx={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhuma contribuição ainda.</Typography>
                                    )}
                                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #EEE', display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="caption" sx={{ fontWeight: 800 }}>Total Pago: R$ {p.paid?.toFixed(2)}</Typography>
                                        <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--primary)' }}>Falta: R$ {p.remainingAmount?.toFixed(2)}</Typography>
                                    </Box>
                                    {p.status === 'PENDENTE' && (
                                        <Button
                                            variant="contained" fullWidth size="small"
                                            onClick={() => navigate(`${basePath}/pool/${p.id}`)}
                                            sx={{ mt: 2.5, borderRadius: '12px', bgcolor: 'var(--primary)', fontWeight: 900 }}
                                        >
                                            Pagar minha parte →
                                        </Button>
                                    )}
                                </AccordionDetails>
                            </Accordion>
                        ))}
                    </Stack>
                </Box>
            )}

            <Button
                variant="text"
                fullWidth
                onClick={handleLeaveTable}
                startIcon={<LogOut size={18} />}
                sx={{ mt: 8, color: 'var(--text-muted)', fontWeight: 800, textTransform: 'none', '&:hover': { color: '#FF5252' } }}
            >
                Sair desta mesa
            </Button>

            <Snackbar
                open={openSnackbar}
                autoHideDuration={3000}
                onClose={() => setOpenSnackbar(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity="success" sx={{ width: '100%', borderRadius: '16px', fontWeight: 800, boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }}>{snackMsg}</Alert>
            </Snackbar>

            {/* Modal de Confirmação de Saída (Fricção Psicológica) */}
            <Dialog
                open={confirmLeaveOpen}
                onClose={() => setConfirmLeaveOpen(false)}
                PaperProps={{ sx: { borderRadius: '24px', p: 1 } }}
            >
                <DialogTitle sx={{ fontWeight: 900, color: '#FF5252', textAlign: 'center', pb: 1 }}>
                    Sair da Mesa?
                </DialogTitle>
                <DialogContent sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                        <Box sx={{ p: 2, bgcolor: '#FFF0F0', borderRadius: '50%' }}>
                            <LogOut size={32} color="#FF5252" />
                        </Box>
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 800, mb: 1 }}>
                        Ainda existem itens não pagos nesta mesa.
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Ao sair, você perderá o acesso a esta conta. Certifique-se de que <b>alguém na mesa fará o pagamento</b> do valor restante.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ flexDirection: 'column', px: 3, pb: 3, gap: 1 }}>
                    <Button
                        fullWidth
                        variant="contained"
                        onClick={() => setConfirmLeaveOpen(false)}
                        sx={{ bgcolor: 'var(--primary)', fontWeight: 800, borderRadius: '12px', py: 1.5, '&:hover': { bgcolor: 'var(--primary-hover)' } }}
                    >
                        Ficar na Mesa
                    </Button>
                    <Button
                        fullWidth
                        variant="text"
                        color="error"
                        onClick={() => {
                            setConfirmLeaveOpen(false);
                            executeLeave();
                        }}
                        sx={{ fontWeight: 700, textTransform: 'none' }}
                    >
                        Estou ciente, quero sair
                    </Button>
                </DialogActions>
            </Dialog>

        </Box>
    );
};

export default Bill;
