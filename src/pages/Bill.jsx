import React, { useState, useEffect, useRef } from 'react';
import {
    Typography,
    Box,
    List,
    ListItem,
    ListItemText,
    Divider,
    Stack,
    Button,
    TextField,
    Card,
    InputAdornment,
    IconButton,
    Snackbar,
    Alert,
    Chip,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Checkbox,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from '@mui/material';
import { CreditCard, Users2, Copy, Share2, LogOut, ChevronDown, CheckCircle, Clock, Receipt, CheckSquare, Square } from 'lucide-react';
import { getOrders, createPool, getPoolBySession, getAllPools, startPoolCheckout } from '../utils/orderStore';
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
    const [pool, setPool] = useState(null);
    const [allPools, setAllPools] = useState([]);
    const [openSnackbar, setOpenSnackbar] = useState(false);
    const [snackMsg, setSnackMsg] = useState('');
    const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

    // 🚀 MUDANÇA: A seleção agora é ESTRITAMENTE LOCAL. Não sincronizamos mais com o backend!
    const [selectedItemIds, setSelectedItemIds] = useState([]);

    const initializedRef = useRef(false);

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



            if (!initializedRef.current && allOrders.length > 0) {
                // Pega os pagos diretamente do histórico novo para evitar dados velhos
                const currentPaidIds = poolHistory
                    .filter(p => p.status === 'CAPTURADO')
                    .flatMap(p => p.items?.map(i => i.orderItemId) ?? []);

                const activeIds = allOrders
                    .filter(o => o.status !== 'Cancelado' && !currentPaidIds.includes(o.orderItemId))
                    .map(o => o.orderItemId);

                setSelectedItemIds(activeIds);
                initializedRef.current = true; // Trava a porta! Nunca mais sobrescreve sozinho.
            }
        };

        fetchData();
        const intervalId = setInterval(fetchData, 15000);
        return () => clearInterval(intervalId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paidItemIds.length]); // Removido as dependências que causavam o "efeito fantasma"

    const activeOrders = orders.filter(o => o.status !== 'Cancelado' && !paidItemIds.includes(o.orderItemId));
    const selectedOrders = activeOrders.filter(o => selectedItemIds.includes(o.orderItemId));

    const subtotal = selectedOrders.reduce((acc, item) =>
        acc + (parseFloat(item.finalPrice ?? item.price ?? 0) * (item.quantity ?? item.quantidade ?? 1)), 0);
    const waiterTip = subtotal * (waiterTipPercent / 100);
    const appTax = subtotal * 0.03;
    const total = subtotal + waiterTip + appTax;

    // 🚀 MUDANÇA: Função simplificada, apenas altera o estado visual da tela do usuário
    const handleToggleItemSelection = (itemId) => {
        setSelectedItemIds(prev =>
            prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
        );
    };

    const handleSelectAll = () => setSelectedItemIds(activeOrders.map(o => o.orderItemId));
    const handleSelectNone = () => setSelectedItemIds([]);

    const handleCreatePool = async () => {
        const payAmount = parseFloat(myPayment) || 0;
        const session = getTableSession();
        if (!session) return alert('Não há mesa vinculada.');

        try {
            const orderItemIds = selectedItemIds.filter(Boolean);
            if (orderItemIds.length === 0 && payAmount === 0) {
                return alert('Selecione itens ou digite um valor para dividir a conta.');
            }

            const newPool = await createPool(total, payAmount, session.sessionId, orderItemIds);
            setPool(newPool);
            setSnackMsg('Vaquinha da mesa iniciada!');
            setOpenSnackbar(true);
        } catch (e) {
            alert(e.message || 'Erro ao criar Pool.');
        }
    };

    const handleStripeCheckout = async () => {
        const session = getTableSession();
        const user = getCurrentUser();
        if (!session) return alert('Não há mesa vinculada.');
        if (selectedOrders.length === 0) return alert('Selecione os itens que deseja pagar.');

        // 🔥 A CORREÇÃO: Forçamos a captura do slug lendo o primeiro pedaço da URL ou da sessão
        const currentSlug = typeof restaurantSlug !== 'undefined' ? restaurantSlug : (session?.restaurantSlug || window.location.pathname.split('/')[1]);
        const currentTableId = typeof tableId !== 'undefined' ? tableId : (session?.tableId || 'mesa');

        try {
            const orderItemIds = selectedItemIds.filter(Boolean);
            const newPool = await createPool(total, total, session.sessionId, orderItemIds);

            const { url } = await startPoolCheckout({
                poolId: newPool.id,
                amount: total,
                contributorName: user?.nome_completo || 'Cliente',
                itemName: `Pagamento Mesa ${session.tableIdentifier}`,
                userId: user?.id,
                type: 'direct',
                restaurantSlug: currentSlug, // <-- Passando a variável segura
                tableId: currentTableId      // <-- Passando a variável segura
            });
            window.location.href = url;
        } catch (err) {
            alert(`Erro no pagamento: ${err.message}`);
        }
    };

    const handleLeaveTable = () => {
        if (activeOrders.length > 0 && !isFullyPaid) {
            setConfirmLeaveOpen(true);
        } else {
            executeLeave();
        }
    };

    const executeLeave = () => {
        clearTableSession();
        navigate(`/${restaurantSlug}/menu`);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(pool ? `${window.location.origin}${basePath}/pool/${pool.id}` : '');
        setSnackMsg('Link copiado!');
        setOpenSnackbar(true);
    };

    const isFullyPaid = pool?.isPaid || false;
    const poolUrl = pool ? `${window.location.origin}${basePath}/pool/${pool.id}` : '';

    if (activeOrders.length === 0 && allPools.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', mt: 10, px: 3 }}>
                <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}><Receipt size={64} color="#CCC" /></Box>
                <Typography variant="h5" sx={{ fontWeight: 900, mb: 1, color: 'var(--text-main)' }}>Conta vazia</Typography>
                <Typography variant="body1" sx={{ color: 'var(--text-muted)' }}>Peça itens pelo Menu para começar.</Typography>

                <Stack spacing={2} sx={{ mt: 4, alignItems: 'center' }}>
                    <Button
                        variant="contained"
                        onClick={() => navigate(`${basePath}/menu`)}
                        sx={{ bgcolor: 'var(--primary)', fontWeight: 900, borderRadius: '16px', py: 1.5, px: 4, width: '100%', maxWidth: '250px' }}
                    >
                        Ir ao Menu
                    </Button>

                    {/* 🚀 O BOTÃO DE FUGA ADICIONADO AQUI! */}
                    <Button
                        variant="text"
                        onClick={executeLeave}
                        startIcon={<LogOut size={18} />}
                        sx={{ color: '#FF5252', fontWeight: 800, textTransform: 'none', '&:hover': { bgcolor: '#FFF0F0' } }}
                    >
                        Sair desta mesa
                    </Button>
                </Stack>
            </Box>
        );
    }

    return (
        <Box sx={{ pb: 8 }}>
            <Typography variant="h4" sx={{ fontWeight: 900, mb: 1, letterSpacing: -1 }}>Minha Conta</Typography>
            <Typography variant="body1" sx={{ color: 'var(--text-muted)', mb: 4, fontWeight: 500 }}>Acompanhe e selecione o que vai pagar.</Typography>

            {/* ITENS DA CONTA */}
            {activeOrders.length > 0 ? (
                <Card elevation={0} sx={{ p: 0, borderRadius: '24px', mb: 4, border: '1px solid var(--border-color)', bgcolor: 'var(--card-bg)', overflow: 'hidden' }}>
                    <Box sx={{ p: 3, borderBottom: '1px dashed var(--border-color)', bgcolor: '#FDFDFD', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'var(--text-muted)' }}>SELECIONE SEUS ITENS</Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <IconButton size="small" onClick={handleSelectAll}><CheckSquare size={18} color="var(--primary)" /></IconButton>
                            <IconButton size="small" onClick={handleSelectNone}><Square size={18} color="var(--text-muted)" /></IconButton>
                        </Box>
                    </Box>
                    <List disablePadding>
                        {activeOrders.map((item, index) => (
                            <React.Fragment key={item.orderItemId ?? index}>
                                <ListItem sx={{ px: 3, py: 2.5, alignItems: 'flex-start', cursor: 'pointer', '&:hover': { bgcolor: '#FAFAFA' } }} onClick={() => handleToggleItemSelection(item.orderItemId)}>
                                    <Checkbox checked={selectedItemIds.includes(item.orderItemId)} sx={{ p: 0, mr: 2, mt: 0.3, color: 'var(--border-color)', '&.Mui-checked': { color: 'var(--primary)' } }} />
                                    <ListItemText
                                        secondaryTypographyProps={{ component: 'div' }}
                                        primary={<Typography sx={{ fontWeight: 800, color: 'var(--text-main)' }}>{item.quantity ?? 1}x {item.name}</Typography>}
                                        secondary={
                                            <Box sx={{ mt: 0.5 }}>
                                                <Chip label={item.status} size="small" sx={{ fontSize: '0.65rem', height: 20, fontWeight: 800, borderRadius: '6px', bgcolor: item.status === 'Pronto' ? '#E8F5E9' : '#F5F5F5', color: item.status === 'Pronto' ? '#2E7D32' : 'var(--text-muted)' }} />
                                            </Box>
                                        }
                                    />
                                    <Typography sx={{ fontWeight: 900, ml: 2 }}>R$ {(parseFloat(item.finalPrice ?? item.price ?? 0) * (item.quantity ?? 1)).toFixed(2)}</Typography>
                                </ListItem>
                                {index < activeOrders.length - 1 && <Divider sx={{ mx: 3 }} />}
                            </React.Fragment>
                        ))}

                        <Box sx={{ p: 4, bgcolor: '#FAFAFA', borderTop: '1px dashed var(--border-color)' }}>
                            <Stack spacing={1.5}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography sx={{ color: 'var(--text-muted)', fontWeight: 600 }}>Subtotal</Typography><Typography sx={{ fontWeight: 700 }}>R$ {subtotal.toFixed(2)}</Typography></Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography sx={{ color: 'var(--text-muted)', fontWeight: 600 }}>Gorjeta Garçom</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <TextField type="number" size="small" value={waiterTipPercent} onChange={(e) => setWaiterTipPercent(Math.max(0, parseFloat(e.target.value) || 0))} sx={{ width: 60, '& .MuiOutlinedInput-root': { borderRadius: '10px', height: 32, fontWeight: 800 } }} />
                                        <Typography sx={{ fontWeight: 800 }}>%</Typography>
                                    </Box>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography sx={{ color: 'var(--text-muted)', fontWeight: 600 }}>Taxa do App (3%)</Typography><Typography sx={{ fontWeight: 700 }}>R$ {appTax.toFixed(2)}</Typography></Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 2, borderTop: '2px solid var(--border-color)' }}>
                                    <Typography variant="h6" sx={{ fontWeight: 900 }}>Total Selecionado</Typography>
                                    <Typography variant="h6" sx={{ fontWeight: 900, color: 'var(--primary)' }}>R$ {total.toFixed(2)}</Typography>
                                </Box>
                            </Stack>
                        </Box>
                    </List>
                </Card>
            ) : (
                <Box sx={{ p: 4, borderRadius: '24px', mb: 4, bgcolor: '#E8F5E9', border: '1px solid #C8E6C9', textAlign: 'center' }}>
                    <CheckCircle size={32} color="#2e7d32" style={{ margin: '0 auto' }} />
                    <Typography variant="h6" sx={{ fontWeight: 900, color: '#2e7d32', mt: 1 }}>Tudo Pago!</Typography>
                </Box>
            )}

            {/* AÇÕES DE PAGAMENTO RÁPIDO */}
            {activeOrders.length > 0 && !isFullyPaid && (
                <Stack spacing={2} sx={{ mb: 4 }}>
                    <Button variant="contained" fullWidth onClick={handleStripeCheckout} sx={{ height: 60, fontSize: '1.1rem', bgcolor: 'var(--primary)', borderRadius: '16px', fontWeight: 900, '&:hover': { bgcolor: 'var(--primary-hover)' } }}>
                        Pagar Meus Itens Agora
                    </Button>

                    {/* DIVIDIR COM A MESA */}
                    <Card elevation={0} sx={{ p: 3, borderRadius: '20px', border: '1px solid var(--border-color)' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}><Users2 size={20} /> Dividir com a mesa</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Crie uma vaquinha para o restante da mesa ajudar a pagar.</Typography>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField fullWidth placeholder="Valor (Opcional)" value={myPayment} onChange={(e) => setMyPayment(e.target.value)} size="small" InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment>, sx: { borderRadius: '12px', fontWeight: 800 } }} />
                            <Button variant="outlined" onClick={handleCreatePool} sx={{ borderRadius: '12px', fontWeight: 900, px: 3, color: 'var(--text-main)', borderColor: 'var(--border-color)' }}>Criar</Button>
                        </Box>
                    </Card>
                </Stack>
            )}

            {/* POOL ATIVA (VAQUINHA) */}
            {pool && !isFullyPaid && (
                <Card elevation={0} sx={{ p: 4, borderRadius: '32px', mb: 4, border: '2px solid var(--primary)', textAlign: 'center', bgcolor: 'var(--card-bg)' }}>
                    <Typography variant="h5" sx={{ fontWeight: 900, mb: 1 }}>Vaquinha Ativa 🔥</Typography>
                    <Box sx={{ p: 2, bgcolor: '#FFF', borderRadius: '24px', display: 'inline-block', mb: 2, border: '1px solid var(--border-color)' }}>
                        <QRCodeSVG value={poolUrl} size={140} />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#F5F5F5', p: 1, borderRadius: '16px', mb: 3 }}>
                        <Typography variant="caption" sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', px: 1, fontWeight: 600 }}>{poolUrl}</Typography>
                        <IconButton onClick={copyToClipboard} sx={{ bgcolor: '#FFF', borderRadius: '12px' }}><Copy size={18} /></IconButton>
                    </Box>
                    <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
                        <Box sx={{ flex: 1, p: 2, bgcolor: '#FFF9F2', borderRadius: '20px' }}>
                            <Typography variant="caption" sx={{ color: 'var(--primary)', fontWeight: 800 }}>TOTAL</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 900 }}>R$ {pool.totalAmount?.toFixed(2)}</Typography>
                        </Box>
                        <Box sx={{ flex: 1, p: 2, bgcolor: '#F0F0F0', borderRadius: '20px' }}>
                            <Typography variant="caption" sx={{ color: 'var(--text-muted)', fontWeight: 800 }}>FALTA</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 900 }}>R$ {pool.remainingAmount?.toFixed(2)}</Typography>
                        </Box>
                    </Stack>
                    <Button variant="contained" fullWidth onClick={() => navigate(`${basePath}/pool/${pool.id}`)} sx={{ height: 50, borderRadius: '16px', bgcolor: 'var(--primary)', fontWeight: 900 }}>
                        Entrar na Vaquinha →
                    </Button>
                </Card>
            )}

            {/* HISTÓRICO DE PAGAMENTOS */}
            {allPools.length > 0 && (
                <Box sx={{ mt: 4 }}>
                    <Typography variant="h6" sx={{ fontWeight: 900, mb: 2 }}>Pagamentos Efetuados</Typography>
                    <Stack spacing={2}>
                        {allPools.map((p) => (
                            <Accordion key={p.id} elevation={0} disableGutters sx={{ border: '1px solid var(--border-color)', borderRadius: '20px !important', '&:before': { display: 'none' } }}>
                                <AccordionSummary expandIcon={<ChevronDown size={20} />}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                                        <Chip label={p.status === 'CAPTURADO' ? 'Pago' : 'Aberta'} size="small" sx={{ bgcolor: p.status === 'CAPTURADO' ? '#E8F5E9' : '#FFF3E0', color: p.status === 'CAPTURADO' ? '#2E7D32' : '#E65100', fontWeight: 800 }} />
                                        <Typography variant="body2" sx={{ fontWeight: 800, flexGrow: 1 }}>Vaquinha #{p.id}</Typography>
                                        <Typography sx={{ fontWeight: 900 }}>R$ {p.totalAmount?.toFixed(2)}</Typography>
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails sx={{ bgcolor: '#FAFAFA', pt: 0 }}>
                                    {p.contributions?.map((c, i) => (
                                        <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #EEE' }}>
                                            <Typography variant="caption" sx={{ fontWeight: 800 }}>{c.contributorName}</Typography>
                                            <Typography variant="caption" sx={{ color: '#2e7d32', fontWeight: 900 }}>+ R$ {c.amount?.toFixed(2)}</Typography>
                                        </Box>
                                    ))}
                                </AccordionDetails>
                            </Accordion>
                        ))}
                    </Stack>
                </Box>
            )}

            <Button variant="text" fullWidth onClick={handleLeaveTable} startIcon={<LogOut size={18} />} sx={{ mt: 8, color: 'var(--text-muted)', fontWeight: 800 }}>Sair desta mesa</Button>
            <Snackbar open={openSnackbar} autoHideDuration={3000} onClose={() => setOpenSnackbar(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <Alert severity="success" sx={{ borderRadius: '16px', fontWeight: 800 }}>{snackMsg}</Alert>
            </Snackbar>

            {/* Modal Sair da Mesa */}
            <Dialog open={confirmLeaveOpen} onClose={() => setConfirmLeaveOpen(false)} PaperProps={{ sx: { borderRadius: '24px', p: 1 } }}>
                <DialogTitle sx={{ fontWeight: 900, color: '#FF5252', textAlign: 'center' }}>Sair da Mesa?</DialogTitle>
                <DialogContent sx={{ textAlign: 'center' }}>
                    <Typography variant="body1" sx={{ fontWeight: 800 }}>Ainda existem itens não pagos.</Typography>
                    <Typography variant="body2" color="text.secondary">Alguém na mesa precisará assumir este valor.</Typography>
                </DialogContent>
                <DialogActions sx={{ flexDirection: 'column', px: 3, pb: 3, gap: 1 }}>
                    <Button fullWidth variant="contained" onClick={() => setConfirmLeaveOpen(false)} sx={{ bgcolor: 'var(--primary)', fontWeight: 800, borderRadius: '12px', py: 1.5 }}>Ficar na Mesa</Button>
                    <Button fullWidth variant="text" color="error" onClick={executeLeave} sx={{ fontWeight: 700 }}>Estou ciente, sair</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default Bill;